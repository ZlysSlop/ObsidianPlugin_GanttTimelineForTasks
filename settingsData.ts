/** Persisted plugin data (`data.json`). */

export interface TimelinePlannerSettings {
	/**
	 * CSS color for task bars when a task has no `color` (e.g. `#7c3aed`).
	 * Empty string = use Obsidian `--interactive-accent`.
	 */
	defaultTaskBarColor: string;
}

export const DEFAULT_TIMELINE_SETTINGS: TimelinePlannerSettings = {
	defaultTaskBarColor: "",
};
