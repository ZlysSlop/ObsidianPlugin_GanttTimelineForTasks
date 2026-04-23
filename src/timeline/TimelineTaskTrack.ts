import {
	addDays,
	clampDateOrder,
	daysBetweenInclusive,
	formatYmd,
	parseYmd,
} from "../dateUtils";
import { DisplayedTexts } from "../DisplayedTexts";
import type { TaskStateDefinition } from "../settings/settingsData";
import type { TimelineTask } from "./TimelineTypes";
import { sortTaskIdsByListOrder } from "./timelineUtils";
import type { TimelineView } from "./TimelineView";

export type TaskRowRenderContext = {
	dayCount: number;
	bodyEl: HTMLElement;
	selectedTaskIds: Set<string>;
	getTaskStates: () => TaskStateDefinition[];
	getDefaultTaskBarColor: () => string;
	getTaskBarStackLayoutBreakpointPx: () => number;
	taskBarStackObservers: ResizeObserver[];
	bindMarqueeOnTrack: (track: HTMLElement) => void;
	beginReorder: (
		taskId: string,
		options?: { duplicate: boolean; startX: number; startY: number }
	) => void;
	jumpRangeToShowTask: (start: Date, end: Date) => void;
	deleteTask: (id: string) => void;
	openEditModal: (task: TimelineTask) => void;
	redrawPreservingScroll: () => void;
	toggleBarMultiSelect: (taskId: string) => void;
	beginPendingBarDrag: (
		taskId: string,
		clientX: number,
		clientY: number,
		start: Date,
		end: Date
	) => void;
	beginResizeLeft: (
		taskId: string,
		clientX: number,
		start: Date,
		end: Date
	) => void;
	beginResizeRight: (
		taskId: string,
		clientX: number,
		start: Date,
		end: Date
	) => void;
	onStateButtonPress: (
		ev: MouseEvent,
		task: TimelineTask,
		taskStates: TaskStateDefinition[],
		stateBtn: HTMLElement
	) => void;
};

/**
 * TimelineView keeps most row wiring private; this shim matches only what we read/write here.
 * Cast is intentional — the module boundary cannot see `private` fields on the class.
 */
type TimelineViewForTaskRows = {
	data: { dayCount: number; tasks: { id: string }[] };
	bodyEl: HTMLElement;
	selectedTaskIds: Set<string>;
	taskBarStackObservers: ResizeObserver[];
	api: {
		getTaskStates: () => TaskStateDefinition[];
		getDefaultTaskBarColor: () => string;
		getTaskBarStackLayoutBreakpointPx: () => number;
	};
	bindMarqueeOnTrack(track: HTMLElement): void;
	syncDocumentCursorFromInteractionState(): void;
	jumpRangeToShowTask(start: Date, end: Date): void;
	deleteTask(id: string): void;
	openEditModal(task: TimelineTask): void;
	redrawPreservingScroll(): void;
	stateButtonPressCallback(
		ev: MouseEvent,
		task: TimelineTask,
		taskStates: TaskStateDefinition[],
		stateBtn: HTMLElement
	): void;
	dragState:
		| {
				mode: "move" | "resize-left" | "resize-right";
				taskId: string;
				startX: number;
				origStart: Date;
				origEnd: Date;
				groupOrigins?: Map<string, { origStart: Date; origEnd: Date }>;
		  }
		| {
				mode: "pending-bar";
				taskId: string;
				startX: number;
				startY: number;
				origStart: Date;
				origEnd: Date;
		  }
		| { mode: "reorder"; taskIds: string[] }
		| {
				mode: "reorder-duplicate-pending";
				taskIds: string[];
				startX: number;
				startY: number;
		  }
		| null;
};

export function buildTaskRowContext(view: TimelineView): TaskRowRenderContext {
	const v = view as unknown as TimelineViewForTaskRows;
	return {
		dayCount: v.data.dayCount,
		bodyEl: v.bodyEl,
		selectedTaskIds: v.selectedTaskIds,
		getTaskStates: () => v.api.getTaskStates(),
		getDefaultTaskBarColor: () => v.api.getDefaultTaskBarColor(),
		getTaskBarStackLayoutBreakpointPx: () =>
			v.api.getTaskBarStackLayoutBreakpointPx(),
		taskBarStackObservers: v.taskBarStackObservers,
		bindMarqueeOnTrack: (track) => v.bindMarqueeOnTrack(track),
		beginReorder: (taskId, options) => {
			let taskIds: string[];
			if (v.selectedTaskIds.has(taskId) && v.selectedTaskIds.size > 1) {
				taskIds = sortTaskIdsByListOrder(
					v.data.tasks,
					Array.from(v.selectedTaskIds)
				);
			} else {
				v.selectedTaskIds.clear();
				taskIds = [taskId];
			}
			if (options?.duplicate) {
				v.dragState = {
					mode: "reorder-duplicate-pending",
					taskIds,
					startX: options.startX,
					startY: options.startY,
				};
			} else {
				v.dragState = { mode: "reorder", taskIds };
			}
			v.syncDocumentCursorFromInteractionState();
		},
		jumpRangeToShowTask: (start, end) => v.jumpRangeToShowTask(start, end),
		deleteTask: (id) => v.deleteTask(id),
		openEditModal: (task) => v.openEditModal(task),
		redrawPreservingScroll: () => v.redrawPreservingScroll(),
		toggleBarMultiSelect: (taskId) => {
			if (v.selectedTaskIds.has(taskId)) {
				v.selectedTaskIds.delete(taskId);
			} else {
				v.selectedTaskIds.add(taskId);
			}
			v.redrawPreservingScroll();
		},
		beginPendingBarDrag: (taskId, clientX, clientY, origStart, origEnd) => {
			if (!v.selectedTaskIds.has(taskId)) {
				v.selectedTaskIds.clear();
			}
			v.dragState = {
				mode: "pending-bar",
				taskId,
				startX: clientX,
				startY: clientY,
				origStart,
				origEnd,
			};
			v.syncDocumentCursorFromInteractionState();
		},
		beginResizeLeft: (taskId, clientX, origStart, origEnd) => {
			v.dragState = {
				mode: "resize-left",
				taskId,
				startX: clientX,
				origStart,
				origEnd,
			};
			v.syncDocumentCursorFromInteractionState();
		},
		beginResizeRight: (taskId, clientX, origStart, origEnd) => {
			v.dragState = {
				mode: "resize-right",
				taskId,
				startX: clientX,
				origStart,
				origEnd,
			};
			v.syncDocumentCursorFromInteractionState();
		},
		onStateButtonPress: (ev, task, taskStates, stateBtn) => {
			v.stateButtonPressCallback(ev, task, taskStates, stateBtn);
		},
	};
}

export type TimelineTaskTrackResult =
	| {
		kind: "outside";
		pastLeft: boolean;
		rangeStart: Date;
		rangeEnd: Date;
		taskStart: Date;
		taskEnd: Date;
	  }
	| {
		kind: "inside";
		trackEl: HTMLElement;
		barStart: Date;
		barEnd: Date;
		i0: number;
		span: number;
	  };

export type TaskTrackHost = {
	dayCount: number;
	bindMarqueeOnTrack: (track: HTMLElement) => void;
};

/**
 * Builds `.timeline-task-row-track` and returns whether the task sits inside the visible range.
 */
export function appendTimelineTaskRowTrack(
	rowEl: HTMLElement,
	ctx: TaskTrackHost,
	task: TimelineTask,
	rangeStart: Date,
	dayW: number
): TimelineTaskTrackResult {
	const trackEl = rowEl.createDiv({ cls: "timeline-task-row-track" });
	trackEl.setAttr("title", DisplayedTexts.timeline.scrollRegionTitle);
	trackEl.style.minWidth = `${ctx.dayCount * dayW}px`;
	ctx.bindMarqueeOnTrack(trackEl);

	const { start, end } = clampDateOrder(parseYmd(task.start), parseYmd(task.end));
	const rangeEnd = addDays(rangeStart, ctx.dayCount - 1);

	if (end < rangeStart || start > rangeEnd) {
		return {
			kind: "outside",
			pastLeft: end < rangeStart,
			rangeStart,
			rangeEnd,
			taskStart: start,
			taskEnd: end,
		};
	}

	const visStart = start < rangeStart ? rangeStart : start;
	const visEnd = end > rangeEnd ? rangeEnd : end;
	const i0 = daysBetweenInclusive(rangeStart, visStart);
	const span = daysBetweenInclusive(visStart, visEnd) + 1;

	return {
		kind: "inside",
		trackEl,
		barStart: start,
		barEnd: end,
		i0,
		span,
	};
}

/** Jump overlay when the task is outside the visible range (sibling of label + track). */
export function appendOutsideRangeOverlayOnTaskRow(
	rowEl: HTMLElement,
	pastLeft: boolean,
	rangeStart: Date,
	rangeEnd: Date,
	taskStart: Date,
	taskEnd: Date,
	jumpRangeToShowTask: (start: Date, end: Date) => void
): void {
	const jumpOverlay = rowEl.createDiv({
		cls:
			"timeline-planner-outside-range-overlay timeline-planner-outside-range " +
			(pastLeft
				? "timeline-planner-outside-range--past-left"
				: "timeline-planner-outside-range--past-right"),
	});
	const outsideStrip = jumpOverlay.createDiv({
		cls: "timeline-planner-outside-range-inner",
	});

	const onJumpMouseDown = (ev: MouseEvent): void => {
		ev.preventDefault();
		ev.stopPropagation();
	};
	const onJumpClick = (ev: MouseEvent): void => {
		ev.preventDefault();
		ev.stopPropagation();
		jumpRangeToShowTask(taskStart, taskEnd);
	};

	const element_leftArrow = outsideStrip.createEl("button", {
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

	const element_center = outsideStrip.createDiv({
		cls: "timeline-planner-outside-range-center",
	});
	const jumpBtn = element_center.createEl("button", {
		type: "button",
		cls: "timeline-planner-jump-task-btn",
		text: DisplayedTexts.timeline.jumpToTaskButton,
	});
	jumpBtn.setAttr("title", "");
	jumpBtn.setAttr("aria-label", DisplayedTexts.timeline.jumpToTaskTitle);
	jumpBtn.addEventListener("mousedown", onJumpMouseDown);
	jumpBtn.addEventListener("click", onJumpClick);

	const element_rightArrow = outsideStrip.createEl("button", {
		type: "button",
		cls: "timeline-planner-outside-range-arrow timeline-planner-outside-range-arrow--right",
		text: "▶",
	});
	if (!pastLeft) {
		const tip = DisplayedTexts.timeline.outsideRangeArrowTitleRight(
			formatYmd(rangeEnd)
		);
		element_rightArrow.setAttr("title", "");
		element_rightArrow.setAttr("aria-label", tip);
		element_rightArrow.addEventListener("mousedown", onJumpMouseDown);
		element_rightArrow.addEventListener("click", onJumpClick);
	} else {
		element_rightArrow.disabled = true;
		element_rightArrow.setAttr("aria-hidden", "true");
		element_rightArrow.addClass("is-inactive");
	}
}
