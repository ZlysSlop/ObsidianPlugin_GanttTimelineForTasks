import { FileView, Menu, Notice, TFile, WorkspaceLeaf } from "obsidian";
import {
	TIMELINE_LABEL_COLUMN_PX,
	TIMELINE_VIEW_TYPE,
	ZLY_TIMELINE_EXTENSION,
} from "./constants";
import {
	addDays,
	clampDateOrder,
	daysBetweenInclusive,
	formatYmd,
	fractionOfLocalDayElapsed,
	parseYmd,
	todayYmd,
} from "./dateUtils";
import { barAccentLikeGradient } from "./colorUi";
import { firstGrapheme } from "./emojiUtils";
import { TaskEditModal } from "./TaskEditModal";
import type { EmojiPickerCategoryForModal } from "./emojiPickerRuntime";
import type { TaskStateDefinition } from "./settingsData";
import type { TimelinePlannerData, TimelineTask } from "./types";
import { DisplayedTexts } from "./DisplayedTexts";
import {
	createEmptyPlannerData,
	readTimelineZlyFile,
} from "./timelineStorage";

export { TIMELINE_VIEW_TYPE };

function moveInArray<T>(arr: T[], from: number, to: number): void {
	if (from === to) return;
	if (from < 0 || from >= arr.length) return;
	if (to < 0 || to >= arr.length) return;
	const [item] = arr.splice(from, 1);
	arr.splice(to, 0, item);
}

export class TimelineView extends FileView {
	private static readonly ZOOM_MIN = 16;
	private static readonly ZOOM_MAX = 80;
	private static readonly ZOOM_STEP = 4;
	/** Bar drag: movement past this picks vertical reorder vs horizontal date move. */
	private static readonly PENDING_BAR_DRAG_PX = 6;
	/** Empty track: movement past this starts a rubber-band (marquee) selection. */
	private static readonly MARQUEE_DRAG_PX = 4;
	/** Limits trackpad “pinch as ctrl+wheel” from jumping zoom too fast. */
	private static readonly WHEEL_ZOOM_MIN_INTERVAL_MS = 90;

	data: TimelinePlannerData;
	private filePathLabelEl: HTMLElement | null = null;
	private rootEl!: HTMLElement;
	/** Scrollport for the grid + task rows (right-drag pans this element). */
	private scrollEl: HTMLElement | null = null;
	private mainWrapEl: HTMLElement | null = null;
	private headerRowEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private readonly api: {
		persist: (v: TimelineView) => Promise<void>;
		getDefaultTaskBarColor: () => string;
		getTaskStates: () => TaskStateDefinition[];
		getTaskBarStackLayoutBreakpointPx: () => number;
		getEmojiPickerCategories: () => EmojiPickerCategoryForModal[];
	};
	/** Task ids selected with Ctrl/Cmd+click on bars — moved together when you drag or use nudge buttons. */
	private readonly selectedTaskIds = new Set<string>();
	private dragState:
		| {
				mode: "move" | "resize-left" | "resize-right";
				taskId: string;
				startX: number;
				origStart: Date;
				origEnd: Date;
				/** Present for `move`: all tasks that move together (same day delta from drag start). */
				groupOrigins?: Map<
					string,
					{ origStart: Date; origEnd: Date }
				>;
		  }
		| {
				mode: "pending-bar";
				taskId: string;
				startX: number;
				startY: number;
				origStart: Date;
				origEnd: Date;
		  }
		| { mode: "reorder"; taskId: string }
		| null = null;
	/** OS-style drag box on empty timeline track; `phase` upgrades from pointer-down to drag. */
	private marqueeState:
		| null
		| {
				phase: "pending";
				startX: number;
				startY: number;
				additive: boolean;
		  }
		| {
				phase: "dragging";
				startX: number;
				startY: number;
				curX: number;
				curY: number;
				additive: boolean;
		  } = null;
	private marqueeOverlayEl: HTMLElement | null = null;
	/** Right-drag: vertical = scroll tasks; horizontal = shift visible day range. */
	private panState: {
		startX: number;
		startY: number;
		initialRangeStart: string;
		initialScrollTop: number;
	} | null = null;
	private lastWheelZoomAt = 0;
	private resizeObserver: ResizeObserver | null = null;
	private resizePersistTimer: number | null = null;
	/** Coalesce horizontal pan repaints to one per animation frame. */
	private panRedrawRafId: number | null = null;
	/** Coalesce task move/resize repaints to one per animation frame. */
	private dragRedrawRafId: number | null = null;
	/** Single `html` class for document cursor override; only mutate when this changes. */
	private appliedDocumentCursorClass: string | null = null;
	/** Task-state picker: at most one menu; same-button click toggles closed. */
	private taskStateMenu: Menu | null = null;
	private taskStateMenuAnchor: HTMLElement | null = null;
	/** Cleared on each `redraw` so detached task bars don’t leak observers. */
	private readonly taskBarStackObservers: ResizeObserver[] = [];

	constructor(
		leaf: WorkspaceLeaf,
		api: {
			persist: (v: TimelineView) => Promise<void>;
			getDefaultTaskBarColor: () => string;
			getTaskStates: () => TaskStateDefinition[];
			getTaskBarStackLayoutBreakpointPx: () => number;
			getEmojiPickerCategories: () => EmojiPickerCategoryForModal[];
		}
	) {
		super(leaf);
		this.api = api;
		this.data = createEmptyPlannerData();
		this.navigation = true;
	}

	getViewType(): string {
		return TIMELINE_VIEW_TYPE;
	}

	canAcceptExtension(extension: string): boolean {
		return extension === ZLY_TIMELINE_EXTENSION;
	}

	getTimelineFile(): TFile | null {
		return this.file;
	}

	ownsFilePath(path: string): boolean {
		return this.file?.path === path;
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : DisplayedTexts.timeline.viewTitle;
	}

	getIcon(): string {
		return "calendar-range";
	}

	private updateToolbarPath(): void {
		if (!this.filePathLabelEl) return;
		this.filePathLabelEl.setText(
			this.file?.path ?? DisplayedTexts.timeline.filePathPlaceholder
		);
	}

	private async loadDataFromFile(file: TFile): Promise<void> {
		const parsed = await readTimelineZlyFile(this.app, file);
		if (parsed) {
			Object.assign(this.data, parsed);
			this.data.tasks = parsed.tasks.slice();
		} else {
			this.data = createEmptyPlannerData();
			new Notice(
				DisplayedTexts.timeline.noticeParseError(ZLY_TIMELINE_EXTENSION)
			);
		}
	}

	async onLoadFile(file: TFile): Promise<void> {
		await this.loadDataFromFile(file);
		this.updateToolbarPath();
		if (this.headerRowEl) {
			this.redraw();
		}
	}

	async onUnloadFile(_file: TFile): Promise<void> {
		this.selectedTaskIds.clear();
		this.endMarqueeGesture();
	}

	async reloadFromDisk(): Promise<void> {
		if (!this.file) return;
		await this.loadDataFromFile(this.file);
		this.redraw();
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass("timeline-planner-container");

		this.rootEl = this.containerEl.createDiv({ cls: "timeline-planner-root" });

		const toolbar = this.rootEl.createDiv({ cls: "timeline-planner-toolbar" });
		if(toolbar){
			const titleRow = toolbar.createDiv({ cls: "timeline-planner-title-row" });
			titleRow.createEl("span", { text: DisplayedTexts.timeline.toolbarHeading });
			this.filePathLabelEl = titleRow.createEl("span", {
				cls: "timeline-planner-file-label",
			});
			this.updateToolbarPath();
	
			const addBtn = toolbar.createEl("button", {
				text: DisplayedTexts.timeline.newTask,
			});
			addBtn.addEventListener("click", () => this.addTask());
	
			const todayBtn = toolbar.createEl("button", {
				text: DisplayedTexts.timeline.jumpToToday,
			});
			todayBtn.addEventListener("click", () => {
				const t = parseYmd(todayYmd());
				this.data.rangeStart = formatYmd(addDays(t, -7));
				this.persistAndRedraw();
			});
	
			const backBtn = toolbar.createEl("button", { text: "◀" });
			backBtn.setAttr("title", "");
			backBtn.setAttr("aria-label", DisplayedTexts.timeline.navEarlierAria);
			backBtn.addEventListener("click", () => {
				this.data.rangeStart = formatYmd(
					addDays(parseYmd(this.data.rangeStart), -14)
				);
				this.persistAndRedraw();
			});
	
			const fwdBtn = toolbar.createEl("button", { text: "▶" });
			fwdBtn.setAttr("title", "");
			fwdBtn.setAttr("aria-label", DisplayedTexts.timeline.navLaterAria);
			fwdBtn.addEventListener("click", () => {
				this.data.rangeStart = formatYmd(
					addDays(parseYmd(this.data.rangeStart), 14)
				);
				this.persistAndRedraw();
			});
	
			toolbar.createDiv({ cls: "timeline-planner-spacer" });

			const zoom = toolbar.createDiv({ cls: "timeline-planner-zoom" });
			if(zoom){
				zoom.setAttr("title", "");
				zoom.setAttr("aria-label", DisplayedTexts.timeline.zoomTitle);

				zoom.createSpan({
					cls: "timeline-planner-zoom-label",
					text: DisplayedTexts.timeline.zoomLabel,
				});

				const minus = zoom.createEl("button", { text: "−" });
				minus.setAttr("title", "");
				minus.setAttr("aria-label", DisplayedTexts.timeline.zoomOutAria);
				minus.addEventListener("click", () => {
					this.applyZoomDelta(-TimelineView.ZOOM_STEP);
				});

				const plus = zoom.createEl("button", { text: "+" });
				plus.setAttr("title", "");
				plus.setAttr("aria-label", DisplayedTexts.timeline.zoomInAria);
				plus.addEventListener("click", () => {
					this.applyZoomDelta(TimelineView.ZOOM_STEP);
				});
			}
			
	
			const selTools = toolbar.createDiv({
				cls: "timeline-planner-selection-tools",
			});

			if(selTools){
				selTools.createSpan({
					cls: "timeline-planner-selection-label",
					text: DisplayedTexts.timeline.shiftSelectionLabel,
				});

				const nudgeLeft = selTools.createEl("button", { text: "◀" });
				nudgeLeft.setAttr("title", "");
				nudgeLeft.setAttr(
					"aria-label",
					DisplayedTexts.timeline.nudgeEarlierTitle
				);
				nudgeLeft.addEventListener("click", () => this.shiftSelectedTasksByDays(-1));
				
				const nudgeRight = selTools.createEl("button", { text: "▶" });
				nudgeRight.setAttr("title", "");
				nudgeRight.setAttr(
					"aria-label",
					DisplayedTexts.timeline.nudgeLaterTitle
				);
				nudgeRight.addEventListener("click", () => this.shiftSelectedTasksByDays(1));
			}
		}

		const scroll = this.rootEl.createDiv({ cls: "timeline-planner-scroll" });
		this.scrollEl = scroll;
		scroll.setAttr("title", DisplayedTexts.timeline.scrollRegionTitle);

		this.registerDomEvent(scroll, "mousedown", (ev: MouseEvent) => {
			if (ev.button !== 2) return;
			if (!this.file || !this.scrollEl) return;

			const t = ev.target as HTMLElement;
			if (t.closest("button, a, input, textarea, select")) return;

			ev.preventDefault();

			const el = this.scrollEl;
			this.panState = {
				startX: ev.clientX,
				startY: ev.clientY,
				initialRangeStart: this.data.rangeStart,
				initialScrollTop: el.scrollTop,
			};
			
			el.classList.add("timeline-planner-scroll--panning");
			
			this.syncDocumentCursorFromInteractionState();
		});
		this.registerDomEvent(scroll, "contextmenu", (ev: MouseEvent) => {
			if (this.panState) ev.preventDefault();
		});

		this.mainWrapEl = scroll.createDiv({ cls: "timeline-planner-main" });
		this.headerRowEl = this.mainWrapEl.createDiv({
			cls: "timeline-planner-grid",
		});
		this.bodyEl = this.mainWrapEl.createDiv({ cls: "timeline-planner-rows" });

		this.resizeObserver = new ResizeObserver(() => {
			const prev = this.data.dayCount;
			this.redrawPreservingScroll();
			if (
				this.file &&
				this.data.dayCount !== prev
			) {
				if (this.resizePersistTimer !== null) {
					window.clearTimeout(this.resizePersistTimer);
				}
				this.resizePersistTimer = window.setTimeout(() => {
					this.resizePersistTimer = null;
					void this.api.persist(this);
				}, 400);
			}
		});
		this.resizeObserver.observe(scroll);

		this.registerDomEvent(window, "mousemove", (ev: MouseEvent) =>
			this.onGlobalMouseMove(ev)
		);
		this.registerDomEvent(window, "mouseup", () => this.onGlobalMouseUp());
		this.registerDomEvent(window, "keydown", (ev: KeyboardEvent) => {
			if (ev.key !== "Escape") return;
			if (this.marqueeState) {
				ev.preventDefault();
				this.endMarqueeGesture();
				return;
			}
			if (this.selectedTaskIds.size === 0) return;
			ev.preventDefault();
			this.selectedTaskIds.clear();
			this.redrawPreservingScroll();
		});

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (oldPath === this.file?.path && file instanceof TFile) {
					this.updateToolbarPath();
				}
			})
		);

		this.registerInterval(
			window.setInterval(() => {
				this.refreshTodayLinePosition();
			}, 30_000)
		);

		this.registerDomEvent(
			this.rootEl,
			"wheel",
			(ev: WheelEvent) => this.onWheelZoom(ev),
			{ passive: false }
		);

		this.updateToolbarPath();
		this.redraw();
	}

	async onClose(): Promise<void> {
		if (this.dragRedrawRafId !== null) {
			cancelAnimationFrame(this.dragRedrawRafId);
			this.dragRedrawRafId = null;
		}
		if (this.panRedrawRafId !== null) {
			cancelAnimationFrame(this.panRedrawRafId);
			this.panRedrawRafId = null;
		}
		if (this.resizePersistTimer !== null) {
			window.clearTimeout(this.resizePersistTimer);
			this.resizePersistTimer = null;
		}
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.panState = null;
		this.endMarqueeGesture();
		this.scrollEl = null;
		this.clearDocumentCursorOverride();
		this.filePathLabelEl = null;
		this.containerEl.empty();
	}

	private async persistAndRedraw(): Promise<void> {
		if (!this.file) return;
		await this.api.persist(this);
		this.redraw();
	}

	/**
	 * Moves `rangeStart` so the task interval is visible: centered when the task is
	 * shorter than the viewport, otherwise aligned to the task start.
	 */
	private jumpRangeToShowTask(taskStart: Date, taskEnd: Date): void {
		if (!this.file) return;
		const { start, end } = clampDateOrder(taskStart, taskEnd);
		const n = Math.max(1, this.data.dayCount);
		const span = daysBetweenInclusive(start, end) + 1;
		let rs: Date;
		if (span >= n) {
			rs = new Date(start.getTime());
		} else {
			const pad = Math.floor((n - span) / 2);
			rs = addDays(start, -pad);
		}
		this.data.rangeStart = formatYmd(rs);
		void this.persistAndRedraw();
	}

	private applyZoomDelta(delta: number): void {
		if (!this.file) return;
		const next = Math.min(
			TimelineView.ZOOM_MAX,
			Math.max(
				TimelineView.ZOOM_MIN,
				this.data.pixelsPerDay + delta
			)
		);
		if (next === this.data.pixelsPerDay) return;
		this.data.pixelsPerDay = next;
		void this.persistAndRedraw();
	}

	private shiftSelectedTasksByDays(delta: number): void {
		if (!this.file) {
			new Notice(DisplayedTexts.timeline.noticeNoFile);
			return;
		}
		if (this.selectedTaskIds.size === 0) {
			new Notice(DisplayedTexts.timeline.noticeNoSelection);
			return;
		}
		for (const id of Array.from(this.selectedTaskIds)) {
			const t = this.data.tasks.find((x) => x.id === id);
			if (!t) continue;
			const a = parseYmd(t.start);
			const b = parseYmd(t.end);
			const c = clampDateOrder(a, b);
			const ns = addDays(c.start, delta);
			const ne = addDays(c.end, delta);
			const o = clampDateOrder(ns, ne);
			t.start = formatYmd(o.start);
			t.end = formatYmd(o.end);
		}
		void this.persistAndRedraw();
	}

	/** Ctrl+scroll (⌘+scroll on macOS) — same as the +/− zoom buttons. */
	private onWheelZoom(ev: WheelEvent): void {
		if (!this.file) return;
		if (!ev.ctrlKey && !ev.metaKey) return;
		const now = Date.now();
		if (
			now - this.lastWheelZoomAt <
			TimelineView.WHEEL_ZOOM_MIN_INTERVAL_MS
		) {
			ev.preventDefault();
			return;
		}
		this.lastWheelZoomAt = now;
		ev.preventDefault();
		const delta =
			ev.deltaY < 0
				? TimelineView.ZOOM_STEP
				: -TimelineView.ZOOM_STEP;
		this.applyZoomDelta(delta);
	}

	/** Call when planner data was reloaded from disk so the grid updates. */
	refresh(): void {
		this.redraw();
	}

	/**
	 * Fill the scroll viewport with day columns: `ceil((width − label) / pxPerDay)`.
	 * If width is not laid out yet, keeps the last `dayCount` from data.
	 */
	private computeVisibleDayCount(): number {
		const labelW = TIMELINE_LABEL_COLUMN_PX;
		const px = Math.max(1, this.data.pixelsPerDay);
		const w = this.scrollEl?.clientWidth ?? 0;
		if (w <= labelW + 1) {
			return Math.max(1, this.data.dayCount || 1);
		}
		return Math.max(1, Math.ceil((w - labelW) / px));
	}

	/** One full redraw per frame max while horizontally panning (range changes). */
	private schedulePanRedraw(): void {
		if (this.panRedrawRafId !== null) return;
		this.panRedrawRafId = requestAnimationFrame(() => {
			this.panRedrawRafId = null;
			if (!this.panState || !this.scrollEl) return;
			this.redrawPreservingScroll();
		});
	}

	/** One full redraw per frame max while moving or resizing a task bar. */
	private scheduleDragRedraw(): void {
		if (this.dragRedrawRafId !== null) return;
		this.dragRedrawRafId = requestAnimationFrame(() => {
			this.dragRedrawRafId = null;
			if (!this.dragState) return;
			this.redrawPreservingScroll();
		});
	}

	/**
	 * Drop index: which row’s vertical band contains the pointer (not row midlines).
	 * Swap only when the cursor enters another task row’s bounds.
	 */
	private computeReorderTargetIndex(clientY: number): number {
		if (!this.bodyEl) return 0;
		const rows = this.bodyEl.querySelectorAll(".timeline-task-row");
		if (rows.length === 0) return 0;
		if (rows.length === 1) return 0;

		const rects: DOMRect[] = [];
		for (let i = 0; i < rows.length; i++) {
			rects.push(rows[i].getBoundingClientRect());
		}

		for (let i = 0; i < rects.length; i++) {
			const r = rects[i];
			const last = i === rects.length - 1;
			if (
				clientY >= r.top &&
				(last ? clientY <= r.bottom : clientY < r.bottom)
			) {
				return i;
			}
		}

		if (clientY < rects[0].top) return 0;
		if (clientY > rects[rects.length - 1].bottom) {
			return rects.length - 1;
		}

		for (let i = 0; i < rects.length - 1; i++) {
			const a = rects[i];
			const b = rects[i + 1];
			if (clientY > a.bottom && clientY < b.top) {
				return clientY < (a.bottom + b.top) / 2 ? i : i + 1;
			}
		}

		return rects.length - 1;
	}

	/** Remove `html` cursor override (call on mouseup / view close). */
	private clearDocumentCursorOverride(): void {
		if (this.appliedDocumentCursorClass === null) return;
		document.documentElement.classList.remove(this.appliedDocumentCursorClass);
		this.appliedDocumentCursorClass = null;
	}

	private computeDesiredDocumentCursorClass(): string | null {
		if (this.panState) return "timeline-planner-doc-cursor-grabbing";
		if (this.marqueeState?.phase === "dragging") {
			return "timeline-planner-doc-cursor-crosshair";
		}
		if (!this.dragState) return null;
		const st = this.dragState;
		if (st.mode === "pending-bar") return "timeline-planner-doc-cursor-grab";
		if (st.mode === "reorder") return "timeline-planner-doc-cursor-ns-resize";
		if (st.mode === "resize-left" || st.mode === "resize-right") {
			return "timeline-planner-doc-cursor-ew-resize";
		}
		if (st.mode === "move") return "timeline-planner-doc-cursor-grabbing";
		return null;
	}

	/**
	 * While panning or dragging, elements under the pointer can steal the cursor.
	 * Apply a short-lived `html` class. Updates the DOM only when the desired
	 * cursor changes (avoiding work on every mousemove).
	 */
	private syncDocumentCursorFromInteractionState(): void {
		const desired = this.computeDesiredDocumentCursorClass();
		if (desired === this.appliedDocumentCursorClass) return;
		const root = document.documentElement;
		if (this.appliedDocumentCursorClass) {
			root.classList.remove(this.appliedDocumentCursorClass);
		}
		this.appliedDocumentCursorClass = desired;
		if (desired) {
			root.classList.add(desired);
		}
	}

	private ensureMarqueeOverlay(): void {
		if (this.marqueeOverlayEl) return;
		const el = document.createElement("div");
		el.className = "timeline-planner-marquee";
		el.style.position = "fixed";
		el.style.zIndex = "99999";
		el.style.pointerEvents = "none";
		document.body.appendChild(el);
		this.marqueeOverlayEl = el;
	}

	private updateMarqueeOverlay(): void {
		const ms = this.marqueeState;
		if (!ms || ms.phase !== "dragging" || !this.marqueeOverlayEl) {
			return;
		}
		
		const l = Math.min(ms.startX, ms.curX);
		const r = Math.max(ms.startX, ms.curX);
		const t = Math.min(ms.startY, ms.curY);
		const b = Math.max(ms.startY, ms.curY);

		const el = this.marqueeOverlayEl;
		el.style.left = `${l}px`;
		el.style.top = `${t}px`;
		el.style.width = `${Math.max(0, r - l)}px`;
		el.style.height = `${Math.max(0, b - t)}px`;
	}

	private removeMarqueeOverlay(): void {
		if (this.marqueeOverlayEl) {
			this.marqueeOverlayEl.remove();
			this.marqueeOverlayEl = null;
		}
	}

	private endMarqueeGesture(): void {
		this.removeMarqueeOverlay();
		this.marqueeState = null;
		this.syncDocumentCursorFromInteractionState();
	}

	private applyMarqueeSelection(ms: {
		startX: number;
		startY: number;
		curX: number;
		curY: number;
		additive: boolean;
	}): void {
		if (!this.bodyEl) {
			return;
		}

		const l = Math.min(ms.startX, ms.curX);
		const r = Math.max(ms.startX, ms.curX);
		const t = Math.min(ms.startY, ms.curY);
		const b = Math.max(ms.startY, ms.curY);

		const picked = new Set<string>();
		this.bodyEl.querySelectorAll(".timeline-task-row-task-bar").forEach((el) => {
			const br = el.getBoundingClientRect();
			
			if (br.right < l || br.left > r || br.bottom < t || br.top > b) {
				return;
			}

			const id = (el as HTMLElement).dataset.taskId;
			
			if (id) {
				picked.add(id);
			}
		});
		if (ms.additive) {
			for (const id of picked) {
				this.selectedTaskIds.add(id);
			}
		} else {
			this.selectedTaskIds.clear();
			
			for (const id of picked){
				this.selectedTaskIds.add(id);
			}
		}

		this.redrawPreservingScroll();
	}

	/** Drag a selection box on empty track (not on a task bar). */
	private bindMarqueeOnTrack(element_track: HTMLElement): void {
		element_track.addEventListener("mousedown", (ev) => {
			if (ev.button !== 0 || !this.file) {
				return;
			}

			if ((ev.target as HTMLElement).closest(".timeline-task-row-task-bar")) {
				return;
			}

			/* Let mousedown bubble so Obsidian can dismiss open `Menu`s; don’t start marquee. */
			if (this.taskStateMenu) {
				this.taskStateMenu.hide();
				return;
			}

			ev.preventDefault();
			ev.stopPropagation();
			
			this.marqueeState = {
				phase: "pending",
				startX: ev.clientX,
				startY: ev.clientY,
				additive: ev.shiftKey,
			};
			this.syncDocumentCursorFromInteractionState();
		});
	}

	/** Full layout rebuild without jumping scroll (see `redraw`, which clears the body). */
	private redrawPreservingScroll(): void {
		if (!this.scrollEl) {
			this.redraw();
			return;
		}
		const st = this.scrollEl.scrollTop;
		this.redraw();
		this.scrollEl.scrollTop = st;
	}

	private redraw(): void {
		if (!this.headerRowEl || !this.bodyEl) return;

		for (const ro of this.taskBarStackObservers) {
			ro.disconnect();
		}
		this.taskBarStackObservers.length = 0;

		this.data.dayCount = this.computeVisibleDayCount();

		this.mainWrapEl
			?.querySelectorAll(".timeline-planner-today-line")
			.forEach((el) => el.remove());

		this.headerRowEl.empty();
		this.bodyEl.empty();

		if (!this.file) {
			this.bodyEl.createDiv({
				cls: "timeline-planner-empty",
				text: DisplayedTexts.timeline.emptyNoFileLoaded,
			});
			return;
		}

		const rs = parseYmd(this.data.rangeStart);
		const dayW = this.data.pixelsPerDay;
		this.rootEl.style.setProperty("--tp-day-w", `${dayW}px`);

		const grid = this.headerRowEl;
		grid.style.gridTemplateColumns = `${TIMELINE_LABEL_COLUMN_PX}px repeat(${this.data.dayCount}, ${dayW}px)`;

		grid.createDiv({ cls: "timeline-planner-dayhead-spacer" });

		for (let i = 0; i < this.data.dayCount; i++) {
			const d = addDays(rs, i);
			const w = d.getDay();

			const head = grid.createDiv({
				cls: "timeline-planner-dayhead",
				text: `${d.getDate()}`,
			});

			if (w === 0 || w === 6) {
				head.addClass("is-weekend");
			}
			
			if (formatYmd(d) === todayYmd()) {
				head.addClass("is-today");
			}
			
			head.setAttr("title", "");
			head.setAttr("aria-label", formatYmd(d));
		}

		if (this.data.tasks.length === 0) {
			this.bodyEl.createDiv({
				cls: "timeline-planner-empty",
				text: DisplayedTexts.timeline.emptyNoTasks,
			});
		} else {
			for (const task of this.data.tasks) {
				this.renderTaskRow(task, rs, dayW);
			}
		}

		this.placeTodayLine(rs, dayW);
	}

	/** Vertical marker for “now” when today lies in the visible range; x = time within the day. */
	private placeTodayLine(rangeStart: Date, dayW: number): void {
		if (!this.mainWrapEl) {
			return;
		}

		const today = parseYmd(todayYmd());
		const idx = daysBetweenInclusive(rangeStart, today);
		if (idx < 0 || idx >= this.data.dayCount) {
			return;
		}

		const labelCol = TIMELINE_LABEL_COLUMN_PX;
		const t = fractionOfLocalDayElapsed();
		const leftPx = labelCol + idx * dayW + t * dayW;
		const line = this.mainWrapEl.createDiv({ cls: "timeline-planner-today-line" });
		line.style.left = `${leftPx}px`;
	}

	/** Recompute cursor x from clock (no full redraw). */
	private refreshTodayLinePosition(): void {
		if (!this.mainWrapEl || !this.file) {
			return;
		}

		const rs = parseYmd(this.data.rangeStart);
		const dayW = this.data.pixelsPerDay;
		this.mainWrapEl
			.querySelectorAll(".timeline-planner-today-line")
			.forEach((el) => el.remove());
		this.placeTodayLine(rs, dayW);
	}

	private renderTaskRow(task: TimelineTask, rangeStart: Date, dayW: number): void {
		const element_row = this.bodyEl.createDiv({ cls: "timeline-task-row" });

		const element_label = element_row.createDiv({ cls: "timeline-task-row-label" });
		if(element_label){
			const element_handle = element_label.createDiv({
				cls: "timeline-task-row-movehandle",
				text: DisplayedTexts.timeline.reorderHandleGlyph,
			});
			if(element_handle){
				element_handle.setAttr("title", "");
				element_handle.setAttr("aria-label", DisplayedTexts.timeline.reorderTitle);
				element_handle.addEventListener("mousedown", (ev) => {
					if (ev.button !== 0) return;
					ev.preventDefault();
					ev.stopPropagation();
					this.selectedTaskIds.clear();
					this.dragState = { mode: "reorder", taskId: task.id };
					this.syncDocumentCursorFromInteractionState();
				});
			}
		}

		const { emoji: titleEmoji, core: titleCore } = this.taskLabelParts(task);
		const task_title_label = titleCore || DisplayedTexts.timeline.untitledTaskLabel;

		const element_labelMain = element_label.createDiv({ cls: "timeline-task-row-info-panel" });
		const element_titleEl = element_labelMain.createDiv({
			cls: "timeline-task-row-info-panel-title",
		});
		if (titleEmoji) {
			element_titleEl.createSpan({
				cls: "timeline-task-row-title-emoji",
				text: titleEmoji,
			});
		}
		element_titleEl.createSpan({
			cls: "timeline-task-row-title-text",
			text: task_title_label,
		});
		element_titleEl.addEventListener("click", (e) => {
			e.preventDefault();
			this.openEditModal(task);
		});

		const element_meta = element_labelMain.createDiv({ cls: "timeline-task-row-info-panel-meta" });
		element_meta.setText(`${task.start} → ${task.end}`);

		const element_actions = element_labelMain.createDiv({ cls: "timeline-task-row-info-panel-actions" });
		if(element_actions){
			const delBtn = element_actions.createEl("button", {
				text: DisplayedTexts.timeline.deleteTaskSymbol,
			});
			delBtn.addEventListener("click", () => this.deleteTask(task.id));
		}

		const element_track = element_row.createDiv({ cls: "timeline-task-row-track" });
		if(element_track){
			element_track.style.minWidth = `${this.data.dayCount * dayW}px`;
			this.bindMarqueeOnTrack(element_track);
			const { start, end } = clampDateOrder(parseYmd(task.start), parseYmd(task.end));

			const rangeEnd = addDays(rangeStart, this.data.dayCount - 1);
			if (end < rangeStart || start > rangeEnd) {
				const pastLeft = end < rangeStart;
				const element_row = element_track.createDiv({
					cls:
						"timeline-planner-outside-range timeline-planner-outside-range--track " +
						(
							pastLeft
							? "timeline-planner-outside-range--past-left"
							: "timeline-planner-outside-range--past-right"
						),
				});

				const onJumpMouseDown = (ev: MouseEvent): void => {
					ev.preventDefault();
					ev.stopPropagation();
				};
				const onJumpClick = (ev: MouseEvent): void => {
					ev.preventDefault();
					ev.stopPropagation();
					this.jumpRangeToShowTask(start, end);
				};

				const element_leftArrow = element_row.createEl("button", {
					type: "button",
					cls: "timeline-planner-outside-range-arrow timeline-planner-outside-range-arrow--left",
					text: "◀",
				});
				if (pastLeft) {
					const tip = DisplayedTexts.timeline.outsideRangeArrowTitleLeft(
						formatYmd(rangeStart)
					);
					element_leftArrow.setAttr("title", "");
					element_leftArrow.setAttr("aria-label", tip);
					element_leftArrow.addEventListener("mousedown", onJumpMouseDown);
					element_leftArrow.addEventListener("click", onJumpClick);
				} else {
					element_leftArrow.disabled = true;
					element_leftArrow.setAttr("aria-hidden", "true");
					element_leftArrow.addClass("is-inactive");
				}

				const element_center = element_row.createDiv({
					cls: "timeline-planner-outside-range-center",
				});
				if(element_center){
					const jumpBtn = element_center.createEl("button", {
						type: "button",
						cls: "timeline-planner-jump-task-btn",
						text: DisplayedTexts.timeline.jumpToTaskButton,
					});
					jumpBtn.setAttr("title", "");
					jumpBtn.setAttr("aria-label", DisplayedTexts.timeline.jumpToTaskTitle);
					jumpBtn.addEventListener("mousedown", onJumpMouseDown);
					jumpBtn.addEventListener("click", onJumpClick);
				}
				

				const element_rightArrow = element_row.createEl("button", {
					type: "button",
					cls: "timeline-planner-outside-range-arrow timeline-planner-outside-range-arrow--right",
					text: "▶",
				});
				if(element_rightArrow){
					if (!pastLeft) {
						const tip = DisplayedTexts.timeline.outsideRangeArrowTitleRight(
							formatYmd(rangeEnd)
						);
						element_rightArrow.setAttr("title", "");
						element_rightArrow.setAttr("aria-label", tip);
						element_rightArrow.addEventListener("mousedown", onJumpMouseDown);
						element_rightArrow.addEventListener("click", onJumpClick);
					}
					else {
						element_rightArrow.disabled = true;
						element_rightArrow.setAttr("aria-hidden", "true");
						element_rightArrow.addClass("is-inactive");
					}
				}

				return;
			}

			const visStart = start < rangeStart ? rangeStart : start;
			const visEnd = end > rangeEnd ? rangeEnd : end;

			const i0 = daysBetweenInclusive(rangeStart, visStart);
			const span = daysBetweenInclusive(visStart, visEnd) + 1;

			const element_task_bar = element_track.createDiv({
				cls: "timeline-task-row-task-bar" + (this.selectedTaskIds.has(task.id) ? " is-selected" : ""),
			});
			if(element_task_bar){
				element_task_bar.dataset.taskId = task.id;
				element_task_bar.style.left = `${i0 * dayW}px`;
				element_task_bar.style.width = `${span * dayW - 4}px`;
				element_task_bar.setAttr("title", DisplayedTexts.timeline.barTitle);

				const element_labelRow = element_task_bar.createDiv({
					cls: "timeline-task-row-task-bar-labelrow",
				});
				if(element_labelRow){
					if (titleEmoji) {
						element_labelRow.createSpan({
							cls: "timeline-task-row-task-bar-emoji",
							text: titleEmoji,
						});
					}
					element_labelRow.createDiv({
						cls: "timeline-task-row-task-bar-text",
						text: task_title_label,
					});
				}
				
		
				const taskStates: TaskStateDefinition[] = this.api.getTaskStates();
				const resolvedStateId =
					task.stateId?.trim()
					&& taskStates.some((s) => s.id === task.stateId!.trim())
						? task.stateId!.trim()
						: "";
				const curState = taskStates.find((s) => s.id === resolvedStateId);


				const stateBtn = element_task_bar.createEl("button", {
					type: "button",
					cls: "timeline-task-row-task-bar-state-select",
					attr: {
						"aria-label": DisplayedTexts.timeline.taskStateSelectTitle,
						"aria-haspopup": "menu",
					},
					text: curState?.name ?? DisplayedTexts.taskModal.taskStateNone,
				});

				if(stateBtn){
					this.styleTaskStateSelect(stateBtn, curState?.color ?? null);
					stateBtn.addEventListener("mousedown", (ev) => {
						ev.stopPropagation();
					});

					stateBtn.addEventListener("click", (ev) => {
						this.sateButtonPressCallback(ev, task, taskStates, stateBtn);
					});
				}
		
				this.applyTaskBarColor(element_task_bar, task);
				this.bindTaskBarStackLayout(element_task_bar);
				element_task_bar.addEventListener("dblclick", (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					this.openEditModal(task);
				});
		
				const hL = element_task_bar.createDiv({
					cls: "timeline-task-row-task-bar-handle timeline-task-row-task-bar-handle-left",
				});
				const hR = element_task_bar.createDiv({
					cls: "timeline-task-row-task-bar-handle timeline-task-row-task-bar-handle-right",
				});
		
				element_task_bar.addEventListener("mousedown", (ev) => {
					if (ev.button !== 0 || ev.target === hL || ev.target === hR) {
						return;
					}

					if ((ev.target as HTMLElement).closest(".timeline-task-row-task-bar-state-select"))
					{
						return;
					}

					if (ev.ctrlKey || ev.metaKey) {
						ev.preventDefault();
						ev.stopPropagation();

						if (this.selectedTaskIds.has(task.id)) {
							this.selectedTaskIds.delete(task.id);
						} else {
							this.selectedTaskIds.add(task.id);
						}

						this.redrawPreservingScroll();

						return;
					}

					ev.preventDefault();
					
					if (!this.selectedTaskIds.has(task.id)) {
						this.selectedTaskIds.clear();
					}

					this.dragState = {
						mode: "pending-bar",
						taskId: task.id,
						startX: ev.clientX,
						startY: ev.clientY,
						origStart: new Date(start),
						origEnd: new Date(end),
					};

					this.syncDocumentCursorFromInteractionState();
				});


				hL.addEventListener("mousedown", (ev) => {
					if (ev.button !== 0) {
						return;
					}

					ev.preventDefault();
					ev.stopPropagation();
					
					this.dragState = {
						mode: "resize-left",
						taskId: task.id,
						startX: ev.clientX,
						origStart: new Date(start),
						origEnd: new Date(end),
					};
					
					this.syncDocumentCursorFromInteractionState();
				});
		
				hR.addEventListener("mousedown", (ev) => {
					if (ev.button !== 0) {
						return;
					}

					ev.preventDefault();
					ev.stopPropagation();
					
					this.dragState = {
						mode: "resize-right",
						taskId: task.id,
						startX: ev.clientX,
						origStart: new Date(start),
						origEnd: new Date(end),
					};

					this.syncDocumentCursorFromInteractionState();
				});
			}
		}
	}

	private onGlobalMouseMove(ev: MouseEvent): void {
		try {
			if (this.marqueeState) {
				const ms = this.marqueeState;
				if (ms.phase === "pending") {
					const d = Math.hypot(
						ev.clientX - ms.startX,
						ev.clientY - ms.startY
					);
					if (d < TimelineView.MARQUEE_DRAG_PX) {
						ev.preventDefault();
						return;
					}
					this.marqueeState = {
						phase: "dragging",
						startX: ms.startX,
						startY: ms.startY,
						curX: ev.clientX,
						curY: ev.clientY,
						additive: ms.additive,
					};
					this.ensureMarqueeOverlay();
					this.updateMarqueeOverlay();
				} else {
					this.marqueeState = {
						...ms,
						curX: ev.clientX,
						curY: ev.clientY,
					};
					this.updateMarqueeOverlay();
				}
				ev.preventDefault();
				return;
			}

			if (this.panState && this.scrollEl) {
				const p = this.panState;
				const el = this.scrollEl;
				const dy = ev.clientY - p.startY;
				const dx = ev.clientX - p.startX;
				const newScrollTop = p.initialScrollTop - dy;
				const dayDelta = -Math.round(dx / this.data.pixelsPerDay);
				const newRangeStart = formatYmd(
					addDays(parseYmd(p.initialRangeStart), dayDelta)
				);
				const rangeChanged = newRangeStart !== this.data.rangeStart;
				this.data.rangeStart = newRangeStart;
				el.scrollTop = newScrollTop;
				if (rangeChanged) {
					this.schedulePanRedraw();
				}
				ev.preventDefault();
				return;
			}

			if (!this.dragState) {
				return;
			}

			let st = this.dragState;

			if (st.mode === "pending-bar") {
				const dx = ev.clientX - st.startX;
				const dy = ev.clientY - st.startY;
				if (Math.hypot(dx, dy) < TimelineView.PENDING_BAR_DRAG_PX) {
					ev.preventDefault();
					return;
				}
				if (Math.abs(dy) > Math.abs(dx)) {
					this.selectedTaskIds.clear();
					this.dragState = { mode: "reorder", taskId: st.taskId };
				} else {
					const primaryId = st.taskId;
					const ids =
						this.selectedTaskIds.size > 0 &&
						this.selectedTaskIds.has(primaryId)
							? Array.from(this.selectedTaskIds)
							: [primaryId];
					const groupOrigins = new Map<
						string,
						{ origStart: Date; origEnd: Date }
					>();
					for (const id of ids) {
						const t = this.data.tasks.find((x) => x.id === id);
						if (!t) continue;
						const a = parseYmd(t.start);
						const b = parseYmd(t.end);
						const c = clampDateOrder(a, b);
						groupOrigins.set(id, {
							origStart: new Date(c.start),
							origEnd: new Date(c.end),
						});
					}
					const pr = groupOrigins.get(primaryId);
					if (!pr || groupOrigins.size === 0) {
						this.dragState = {
							mode: "move",
							taskId: primaryId,
							startX: st.startX,
							origStart: new Date(st.origStart),
							origEnd: new Date(st.origEnd),
						};
					} else {
						this.dragState = {
							mode: "move",
							taskId: primaryId,
							startX: st.startX,
							origStart: new Date(pr.origStart),
							origEnd: new Date(pr.origEnd),
							groupOrigins,
						};
					}
				}
				st = this.dragState;
			}

			if (st.mode === "reorder") {
				const fromIdx = this.data.tasks.findIndex((t) => t.id === st.taskId);
				if (fromIdx < 0) return;
				const toIdx = this.computeReorderTargetIndex(ev.clientY);
				if (toIdx !== fromIdx) {
					moveInArray(this.data.tasks, fromIdx, toIdx);
					this.scheduleDragRedraw();
				}
				ev.preventDefault();
				return;
			}

			const task = this.data.tasks.find((t) => t.id === st.taskId);
			if (!task) {
				return;
			}

			const dx = ev.clientX - st.startX;
			const dayDelta = Math.round(dx / this.data.pixelsPerDay);

			if (st.mode === "move") {
				const go = st.groupOrigins;
				if (go && go.size > 0) {
					for (const [id, o] of go) {
						const tsk = this.data.tasks.find((x) => x.id === id);
						if (!tsk) continue;
						const ns = addDays(o.origStart, dayDelta);
						const ne = addDays(o.origEnd, dayDelta);
						const cl = clampDateOrder(ns, ne);
						tsk.start = formatYmd(cl.start);
						tsk.end = formatYmd(cl.end);
					}
					
					this.scheduleDragRedraw();
					ev.preventDefault();

					return;
				}
			}

			let ns = new Date(st.origStart);
			let ne = new Date(st.origEnd);

			if (st.mode === "move") {
				ns = addDays(st.origStart, dayDelta);
				ne = addDays(st.origEnd, dayDelta);
			} else if (st.mode === "resize-left") {
				ns = addDays(st.origStart, dayDelta);
				ne = new Date(st.origEnd);
				if (ns > ne) ns = new Date(ne);
			} else {
				ns = new Date(st.origStart);
				ne = addDays(st.origEnd, dayDelta);
				if (ne < ns) ne = new Date(ns);
			}

			const o = clampDateOrder(ns, ne);
			task.start = formatYmd(o.start);
			task.end = formatYmd(o.end);

			this.scheduleDragRedraw();
		} finally {
			if (
				this.panState
				|| this.dragState
				|| this.marqueeState
				|| this.appliedDocumentCursorClass !== null
			) {
				this.syncDocumentCursorFromInteractionState();
			}
		}
	}

	private onGlobalMouseUp(): void {
		try {
			if (this.panState && this.scrollEl) {
				if (this.panRedrawRafId !== null) {
					cancelAnimationFrame(this.panRedrawRafId);
					this.panRedrawRafId = null;
					this.redrawPreservingScroll();
				}

				const initialRange = this.panState.initialRangeStart;
				this.panState = null;
				this.scrollEl.classList.remove("timeline-planner-scroll--panning");
				
				if (
					this.file
					&& this.data.rangeStart !== initialRange
				) {
					void this.api.persist(this);
				}
			}
			if (this.marqueeState) {
				const ms = this.marqueeState;

				if (ms.phase === "dragging") {
					this.applyMarqueeSelection(ms);
				} else if (ms.phase === "pending" && !ms.additive) {
					this.selectedTaskIds.clear();
					this.redrawPreservingScroll();
				}
				
				this.endMarqueeGesture();
			}

			if (this.dragState) {
				const wasPendingBar = this.dragState.mode === "pending-bar";
				if (this.dragRedrawRafId !== null) {
					cancelAnimationFrame(this.dragRedrawRafId);
					this.dragRedrawRafId = null;
					this.redrawPreservingScroll();
				}

				this.dragState = null;
				
				if (!wasPendingBar) {
					void this.api.persist(this);
				}
			}
		} finally {
			this.clearDocumentCursorOverride();
		}
	}

	private addTask(): void {
		if (!this.file) {
			new Notice(DisplayedTexts.timeline.noticeNoFile);
			return;
		}

		const t0 = parseYmd(todayYmd());
		const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const task: TimelineTask = {
			id,
			title: DisplayedTexts.timeline.newTaskDefaultTitle,
			text: "",
			start: formatYmd(t0),
			end: formatYmd(addDays(t0, 2)),
		};

		this.data.tasks.push(task);
		new Notice(DisplayedTexts.timeline.noticeTaskAdded);
		void this.persistAndRedraw();
		
		this.openEditModal(task);
	}

	private deleteTask(id: string): void {
		this.selectedTaskIds.delete(id);
		this.data.tasks = this.data.tasks.filter((t) => t.id !== id);
		new Notice(DisplayedTexts.timeline.noticeTaskRemoved);
		void this.persistAndRedraw();
	}

	private openEditModal(task: TimelineTask): void {
		new TaskEditModal(
			this.app,
			task,
			(updated) => {
				const {
					color: colorUp,
					emoji: emojiUp,
					stateId: stateIdUp,
					...rest
				} = updated;

				Object.assign(task, rest);
				
				if (colorUp !== undefined) {
					if (!String(colorUp).trim()) {
						delete task.color;
					}
					else {
						task.color = String(colorUp).trim();
					}
				}
				
				if (emojiUp !== undefined) {
					const e = String(emojiUp).trim();
					if (e) {
						task.emoji = firstGrapheme(e);
					}
					else {
						delete task.emoji;
					}
				}
				
				if (stateIdUp !== undefined) {
					const s = String(stateIdUp).trim();
					if (s) {
						task.stateId = s;
					}
					else {
						delete task.stateId;
					}
				}
				
				void this.persistAndRedraw();
			},
			this.api.getDefaultTaskBarColor(),
			this.api.getTaskStates(),
			this.api.getEmojiPickerCategories()
		).open();
	}

	/** Notes tag + title (no emoji); emoji is separate for layout. */
	private taskLabelParts(task: TimelineTask): { emoji: string; core: string } {
		const notesTag = task.text.length > 0 && task.title.length > 0 ? `${DisplayedTexts.timeline.taskExisitngNoteIndication} ` : "";
		const core = notesTag + task.title;
		const emoji = task.emoji?.trim() ? firstGrapheme(task.emoji) : "";
		return { emoji, core };
	}

	/**
	 * Narrow bars: stack title + state (class mirrors CSS). Uses ResizeObserver
	 * because `@container` is unreliable in Obsidian’s embedded Chromium.
	 */
	private bindTaskBarStackLayout(element_task_bar: HTMLElement): void {
		const apply = (): void => {
			const w = element_task_bar.offsetWidth;
			const thresholdPx = this.api.getTaskBarStackLayoutBreakpointPx();
			element_task_bar.toggleClass(
				"timeline-task-row-task-bar--stacked",
				w > 0 && w < thresholdPx
			);
		};
		apply();
		requestAnimationFrame(apply);
		const ro = new ResizeObserver(apply);
		ro.observe(element_task_bar);
		this.taskBarStackObservers.push(ro);
	}

	/**
	 * Filled state: full pill uses state color; hover/focus/active kept identical so
	 * opening the native menu does not flash theme “unhovered” chrome.
	 */
	private styleTaskStateSelect(el: HTMLElement, fillHex: string | null): void {
		el.removeClass("timeline-task-row-task-bar-state-select--filled");
		
		if (!fillHex?.trim()) {
			el.style.removeProperty("--tp-state-fill");
			return;
		}
		
		el.style.setProperty("--tp-state-fill", fillHex.trim());
		el.addClass("timeline-task-row-task-bar-state-select--filled");
	}

	/** Uses theme bar CSS when both task and plugin default are empty. */
	private applyTaskBarColor(element_task_bar: HTMLElement, task: TimelineTask): void {
		const fallback = this.api.getDefaultTaskBarColor().trim();
		const rawColor = (task.color?.trim() || fallback) || "";
		const useCustom = rawColor.length > 0;
		
		element_task_bar.classList.toggle("timeline-task-row-task-bar--custom", useCustom);

		if (useCustom) {
			element_task_bar.style.background = barAccentLikeGradient(rawColor);
			element_task_bar.style.borderColor = `color-mix(in srgb, ${rawColor} 55%, black)`;
		} else {
			element_task_bar.style.removeProperty("background");
			element_task_bar.style.removeProperty("border-color");
		}
	}

	private sateButtonPressCallback(ev: MouseEvent, task: TimelineTask, taskStates: TaskStateDefinition[], stateBtn: HTMLElement){
		ev.stopPropagation();

		if (
			this.taskStateMenu
			&& this.taskStateMenuAnchor === stateBtn
		) {
			this.taskStateMenu.hide();
			return;
		}
		this.taskStateMenu?.hide();

		const currentId =
			task.stateId?.trim()
			&& taskStates.some((s) => s.id === task.stateId!.trim())
				? task.stateId!.trim()
				: "";
		const menu = new Menu();
		this.taskStateMenu = menu;
		this.taskStateMenuAnchor = stateBtn;
		menu.onHide(() => {
			if (this.taskStateMenu === menu) {
				this.taskStateMenu = null;
				this.taskStateMenuAnchor = null;
			}
		});
		menu.setUseNativeMenu(false);

		menu.addItem((item) => {
			item.setTitle(DisplayedTexts.taskModal.taskStateNone);
			item.setChecked(currentId === "");
			item.onClick(() => {
				const had = task.stateId?.trim();
				if (had) {
					delete task.stateId;
					stateBtn.textContent = DisplayedTexts.taskModal.taskStateNone;
					this.styleTaskStateSelect(stateBtn, null);
					void this.persistAndRedraw();
				}
			});
		});

		for (const s of taskStates) {
			menu.addItem((item) => {
				item.setTitle(s.name);
				item.setChecked(currentId === s.id);
				item.onClick(() => {
					if (task.stateId === s.id) {
						return;
					}
					task.stateId = s.id;
					stateBtn.textContent = s.name;
					this.styleTaskStateSelect(stateBtn, s.color);
					void this.persistAndRedraw();
				});
			});
		}
		menu.showAtMouseEvent(ev);
	}
}
