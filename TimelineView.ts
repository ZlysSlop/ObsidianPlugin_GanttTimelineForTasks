import {
	App,
	ItemView,
	Notice,
	TFile,
	ViewStateResult,
	WorkspaceLeaf,
	normalizePath,
} from "obsidian";
import { TIMELINE_LABEL_COLUMN_PX, TIMELINE_VIEW_TYPE } from "./constants";
import {
	addDays,
	clampDateOrder,
	daysBetweenInclusive,
	formatYmd,
	fractionOfLocalDayElapsed,
	parseYmd,
	todayYmd,
} from "./dateUtils";
import { TaskEditModal } from "./TaskEditModal";
import type { TimelinePlannerData, TimelineTask } from "./types";
import { createEmptyPlannerData, readTimelineFromFile } from "./timelineStorage";

export { TIMELINE_VIEW_TYPE };

function moveInArray<T>(arr: T[], from: number, to: number): void {
	if (from === to) return;
	if (from < 0 || from >= arr.length) return;
	if (to < 0 || to >= arr.length) return;
	const [item] = arr.splice(from, 1);
	arr.splice(to, 0, item);
}

export class TimelineView extends ItemView {
	private static readonly ZOOM_MIN = 16;
	private static readonly ZOOM_MAX = 80;
	private static readonly ZOOM_STEP = 4;
	/** Bar drag: movement past this picks vertical reorder vs horizontal date move. */
	private static readonly PENDING_BAR_DRAG_PX = 6;
	/** Limits trackpad “pinch as ctrl+wheel” from jumping zoom too fast. */
	private static readonly WHEEL_ZOOM_MIN_INTERVAL_MS = 90;

	data: TimelinePlannerData;
	private timelineFile: TFile | null = null;
	private rootEl!: HTMLElement;
	/** Scrollport for the grid + task rows (right-drag pans this element). */
	private scrollEl: HTMLElement | null = null;
	private mainWrapEl: HTMLElement | null = null;
	private headerRowEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private readonly api: {
		persist: (v: TimelineView) => Promise<void>;
	};
	private dragState:
		| {
				mode: "move" | "resize-left" | "resize-right";
				taskId: string;
				startX: number;
				origStart: Date;
				origEnd: Date;
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
		api: { persist: (v: TimelineView) => Promise<void> }
	) {
		super(leaf);
		this.api = api;
		this.data = createEmptyPlannerData();
		this.navigation = true;
	}

	getTimelineFile(): TFile | null {
		return this.timelineFile;
	}

	ownsFilePath(path: string): boolean {
		return this.timelineFile?.path === path;
	}

	getViewType(): string {
		return TIMELINE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.timelineFile
			? `Timeline: ${this.timelineFile.basename}`
			: "Timeline";
	}

	getIcon(): string {
		return "calendar-range";
	}

	getState(): Record<string, unknown> {
		return { filePath: this.timelineFile?.path ?? "" };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = state as { filePath?: string } | null;
		if (s?.filePath) {
			await this.attachFileByPath(s.filePath);
			if (this.headerRowEl) {
				this.redraw();
			}
		}
	}

	private async attachFileByPath(path: string): Promise<void> {
		const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(f instanceof TFile)) return;
		this.timelineFile = f;
		await this.loadFromFileIntoData();
	}

	private async resolveFileFromLeaf(): Promise<void> {
		if (this.timelineFile) return;
		const vs = this.leaf.getViewState();
		const fp = (vs.state as { filePath?: string } | undefined)?.filePath;
		if (fp) await this.attachFileByPath(fp);
	}

	private async loadFromFileIntoData(): Promise<void> {
		if (!this.timelineFile) return;
		const fromMd = await readTimelineFromFile(this.app, this.timelineFile);
		if (fromMd) {
			Object.assign(this.data, fromMd);
			this.data.tasks = fromMd.tasks.slice();
		} else {
			this.data = createEmptyPlannerData();
		}
	}

	async reloadFromDisk(): Promise<void> {
		await this.loadFromFileIntoData();
		this.redraw();
	}

	async onOpen(): Promise<void> {
		await this.resolveFileFromLeaf();

		this.containerEl.empty();
		this.containerEl.addClass("timeline-planner-container");

		this.rootEl = this.containerEl.createDiv({ cls: "timeline-planner-root" });

		const toolbar = this.rootEl.createDiv({ cls: "timeline-planner-toolbar" });
		const titleRow = toolbar.createDiv({ cls: "timeline-planner-title-row" });
		titleRow.createEl("span", { text: "Timeline" });
		if (this.timelineFile) {
			titleRow.createEl("span", {
				cls: "timeline-planner-file-label",
				text: this.timelineFile.path,
			});
		}

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

		const zoom = toolbar.createDiv({ cls: "timeline-planner-zoom" });
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
		zoom.setAttr(
			"title",
			"Ctrl + Scroll on the timeline to zoom in or out."
		);

		const scroll = this.rootEl.createDiv({ cls: "timeline-planner-scroll" });
		this.scrollEl = scroll;
		scroll.setAttr(
			"title",
			"Right Click-drag: move up/down through tasks, left/right to change which days are visible.\nWheel: scroll. Ctrl + Scroll: to zoom in or out."
		);
		this.registerDomEvent(scroll, "mousedown", (ev: MouseEvent) => {
			if (ev.button !== 2) return;
			if (!this.timelineFile || !this.scrollEl) return;
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
				this.timelineFile &&
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

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (this.timelineFile?.path === oldPath && file instanceof TFile) {
					this.timelineFile = file;
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

		if (!this.timelineFile) {
			this.bodyEl.createDiv({
				cls: "timeline-planner-empty",
				text: "No note linked.\nClose this tab and use the calendar ribbon while a markdown note is open.",
			});
			return;
		}

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
		this.scrollEl = null;
		this.clearDocumentCursorOverride();
		this.containerEl.empty();
	}

	private async persistAndRedraw(): Promise<void> {
		if (!this.timelineFile) return;
		await this.api.persist(this);
		this.redraw();
	}

	private applyZoomDelta(delta: number): void {
		if (!this.timelineFile) return;
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

	/** Ctrl+scroll (⌘+scroll on macOS) — same as the +/− zoom buttons. */
	private onWheelZoom(ev: WheelEvent): void {
		if (!this.timelineFile) return;
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
		const rows = this.bodyEl.querySelectorAll(".timeline-planner-row");
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

	private redraw(): void {
		if (!this.headerRowEl || !this.bodyEl) return;

		this.data.dayCount = this.computeVisibleDayCount();

		this.mainWrapEl
			?.querySelectorAll(".timeline-planner-today-line")
			.forEach((el) => el.remove());

		this.headerRowEl.empty();
		this.bodyEl.empty();

		if (!this.timelineFile) {
			this.bodyEl.createDiv({
				cls: "timeline-planner-empty",
				text: "No note linked.",
			});
			return;
		}

		const rs = parseYmd(this.data.rangeStart);
		const dayW = this.data.pixelsPerDay;
		this.rootEl.style.setProperty("--tp-day-w", `${dayW}px`);

		const grid = this.headerRowEl;
		grid.style.gridTemplateColumns = `${TIMELINE_LABEL_COLUMN_PX}px repeat(${this.data.dayCount}, ${dayW}px)`;

		grid.createDiv({ cls: "timeline-planner-dayhead" });
		for (let i = 0; i < this.data.dayCount; i++) {
			const d = addDays(rs, i);
			const w = d.getDay();
			const head = grid.createDiv({
				cls: "timeline-planner-dayhead",
				text: `${d.getDate()}`,
			});
			if (w === 0 || w === 6) head.addClass("is-weekend");
			if (formatYmd(d) === todayYmd()) head.addClass("is-today");
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
		if (!this.mainWrapEl) return;
		const today = parseYmd(todayYmd());
		const idx = daysBetweenInclusive(rangeStart, today);
		if (idx < 0 || idx >= this.data.dayCount) return;

		const labelCol = TIMELINE_LABEL_COLUMN_PX;
		const t = fractionOfLocalDayElapsed();
		const leftPx = labelCol + idx * dayW + t * dayW;
		const line = this.mainWrapEl.createDiv({ cls: "timeline-planner-today-line" });
		line.style.left = `${leftPx}px`;
	}

	/** Recompute cursor x from clock (no full redraw). */
	private refreshTodayLinePosition(): void {
		if (!this.mainWrapEl || !this.timelineFile) return;
		const rs = parseYmd(this.data.rangeStart);
		const dayW = this.data.pixelsPerDay;
		this.mainWrapEl
			.querySelectorAll(".timeline-planner-today-line")
			.forEach((el) => el.remove());
		this.placeTodayLine(rs, dayW);
	}

	private renderTaskRow(task: TimelineTask, rangeStart: Date, dayW: number): void {
		const row = this.bodyEl.createDiv({ cls: "timeline-planner-row" });

		const label = row.createDiv({ cls: "timeline-planner-row-label" });
		const handle = label.createDiv({
			cls: "timeline-planner-row-handle",
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
			this.dragState = { mode: "reorder", taskId: task.id };
			this.syncDocumentCursorFromInteractionState();
		});

		const labelMain = label.createDiv({ cls: "timeline-planner-row-label-main" });
		const titleEl = labelMain.createDiv({
			cls: "timeline-planner-row-title",
			text: task.title || "(untitled)",
		});
		titleEl.addEventListener("click", (e) => {
			e.preventDefault();
			this.openEditModal(task);
		});

		const meta = labelMain.createDiv({ cls: "timeline-planner-row-meta" });
		meta.setText(`${task.start} → ${task.end}`);

		const actions = labelMain.createDiv({ cls: "timeline-planner-row-actions" });
		const editBtn = actions.createEl("button", { text: "Edit" });
		editBtn.addEventListener("click", () => this.openEditModal(task));
		const delBtn = actions.createEl("button", { text: "Delete" });
		delBtn.addEventListener("click", () => this.deleteTask(task.id));

		const track = row.createDiv({ cls: "timeline-planner-track" });
		track.style.minWidth = `${this.data.dayCount * dayW}px`;

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

		const bar = track.createDiv({ cls: "timeline-planner-bar" });
		bar.style.left = `${i0 * dayW}px`;
		bar.style.width = `${span * dayW - 4}px`;
		bar.setAttr(
			"title",
			"Double-click to edit. Drag horizontally to move in time; drag vertically to reorder (or use ⋮⋮)."
		);
		bar.createDiv({
			cls: "timeline-planner-bar-text",
			text: task.title || "(untitled)",
		});
		bar.addEventListener("dblclick", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			this.openEditModal(task);
		});

		const hL = bar.createDiv({
			cls: "timeline-planner-handle timeline-planner-handle-left",
		});
		const hR = bar.createDiv({
			cls: "timeline-planner-handle timeline-planner-handle-right",
		});

		bar.addEventListener("mousedown", (ev) => {
			if (ev.button !== 0) return;
			if (ev.target === hL || ev.target === hR) return;
			ev.preventDefault();
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
					this.dragState = { mode: "reorder", taskId: st.taskId };
				} else {
					this.dragState = {
						mode: "move",
						taskId: st.taskId,
						startX: st.startX,
						origStart: st.origStart,
						origEnd: st.origEnd,
					};
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
					this.timelineFile &&
					this.data.rangeStart !== initialRange
				) {
					void this.api.persist(this);
				}
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
		if (!this.timelineFile) {
			new Notice("No note linked to this timeline.");
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
		this.data.tasks = this.data.tasks.filter((t) => t.id !== id);
		new Notice("Task removed.");
		void this.persistAndRedraw();
	}

	private openEditModal(task: TimelineTask): void {
		new TaskEditModal(this.app, task, (updated) => {
			Object.assign(task, updated);
			void this.persistAndRedraw();
		}).open();
	}
}
