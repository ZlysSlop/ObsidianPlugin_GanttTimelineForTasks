import { DisplayedTexts } from "../DisplayedTexts";
import type { TimelineTask } from "./TimelineTypes";
import { appendTimelineTaskBar } from "./TimelineTaskBar";
import { appendTimelineTaskLabel, taskLabelParts } from "./timelineTaskLabel";
import {
	appendOutsideRangeOverlayOnTaskRow,
	appendTimelineTaskRowTrack,
	type TaskRowRenderContext,
} from "./timelineTaskTrack";

/** Builds one `.timeline-task-row` (label column + track + bar or outside-range UI). */
export function renderTimelineTaskRow(
	ctx: TaskRowRenderContext,
	task: TimelineTask,
	rangeStart: Date,
	dayW: number
): void {
	const rowEl = ctx.bodyEl.createDiv({ cls: "timeline-task-row" });

	var labelData = taskLabelParts(task);
	labelData.title = labelData.title || DisplayedTexts.timeline.untitledTaskLabel;

	appendTimelineTaskLabel(rowEl, task, ctx, labelData);

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
		labelData,
		{ start: trackResult.barStart, end: trackResult.barEnd }
	);
}
