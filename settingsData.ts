/** Persisted plugin data (`data.json`). */

export interface TaskStateDefinition {
	id: string;
	name: string;
	/** `#rrggbb` from the color picker */
	color: string;
}

export interface TimelinePlannerSettings {
	/**
	 * CSS color for task bars when a task has no `color` (e.g. `#7c3aed`).
	 * Empty string = use Obsidian `--interactive-accent`.
	 */
	defaultTaskBarColor: string;
	/** User-defined workflow states (name + color); tasks reference `stateId`. */
	taskStates: TaskStateDefinition[];
}

export const DEFAULT_TIMELINE_SETTINGS: TimelinePlannerSettings = {
	defaultTaskBarColor: "",
	taskStates: [],
};
