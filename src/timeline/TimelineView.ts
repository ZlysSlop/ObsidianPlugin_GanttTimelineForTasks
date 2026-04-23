import { FileView, Menu, Notice, TFile, WorkspaceLeaf } from "obsidian";
import {
	TIMELINE_LABEL_COLUMN_PX,
	TIMELINE_VIEW_TYPE,
	TIMELINE_VISIBLE_DAYS_MAX,
	TIMELINE_VISIBLE_DAYS_MIN,
	ZLY_TIMELINE_EXTENSION,
} from "../constants";
import {
	addDays,
	clampDateOrder,
	formatYmd,
	parseYmd,
	todayYmd,
} from "../dateUtils";
import type { EmojiPickerCategoryForModal } from "../emoji/emojiPickerRuntime";
import { firstGrapheme } from "../emoji/emojiUtils";
import { createStampedId } from "../idUtils";
import type { TaskStateDefinition } from "../settings/settingsData";
import { TaskEditModal } from "../TaskEditModal";
import {
	TIMELINE_MARQUEE_DRAG_PX,
	TIMELINE_PENDING_BAR_DRAG_PX,
	TIMELINE_WHEEL_ZOOM_MIN_INTERVAL_MS,
} from "./timelineConstants";
import {
	placeTodayLine,
	removeTodayLineElements,
	renderDayHeaderRow,
} from "./timelineDayGrid";
import { createTimelineToolbar } from "./TimelineToolbar";
import {
	clampVisibleDayCount,
	getAvailableDayTrackWidthPx,
	pickZoomSideDeltas,
} from "./timelineLayoutMetrics";
import {
	computeJumpRangeStartYmd,
	computeReorderTargetIndex as computeReorderDropIndex,
	moveTasksToDisplayIndex,
	sortTaskIdsByListOrder,
} from "./timelineUtils";
import { applyTaskStateButtonUi } from "./TimelineTaskBar";
import { renderTimelineTaskRow } from "./TimelineTaskRow";
import { buildTaskRowContext } from "./timelineTaskTrack";
import type {
	TaskDateRange,
	TimelinePlannerData,
	TimelineTask,
} from "./TimelineTypes";
import { DisplayedTexts } from "../DisplayedTexts";
import {
	createEmptyPlannerData,
	readTimelineZlyFile,
} from "./TimelineStorage";

export { TIMELINE_VIEW_TYPE };

export class TimelineView extends FileView {

	data: TimelinePlannerData;
	private rootEl!: HTMLElement;
	/** Scrollport + root for grid, rows, and today line (right-drag pans this element). */
	private mainWrapEl: HTMLElement | null = null;
	private headerRowEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private readonly api: {
		persist: (v: TimelineView) => Promise<void>;
		getDefaultTaskBarColor: () => string;
		getTaskStates: () => TaskStateDefinition[];
		getTaskBarStackLayoutBreakpointPx: () => number;
		getTimelineZoomDayStep: () => number;
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
			groupOrigins?: Map<string, TaskDateRange>;
		  }
		| {
			mode: "pending-bar";
			taskId: string;
			startX: number;
			startY: number;
			origStart: Date;
			origEnd: Date;
			duplicateOnVertical?: boolean;
			toggleSelectionOnMouseUp?: boolean;
		  }
		| { mode: "reorder"; taskIds: string[] }
		| {
				mode: "reorder-duplicate-pending";
				taskIds: string[];
				startX: number;
				startY: number;
		  }
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
	/**
	 * Zoom in/out splits the day delta across both ends of the visible range; when the
	 * split is uneven, this toggles so the larger half alternates between start and end.
	 */
	private zoomSplitAlternate = false;
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
			getTimelineZoomDayStep: () => number;
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

		createTimelineToolbar(this.rootEl, this);

		this.mainWrapEl = this.rootEl.createDiv({ cls: "timeline-planner-main" });
		this.registerDomEvent(this.mainWrapEl, "mousedown", (ev: MouseEvent) => {
			if (ev.button !== 2) return;
			if (!this.file || !this.mainWrapEl) return;

			const t = ev.target as HTMLElement;
			if (t.closest("button, a, input, textarea, select")) return;

			ev.preventDefault();

			const el = this.mainWrapEl;
			this.panState = {
				startX: ev.clientX,
				startY: ev.clientY,
				initialRangeStart: this.data.rangeStart,
				initialScrollTop: el.scrollTop,
			};

			el.classList.add("timeline-planner-main--panning");

			this.syncDocumentCursorFromInteractionState();
		});

		this.registerDomEvent(this.mainWrapEl, "contextmenu", (ev: MouseEvent) => {
			if (this.panState) ev.preventDefault();
		});

		this.headerRowEl = this.mainWrapEl.createDiv({
			cls: "timeline-planner-grid",
		});
		this.bodyEl = this.mainWrapEl.createDiv({ cls: "timeline-planner-rows" });

		this.resizeObserver = new ResizeObserver(() => {
			const prevDayCount = this.data.dayCount;
			const prevPpd = this.data.pixelsPerDay;
			this.redrawPreservingScroll();
			if (
				this.file &&
				(this.data.dayCount !== prevDayCount ||
					Math.abs(this.data.pixelsPerDay - prevPpd) > 0.01)
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
		this.resizeObserver.observe(this.mainWrapEl);
		

		this.registerDomEvent(window, "mousemove",
			(ev: MouseEvent) => this.onGlobalMouseMove(ev)
		);
		
		this.registerDomEvent(window, "mouseup", () => this.onGlobalMouseUp());

		this.registerDomEvent(window, "keydown", (ev: KeyboardEvent) => {
			if (ev.key === "Delete" && this.selectedTaskIds.size > 0) {
				if (this.isEditableKeyboardTarget(ev.target)) {
					return;
				}
				
				ev.preventDefault();
				this.deleteSelectedTasks();
				
				return;
			}

			if (ev.key !== "Escape") {
				return;
			}

			if (this.marqueeState) {
				ev.preventDefault();
				this.endMarqueeGesture();
				return;
			}

			if (this.selectedTaskIds.size === 0) {
				return;
			}

			ev.preventDefault();
			this.selectedTaskIds.clear();
			this.redrawPreservingScroll();
		});

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
		this.mainWrapEl = null;
		this.clearDocumentCursorOverride();
		this.containerEl.empty();
	}


	async persistAndRedraw(): Promise<void> {
		if (!this.file) return;
		await this.api.persist(this);
		this.redrawPreservingScroll();
	}

	private isEditableKeyboardTarget(target: EventTarget | null): boolean {
		const el = target as HTMLElement | null;
		
		if (!el) {
			return false;
		}

		if (el.isContentEditable) {
			return true;
		}

		return !!el.closest("input, textarea, select, [contenteditable='true']");
	}

	private deleteSelectedTasks(): void {
		if (this.selectedTaskIds.size === 0) {
			return;
		}

		const selected = new Set(this.selectedTaskIds);
		this.data.tasks = this.data.tasks.filter((t) => !selected.has(t.id));
		this.selectedTaskIds.clear();
		
		new Notice(DisplayedTexts.timeline.noticeTaskRemoved);
		
		void this.persistAndRedraw();
	}

	/** Toolbar — place today near the start of the visible range (same as legacy jump). */
	toolbarJumpToToday(): void {
		const t = parseYmd(todayYmd());
		this.data.rangeStart = formatYmd(addDays(t, -7));
		void this.persistAndRedraw();
	}

	/** Toolbar — shift `rangeStart` by `delta` calendar days (negative = earlier). */
	toolbarShiftVisibleRangeByDays(delta: number): void {
		this.data.rangeStart = formatYmd(
			addDays(parseYmd(this.data.rangeStart), delta)
		);
		void this.persistAndRedraw();
	}

	/** Toolbar — zoom out by the configured day step. */
	toolbarZoomOut(): void {
		this.applyZoomDayDelta(this.api.getTimelineZoomDayStep());
	}

	/** Toolbar — zoom in by the configured day step. */
	toolbarZoomIn(): void {
		this.applyZoomDayDelta(-this.api.getTimelineZoomDayStep());
	}


	/**
	 * Moves `rangeStart` so the task interval is visible: centered when the task is
	 * shorter than the viewport, otherwise aligned to the task start.
	 */
	private jumpRangeToShowTask(taskStart: Date, taskEnd: Date): void {
		if (!this.file) return;
		this.data.rangeStart = computeJumpRangeStartYmd(
			taskStart,
			taskEnd,
			this.data.dayCount
		);
		void this.persistAndRedraw();
	}

	/** Positive = more days visible (zoom out); negative = fewer days (zoom in). */
	applyZoomDayDelta(dayDelta: number): void {
		if (!this.file) return;
		if (dayDelta === 0) return;
		const zoomOut = dayDelta > 0;
		let s = Math.abs(Math.round(dayDelta));
		if (s < 1) return;

		const rs = parseYmd(this.data.rangeStart);

		if (zoomOut) {
			const maxAdd = TIMELINE_VISIBLE_DAYS_MAX - this.data.dayCount;
			if (maxAdd <= 0) return;
			s = Math.min(s, maxAdd);
			const [startSide] = pickZoomSideDeltas(s, this.zoomSplitAlternate);
			this.data.rangeStart = formatYmd(addDays(rs, -startSide));
			this.data.dayCount += s;
		} else {
			const maxRemove = this.data.dayCount - TIMELINE_VISIBLE_DAYS_MIN;
			if (maxRemove <= 0) return;
			s = Math.min(s, maxRemove);
			const [startSide] = pickZoomSideDeltas(s, this.zoomSplitAlternate);
			this.data.rangeStart = formatYmd(addDays(rs, startSide));
			this.data.dayCount -= s;
		}

		this.zoomSplitAlternate = !this.zoomSplitAlternate;
		void this.persistAndRedraw();
	}


	shiftSelectedTasksByDays(delta: number): void {
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


	private onWheelZoom(ev: WheelEvent): void {
		if (!this.file) return;
		if (!ev.ctrlKey && !ev.metaKey) return;

		const now = Date.now();
		if (
			now - this.lastWheelZoomAt <
			TIMELINE_WHEEL_ZOOM_MIN_INTERVAL_MS
		) {
			ev.preventDefault();
			return;
		}

		this.lastWheelZoomAt = now;
		ev.preventDefault();
		const step = this.api.getTimelineZoomDayStep();
		const dayDelta = (ev.deltaY < 0 ? -1 : 1) * step;
		this.applyZoomDayDelta(dayDelta);
	}

	/** Call when planner data was reloaded from disk so the grid updates. */
	refresh(): void {
		this.redraw();
	}

	/** One full redraw per frame max while horizontally panning (range changes). */
	private schedulePanRedraw(): void {
		if (this.panRedrawRafId !== null) {
			return;
		}
		
		this.panRedrawRafId = requestAnimationFrame(() => {
			this.panRedrawRafId = null;
			
			if (!this.panState || !this.mainWrapEl) {
				return;
			}

			this.redrawPreservingScroll();
		});
	}

	/** One full redraw per frame max while moving or resizing a task bar. */
	private scheduleDragRedraw(): void {
		if (this.dragRedrawRafId !== null) {
			return;
		}

		this.dragRedrawRafId = requestAnimationFrame(() => {
			this.dragRedrawRafId = null;
			
			if (!this.dragState) {
				return;
			}
			
			this.redrawPreservingScroll();
		});
	}

	/**
	 * Drop index: which row’s vertical band contains the pointer (not row midlines).
	 * Swap only when the cursor enters another task row’s bounds.
	 */
	private computeReorderTargetIndex(clientY: number): number {
		if (!this.bodyEl) {
			return 0;
		}

		return computeReorderDropIndex(this.bodyEl, clientY);
	}

	private cloneTaskForDuplicate(
		task: TimelineTask,
		now: number,
		suffix: number
	): TimelineTask {
		const out: TimelineTask = {
			id: createStampedId("t", {
				stamp: now,
				extraParts: [suffix],
				randomLength: 6,
			}),
			title: task.title,
			text: task.text,
			start: task.start,
			end: task.end,
			emoji: task.emoji,
			color: task.color,
			stateId: task.stateId,
		};
		
		return out;
	}

	/**
	 * Inserts a copy of each task in list order, above the block (drag up) or
	 * below it (drag down), then returns the new ids for a follow-up reorder.
	 */
	private insertDuplicateBlockForPendingReorder(
		taskIds: string[],
		insertAbove: boolean
	): string[] {
		const { tasks } = this.data;
		const sortedIds = sortTaskIdsByListOrder(tasks, taskIds);
		const sortedIdxs = sortedIds
			.map((id) => tasks.findIndex((t) => t.id === id))
			.filter((i) => i >= 0)
			.sort((a, b) => a - b);
		
			if (sortedIdxs.length === 0) {
			return [];
		}

		const minIdx = sortedIdxs[0];
		const maxIdx = sortedIdxs[sortedIdxs.length - 1];
		const at = insertAbove ? minIdx : maxIdx + 1;
		const t0 = Date.now();

		const clones: TimelineTask[] = sortedIdxs.map((i, j) =>
			this.cloneTaskForDuplicate(tasks[i], t0, j)
		);

		tasks.splice(at, 0, ...clones);
		
		this.redrawPreservingScroll();
		
		return clones.map((c) => c.id);
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
		if (st.mode === "reorder-duplicate-pending")
			return "timeline-planner-doc-cursor-grab";
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
		if (!this.mainWrapEl) {
			this.redraw();
			return;
		}
		const st = this.mainWrapEl.scrollTop;
		this.redraw();
		this.mainWrapEl.scrollTop = st;
	}

	private redraw(): void {
		if (!this.headerRowEl || !this.bodyEl) return;

		for (const ro of this.taskBarStackObservers) {
			ro.disconnect();
		}
		this.taskBarStackObservers.length = 0;

		this.data.dayCount = clampVisibleDayCount(this.data.dayCount);

		this.mainWrapEl && removeTodayLineElements(this.mainWrapEl);

		this.headerRowEl.empty();
		this.bodyEl.empty();

		if (!this.file) {
			this.rootEl.style.removeProperty("--tp-label-col-w");
			this.rootEl.style.removeProperty("--tp-visible-track-px");
			this.bodyEl.createDiv({
				cls: "timeline-planner-empty",
				text: DisplayedTexts.timeline.emptyNoFileLoaded,
			});
			return;
		}

		const rs = parseYmd(this.data.rangeStart);
		const avail = getAvailableDayTrackWidthPx(this.mainWrapEl);
		const dayW =
			avail > 0
				? avail / this.data.dayCount
				: Math.max(8, this.data.pixelsPerDay);
		this.data.pixelsPerDay = dayW;
		this.rootEl.style.setProperty("--tp-day-w", `${dayW}px`);
		this.rootEl.style.setProperty(
			"--tp-label-col-w",
			`${TIMELINE_LABEL_COLUMN_PX}px`
		);
		this.rootEl.style.setProperty(
			"--tp-visible-track-px",
			`${this.data.dayCount * dayW}px`
		);

		renderDayHeaderRow(this.headerRowEl, rs, this.data.dayCount, dayW, () => this.addTask(true));

		if (this.data.tasks.length === 0) {
			this.bodyEl.createDiv({
				cls: "timeline-planner-empty",
				text: DisplayedTexts.timeline.emptyNoTasks,
			});
		} else {
			const rowCtx = buildTaskRowContext(this);
			for (const task of this.data.tasks) {
				renderTimelineTaskRow(rowCtx, task, rs, dayW);
			}
		}

		if (this.mainWrapEl) {
			placeTodayLine(this.mainWrapEl, rs, this.data.dayCount, dayW);
		}
	}

	/** Recompute cursor x from clock (no full redraw). */
	private refreshTodayLinePosition(): void {
		if (!this.mainWrapEl || !this.file) {
			return;
		}

		const rs = parseYmd(this.data.rangeStart);
		const dayW = this.data.pixelsPerDay;
		removeTodayLineElements(this.mainWrapEl);
		placeTodayLine(this.mainWrapEl, rs, this.data.dayCount, dayW);
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
					if (d < TIMELINE_MARQUEE_DRAG_PX) {
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

			if (this.panState && this.mainWrapEl) {
				const p = this.panState;
				const el = this.mainWrapEl;
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

			if (st.mode === "reorder-duplicate-pending") {
				const dx = ev.clientX - st.startX;
				const dy = ev.clientY - st.startY;

				if (Math.hypot(dx, dy) < TIMELINE_PENDING_BAR_DRAG_PX) {
					ev.preventDefault();
					return;
				}

				if (Math.abs(dy) <= Math.abs(dx)) {
					this.dragState = { mode: "reorder", taskIds: st.taskIds };
				} else {
					const newIds = this.insertDuplicateBlockForPendingReorder(st.taskIds, dy < 0);
					this.dragState = newIds.length > 0
						? { mode: "reorder", taskIds: newIds }
						: { mode: "reorder", taskIds: st.taskIds };
				}
				st = this.dragState;
			}

			if (st.mode === "pending-bar") {
				const dx = ev.clientX - st.startX;
				const dy = ev.clientY - st.startY;
				
				if (Math.hypot(dx, dy) < TIMELINE_PENDING_BAR_DRAG_PX) {
					ev.preventDefault();
					return;
				}

				if (Math.abs(dy) > Math.abs(dx)) {
					if (st.duplicateOnVertical) {
						const primaryId = st.taskId;
						const taskIds =
							this.selectedTaskIds.size > 0 &&
							this.selectedTaskIds.has(primaryId)
								? sortTaskIdsByListOrder(
										this.data.tasks,
										Array.from(this.selectedTaskIds)
									)
								: [primaryId];
						const newIds = this.insertDuplicateBlockForPendingReorder(
							taskIds,
							dy < 0
						);
						this.dragState =
							newIds.length > 0
								? { mode: "reorder", taskIds: newIds }
								: { mode: "reorder", taskIds };
						st = this.dragState;
						ev.preventDefault();
						return;
					}

					const primaryId = st.taskId;
					const taskIds =
						this.selectedTaskIds.size > 0 && this.selectedTaskIds.has(primaryId)
							? sortTaskIdsByListOrder(this.data.tasks, Array.from(this.selectedTaskIds))
							: [primaryId];
					this.dragState = { mode: "reorder", taskIds };
				} else {
					const primaryId = st.taskId;
					const ids =
						this.selectedTaskIds.size > 0 &&
						this.selectedTaskIds.has(primaryId)
							? Array.from(this.selectedTaskIds)
							: [primaryId];
					const groupOrigins = new Map<string, TaskDateRange>();
					
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
				const toIdx = this.computeReorderTargetIndex(ev.clientY);
				if (
					moveTasksToDisplayIndex(this.data.tasks, st.taskIds, toIdx)
				) {
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
			if (this.panState && this.mainWrapEl) {
				if (this.panRedrawRafId !== null) {
					cancelAnimationFrame(this.panRedrawRafId);
					this.panRedrawRafId = null;
					this.redrawPreservingScroll();
				}

				const initialRange = this.panState.initialRangeStart;
				this.panState = null;
				this.mainWrapEl.classList.remove("timeline-planner-main--panning");
				
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
				const pendingBarState = this.dragState.mode === "pending-bar" ? this.dragState : null;
				const wasPendingBar = this.dragState.mode === "pending-bar";
				const wasDuplicateAborted = this.dragState.mode === "reorder-duplicate-pending";
				if (this.dragRedrawRafId !== null) {
					cancelAnimationFrame(this.dragRedrawRafId);
					this.dragRedrawRafId = null;
					this.redrawPreservingScroll();
				}

				this.dragState = null;

				if (
					pendingBarState?.toggleSelectionOnMouseUp
					&& !this.selectedTaskIds.has(pendingBarState.taskId)
				) {
					this.selectedTaskIds.add(pendingBarState.taskId);
					this.redrawPreservingScroll();
				} else if (
					pendingBarState?.toggleSelectionOnMouseUp
					&& this.selectedTaskIds.has(pendingBarState.taskId)
				) {
					this.selectedTaskIds.delete(pendingBarState.taskId);
					this.redrawPreservingScroll();
				}

				if (!wasPendingBar && !wasDuplicateAborted) {
					void this.api.persist(this);
				}
			}
		} finally {
			this.clearDocumentCursorOverride();
		}
	}

	public addTask(dontShowModal: boolean = false): void {
		if (!this.file) {
			new Notice(DisplayedTexts.timeline.noticeNoFile);
			return;
		}

		const t0 = parseYmd(todayYmd());
		const id = createStampedId("t", { randomLength: 6 });
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
		
		if(!dontShowModal)
		{
			this.openEditModal(task);
		}
	}

	/** Insert a new task on `dayYmd` above/below the row for `anchorTaskId` (list order). */
	addTaskOnTrackEdge(
		dayYmd: string,
		place: "above" | "below",
		anchorTaskId: string
	): void {
		if (!this.file) {
			new Notice(DisplayedTexts.timeline.noticeNoFile);
			return;
		}

		const t0 = parseYmd(dayYmd);
		const id = createStampedId("t", { randomLength: 6 });
		const task: TimelineTask = {
			id,
			title: DisplayedTexts.timeline.newTaskDefaultTitle,
			text: "",
			start: formatYmd(t0),
			end: formatYmd(addDays(t0, 2)),
		};

		const anchorIndex = this.data.tasks.findIndex((t) => t.id === anchorTaskId);
		if (anchorIndex < 0) {
			this.data.tasks.push(task);
		} else {
			const at = place === "above" ? anchorIndex : anchorIndex + 1;
			this.data.tasks.splice(at, 0, task);
		}

		this.selectedTaskIds.clear();
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

	private stateButtonPressCallback(
		ev: MouseEvent,
		task: TimelineTask,
		taskStates: TaskStateDefinition[],
		stateBtn: HTMLElement
	) {
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
					applyTaskStateButtonUi(stateBtn, null, null);
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
					applyTaskStateButtonUi(stateBtn, s.name, s.color);
					void this.persistAndRedraw();
				});
			});
		}
		menu.showAtMouseEvent(ev);
	}
}
