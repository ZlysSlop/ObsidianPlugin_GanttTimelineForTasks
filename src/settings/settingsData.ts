/** Persisted plugin data (`data.json`). */

export interface TaskStateDefinition {
	id: string;
	name: string;
	/** `#rrggbb` from the color picker */
	color: string;
}

export interface EmojiPickerItemDefinition {
	emoji: string;
	/** Space-separated search keywords (stored lowercase). */
	tags: string;
}

export interface EmojiPickerCategoryDefinition {
	id: string;
	name: string;
	items: EmojiPickerItemDefinition[];
}

export interface TimelinePlannerSettings {
	/**
	 * CSS color for task bars when a task has no `color` (e.g. `#7c3aed`).
	 * Empty string = use Obsidian `--interactive-accent`.
	 */
	defaultTaskBarColor: string;
	/** User-defined workflow states (name + color); tasks reference `stateId`. */
	taskStates: TaskStateDefinition[];
	/**
	 * Task bars narrower than this width (CSS pixels) use stacked title + state.
	 * Larger values keep the single-row layout longer when zoomed out.
	 */
	taskBarStackLayoutBreakpointPx: number;
	/**
	 * How many days are added or removed from the visible range per zoom action
	 * (+/− on the timeline or Ctrl/⌘+scroll).
	 */
	timelineZoomDayStep: number;
	// --- Timeline interaction (thresholds, px / ms) ---
	/**
	 * After pressing a task bar, movement past this distance decides vertical reorder
	 * (or duplicate) vs horizontal date drag.
	 */
	timelinePendingBarDragPx: number;
	/**
	 * Near the top or bottom of a day track, this band (px) shows the “+ add task” control.
	 */
	timelineTrackAddEdgePx: number;
	/**
	 * On empty track, pointer movement past this before rubber-band (marquee) select starts.
	 */
	timelineMarqueeDragPx: number;
	/**
	 * Minimum time between pinch-as-zoom (Ctrl/⌘+scroll) steps; 0 = no throttling.
	 */
	timelineWheelZoomMinIntervalMs: number;
	/** Custom emoji picker categories; empty on disk until first load seeds built-ins. */
	emojiPickerCategories: EmojiPickerCategoryDefinition[];
}

export const DEFAULT_TIMELINE_SETTINGS: TimelinePlannerSettings = {
	defaultTaskBarColor: "",
	taskStates: [],
	taskBarStackLayoutBreakpointPx: 200,
	timelineZoomDayStep: 6,
	timelinePendingBarDragPx: 6,
	timelineTrackAddEdgePx: 14,
	timelineMarqueeDragPx: 4,
	timelineWheelZoomMinIntervalMs: 90,
	emojiPickerCategories: [],
};
