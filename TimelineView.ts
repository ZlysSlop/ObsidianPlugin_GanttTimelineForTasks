import { FileView, Notice, TFile, WorkspaceLeaf } from "obsidian";
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
import type { TimelinePlannerData, TimelineTask } from "./types";
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

	constructor(
		leaf: WorkspaceLeaf,
		api: {
			persist: (v: TimelineView) => Promise<void>;
			getDefaultTaskBarColor: () => string;
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
		return this.file ? this.file.basename : "Timeline";
	}

	getIcon(): string {
		return "calendar-range";
	}

	private updateToolbarPath(): void {
		if (!this.filePathLabelEl) return;
		this.filePathLabelEl.setText(this.file?.path ?? "—");
	}

	private async loadDataFromFile(file: TFile): Promise<void> {
		const parsed = await readTimelineZlyFile(this.app, file);
		if (parsed) {
			Object.assign(this.data, parsed);
			this.data.tasks = parsed.tasks.slice();
		} else {
			this.data = createEmptyPlannerData();
			new Notice(
				"Could not parse this .zly-timeline file (invalid JSON?). Using empty planner."
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
			titleRow.createEl("span", { text: "Timeline" });
			this.filePathLabelEl = titleRow.createEl("span", {
				cls: "timeline-planner-file-label",
			});
			this.updateToolbarPath();
	
			const addBtn = toolbar.createEl("button", { text: "New task" });
			addBtn.addEventListener("click", () => this.addTask());
	
			const todayBtn = toolbar.createEl("button", { text: "Jump to today" });
			todayBtn.addEventListener("click", () => {
				const t = parseYmd(todayYmd());
				this.data.rangeStart = formatYmd(addDays(t, -7));
				this.persistAndRedraw();
			});
	
			const backBtn = toolbar.createEl("button", { text: "◀" });
			backBtn.setAttr("aria-label", "Earlier");
			backBtn.addEventListener("click", () => {
				this.data.rangeStart = formatYmd(
					addDays(parseYmd(this.data.rangeStart), -14)
				);
				this.persistAndRedraw();
			});
	
			const fwdBtn = toolbar.createEl("button", { text: "▶" });
			fwdBtn.setAttr("aria-label", "Later");
			fwdBtn.addEventListener("click", () => {
				this.data.rangeStart = formatYmd(
					addDays(parseYmd(this.data.rangeStart), 14)
				);
				this.persistAndRedraw();
			});
	
			toolbar.createDiv({ cls: "timeline-planner-spacer" });

			const zoom = toolbar.createDiv({ cls: "timeline-planner-zoom" });
			if(zoom){
				zoom.setAttr(
					"title",
					"Ctrl + Scroll on the timeline to zoom in or out."
				);

				zoom.createSpan({ cls: "timeline-planner-zoom-label", text: "Zoom" });

				const minus = zoom.createEl("button", { text: "−" });
				minus.setAttr("aria-label", "Zoom out");
				minus.addEventListener("click", () => {
					this.applyZoomDelta(-TimelineView.ZOOM_STEP);
				});

				const plus = zoom.createEl("button", { text: "+" });
				plus.setAttr("aria-label", "Zoom in");
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
					text: "Shift selection",
				});

				const nudgeLeft = selTools.createEl("button", { text: "◀" });
				nudgeLeft.setAttr(
					"title",
					"Move all selected tasks one day earlier (Ctrl+click bars to select)"
				);
				nudgeLeft.setAttr("aria-label", "Selected tasks one day earlier");
				nudgeLeft.addEventListener("click", () => this.shiftSelectedTasksByDays(-1));
				
				const nudgeRight = selTools.createEl("button", { text: "▶" });
				nudgeRight.setAttr(
					"title",
					"Move all selected tasks one day later (Ctrl+click bars to select)"
				);
				nudgeRight.setAttr("aria-label", "Selected tasks one day later");
				nudgeRight.addEventListener("click", () => this.shiftSelectedTasksByDays(1));
			}
		}

		const scroll = this.rootEl.createDiv({ cls: "timeline-planner-scroll" });
		this.scrollEl = scroll;
		scroll.setAttr(
			"title",
			"Right Click-drag: move up/down through tasks, left/right to change which days are visible.\nWheel: scroll. Ctrl + Scroll: to zoom in or out."
		);

		this.registerDomEvent(scroll, "mousedown", (ev: MouseEvent) => {
			if (ev.button !== 2) return;
			if (!this.file || !this.scrollEl) return;

			const t = ev.target as HTMLElement;
			if (t.closest("button, a, input, textarea")) return;

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
			this.redraw();
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
			this.redraw();
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
			new Notice("No timeline file loaded.");
			return;
		}
		if (this.selectedTaskIds.size === 0) {
			new Notice("No tasks selected. Ctrl+click bars to select.");
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
			const st = this.scrollEl.scrollTop;
			this.redraw();
			this.scrollEl.scrollTop = st;
		});
	}

	/** One full redraw per frame max while moving or resizing a task bar. */
	private scheduleDragRedraw(): void {
		if (this.dragRedrawRafId !== null) return;
		this.dragRedrawRafId = requestAnimationFrame(() => {
			this.dragRedrawRafId = null;
			if (!this.dragState) return;
			this.redraw();
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

		this.redraw();
	}

	/** Drag a selection box on empty track (not on a task bar). */
	private bindMarqueeOnTrack(track: HTMLElement): void {
		track.addEventListener("mousedown", (ev) => {
			if (ev.button !== 0 || !this.file) {
				return;
			}

			if ((ev.target as HTMLElement).closest(".timeline-task-row-task-bar")) {
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

	private redraw(): void {
		if (!this.headerRowEl || !this.bodyEl) return;

		this.data.dayCount = this.computeVisibleDayCount();

		this.mainWrapEl
			?.querySelectorAll(".timeline-planner-today-line")
			.forEach((el) => el.remove());

		this.headerRowEl.empty();
		this.bodyEl.empty();

		if (!this.file) {
			this.bodyEl.createDiv({
				cls: "timeline-planner-empty",
				text: "No .zly-timeline file loaded.",
			});
			return;
		}

		const rs = parseYmd(this.data.rangeStart);
		const dayW = this.data.pixelsPerDay;
		this.rootEl.style.setProperty("--tp-day-w", `${dayW}px`);

		const grid = this.headerRowEl;
		grid.style.gridTemplateColumns = `${TIMELINE_LABEL_COLUMN_PX}px repeat(${this.data.dayCount}, ${dayW}px)`;

		grid.createDiv({ cls: "timeline-planner-spacer" });

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
			
			head.setAttr("title", formatYmd(d));
		}

		if (this.data.tasks.length === 0) {
			this.bodyEl.createDiv({
				cls: "timeline-planner-empty",
				text: 'No tasks yet. Click "New task" to add one.',
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
		const row = this.bodyEl.createDiv({ cls: "timeline-task-row" });

		const label = row.createDiv({ cls: "timeline-task-row-label" });
		const handle = label.createDiv({
			cls: "timeline-task-row-movehandle",
			text: "⋮⋮",
		});
		handle.setAttr("aria-label", "Drag to reorder");
		handle.setAttr(
			"title",
			"Drag up or down to reorder (or drag the bar vertically on the timeline)"
		);
		handle.addEventListener("mousedown", (ev) => {
			if (ev.button !== 0) return;
			ev.preventDefault();
			ev.stopPropagation();
			this.selectedTaskIds.clear();
			this.dragState = { mode: "reorder", taskId: task.id };
			this.syncDocumentCursorFromInteractionState();
		});

		const { emoji: titleEmoji, core: titleCore } = this.taskLabelParts(task);
		const task_title_label = titleCore || "[untitled]";
		const task_title_bar = titleCore || "(untitled)";

		const labelMain = label.createDiv({ cls: "timeline-task-row-info-panel" });
		const titleEl = labelMain.createDiv({
			cls: "timeline-task-row-info-panel-title",
		});
		if (titleEmoji) {
			titleEl.createSpan({
				cls: "timeline-task-row-title-emoji",
				text: titleEmoji,
			});
		}
		titleEl.createSpan({
			cls: "timeline-task-row-title-text",
			text: task_title_label,
		});
		titleEl.addEventListener("click", (e) => {
			e.preventDefault();
			this.openEditModal(task);
		});

		const meta = labelMain.createDiv({ cls: "timeline-task-row-info-panel-meta" });
		meta.setText(`${task.start} → ${task.end}`);

		const actions = labelMain.createDiv({ cls: "timeline-task-row-info-panel-actions" });
		const delBtn = actions.createEl("button", { text: "x" });
		delBtn.addEventListener("click", () => this.deleteTask(task.id));

		const track = row.createDiv({ cls: "timeline-task-row-track" });
		track.style.minWidth = `${this.data.dayCount * dayW}px`;
		this.bindMarqueeOnTrack(track);

		const ts = parseYmd(task.start);
		const te = parseYmd(task.end);
		const { start, end } = clampDateOrder(ts, te);

		const rangeEnd = addDays(rangeStart, this.data.dayCount - 1);
		if (end < rangeStart || start > rangeEnd) {
			track.createDiv({
				cls: "timeline-planner-empty",
				text: "Outside visible range — use ◀ ▶ or Jump to today.",
			});
			return;
		}

		const visStart = start < rangeStart ? rangeStart : start;
		const visEnd = end > rangeEnd ? rangeEnd : end;

		const i0 = daysBetweenInclusive(rangeStart, visStart);
		const span = daysBetweenInclusive(visStart, visEnd) + 1;

		const bar = track.createDiv({
			cls:
				"timeline-task-row-task-bar" +
				(this.selectedTaskIds.has(task.id) ? " is-selected" : ""),
		});
		bar.dataset.taskId = task.id;
		bar.style.left = `${i0 * dayW}px`;
		bar.style.width = `${span * dayW - 4}px`;
		bar.setAttr(
			"title",
			"Double-click to edit. Ctrl+click to multi-select, or drag on empty track to box-select. Drag horizontally to move in time; drag vertically to reorder (or use ⋮⋮)."
		);

		
		if (titleEmoji) {
			bar.createSpan({
				cls: "timeline-task-row-task-bar-emoji",
				text: titleEmoji,
			});
		}
		bar.createDiv({
			cls: "timeline-task-row-task-bar-text",
			text: task_title_bar,
		});
		this.applyTaskBarColor(bar, task);
		bar.addEventListener("dblclick", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			this.openEditModal(task);
		});

		const hL = bar.createDiv({
			cls: "timeline-task-row-task-bar-handle timeline-task-row-task-bar-handle-left",
		});
		const hR = bar.createDiv({
			cls: "timeline-task-row-task-bar-handle timeline-task-row-task-bar-handle-right",
		});

		bar.addEventListener("mousedown", (ev) => {
			if (ev.button !== 0) return;
			if (ev.target === hL || ev.target === hR) return;
			if (ev.ctrlKey || ev.metaKey) {
				ev.preventDefault();
				ev.stopPropagation();
				if (this.selectedTaskIds.has(task.id)) {
					this.selectedTaskIds.delete(task.id);
				} else {
					this.selectedTaskIds.add(task.id);
				}
				this.redraw();
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
			if (ev.button !== 0) return;
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
			if (ev.button !== 0) return;
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
			if (!this.dragState) return;
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
			if (!task) return;

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
				this.panState ||
				this.dragState ||
				this.marqueeState ||
				this.appliedDocumentCursorClass !== null
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
					const st = this.scrollEl.scrollTop;
					this.redraw();
					this.scrollEl.scrollTop = st;
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
					this.redraw();
				}
				this.endMarqueeGesture();
			}
			if (this.dragState) {
				const wasPendingBar = this.dragState.mode === "pending-bar";
				if (this.dragRedrawRafId !== null) {
					cancelAnimationFrame(this.dragRedrawRafId);
					this.dragRedrawRafId = null;
					this.redraw();
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
			new Notice("No timeline file loaded.");
			return;
		}
		const t0 = parseYmd(todayYmd());
		const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const task: TimelineTask = {
			id,
			title: "New task",
			text: "",
			start: formatYmd(t0),
			end: formatYmd(addDays(t0, 2)),
		};
		this.data.tasks.push(task);
		new Notice("Task added — drag the bar or edges to plan.");
		void this.persistAndRedraw();
		this.openEditModal(task);
	}

	private deleteTask(id: string): void {
		this.selectedTaskIds.delete(id);
		this.data.tasks = this.data.tasks.filter((t) => t.id !== id);
		new Notice("Task removed.");
		void this.persistAndRedraw();
	}

	private openEditModal(task: TimelineTask): void {
		new TaskEditModal(
			this.app,
			task,
			(updated) => {
				const { color: colorUp, emoji: emojiUp, ...rest } = updated;
				Object.assign(task, rest);
				if (colorUp !== undefined) {
					if (!String(colorUp).trim()) delete task.color;
					else task.color = String(colorUp).trim();
				}
				if (emojiUp !== undefined) {
					const e = String(emojiUp).trim();
					if (e) task.emoji = firstGrapheme(e);
					else delete task.emoji;
				}
				void this.persistAndRedraw();
			},
			this.api.getDefaultTaskBarColor()
		).open();
	}

	/** Notes tag + title (no emoji); emoji is separate for layout. */
	private taskLabelParts(task: TimelineTask): { emoji: string; core: string } {
		const notesTag =
			task.text.length > 0 && task.title.length > 0 ? "[~] " : "";
		const core = notesTag + task.title;
		const emoji = task.emoji?.trim() ? firstGrapheme(task.emoji) : "";
		return { emoji, core };
	}

	/** Uses theme bar CSS when both task and plugin default are empty. */
	private applyTaskBarColor(bar: HTMLElement, task: TimelineTask): void {
		const fallback = this.api.getDefaultTaskBarColor().trim();
		const rawColor = (task.color?.trim() || fallback) || "";
		const useCustom = rawColor.length > 0;
		
		bar.classList.toggle("timeline-task-row-task-bar--custom", useCustom);

		if (useCustom) {
			bar.style.background = barAccentLikeGradient(rawColor);
			bar.style.borderColor = `color-mix(in srgb, ${rawColor} 55%, black)`;
		} else {
			bar.style.removeProperty("background");
			bar.style.removeProperty("border-color");
		}
	}
}
