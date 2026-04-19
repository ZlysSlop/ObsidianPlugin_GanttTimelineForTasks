/** Timeline planner data stored under frontmatter `timeline` and in the view. */

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
}

export interface TimelinePlannerData {
	tasks: TimelineTask[];
	/** First visible day (YYYY-MM-DD) */
	rangeStart: string;
	/** Number of days shown in the header */
	dayCount: number;
	/** Pixels per day */
	pixelsPerDay: number;
}
