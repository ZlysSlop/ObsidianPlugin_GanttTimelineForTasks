/** Stable id for a row in `TimelinePlannerSettings.taskStates`. */
export function newTaskStateId(): string {
	return `st-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
