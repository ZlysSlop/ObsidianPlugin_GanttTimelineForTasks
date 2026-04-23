/** Timeline planner data in `.zly-timeline` JSON and in the view. */

export interface TimelineTask {
	id: string;
	title: string;
	text: string;
	/** YYYY-MM-DD inclusive */
	start: string;
	/** YYYY-MM-DD inclusive */
	end: string;
	/** Optional CSS color (#hex, rgb(), etc.) for the bar; omit or empty = plugin default. */
	color?: string;
	/** Optional emoji shown to the left of the title (one grapheme stored). */
	emoji?: string;
	/** Optional plugin task-state id (`TimelinePlannerSettings.taskStates`). */
	stateId?: string;
}

/** Date interval snapshot used while dragging/resizing tasks. */
export type TaskDateRange = {
	origStart: Date;
	origEnd: Date;
};

export interface TimelinePlannerData {
	tasks: TimelineTask[];
	/** First visible day (YYYY-MM-DD) */
	rangeStart: string;
	/** How many calendar days are visible (zoom: lower = zoomed in, higher = zoomed out). */
	dayCount: number;
	/** Column width in CSS px; derived as (track width ÷ dayCount) on each layout, also persisted. */
	pixelsPerDay: number;
}
