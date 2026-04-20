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
	/** Custom emoji picker categories; empty on disk until first load seeds built-ins. */
	emojiPickerCategories: EmojiPickerCategoryDefinition[];
}

export const DEFAULT_TIMELINE_SETTINGS: TimelinePlannerSettings = {
	defaultTaskBarColor: "",
	taskStates: [],
	taskBarStackLayoutBreakpointPx: 260,
	timelineZoomDayStep: 1,
	emojiPickerCategories: [],
};
