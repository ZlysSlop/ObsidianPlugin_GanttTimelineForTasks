import {
	addDays,
	clampDateOrder,
	daysBetweenInclusive,
	formatYmd,
	parseYmd,
} from "../dateUtils";
import { DisplayedTexts } from "../DisplayedTexts";
import type { TimelineTask } from "../types";

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
