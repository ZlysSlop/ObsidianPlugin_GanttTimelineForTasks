import { DisplayedTexts } from "../DisplayedTexts";
import type { TaskStateDefinition } from "../settings/settingsData";
import type { TimelineTask } from "../types";
import { appendTimelineTaskBar } from "./TimelineTaskBar";
import { appendTimelineTaskLabel, taskLabelParts } from "./TimelineTaskLabel";
import {
	appendOutsideRangeOverlayOnTaskRow,
	appendTimelineTaskRowTrack,
} from "./TimelineTaskRow";

export type TaskRowRenderContext = {
	dayCount: number;
	bodyEl: HTMLElement;
	selectedTaskIds: Set<string>;
	getTaskStates: () => TaskStateDefinition[];
	getDefaultTaskBarColor: () => string;
	getTaskBarStackLayoutBreakpointPx: () => number;
	taskBarStackObservers: ResizeObserver[];
	bindMarqueeOnTrack: (track: HTMLElement) => void;
	beginReorder: (taskId: string) => void;
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

/** Builds one `.timeline-task-row` (label column + track + bar or outside-range UI). */
export function renderTimelineTaskRow(
	ctx: TaskRowRenderContext,
	task: TimelineTask,
	rangeStart: Date,
	dayW: number
): void {
	const rowEl = ctx.bodyEl.createDiv({ cls: "timeline-task-row" });

	const { emoji, core } = taskLabelParts(task);
	const title =
		core || DisplayedTexts.timeline.untitledTaskLabel;

	appendTimelineTaskLabel(rowEl, task, ctx, { emoji, title });

	const trackResult = appendTimelineTaskRowTrack(
		rowEl,
		ctx,
		task,
		rangeStart,
		dayW
	);

	if (trackResult.kind === "outside") {
		appendOutsideRangeOverlayOnTaskRow(
			rowEl,
			trackResult.pastLeft,
			trackResult.rangeStart,
			trackResult.rangeEnd,
			trackResult.taskStart,
			trackResult.taskEnd,
			ctx.jumpRangeToShowTask
		);
		return;
	}

	appendTimelineTaskBar(
		trackResult.trackEl,
		task,
		ctx,
		{ i0: trackResult.i0, span: trackResult.span, dayW },
		{ emoji, title },
		{ start: trackResult.barStart, end: trackResult.barEnd }
	);
}
