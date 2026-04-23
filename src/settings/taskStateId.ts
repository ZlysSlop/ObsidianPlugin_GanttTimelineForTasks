import { createStampedId } from "../idUtils";

/** Stable id for a row in `TimelinePlannerSettings.taskStates`. */
export function newTaskStateId(): string {
	return createStampedId("st", { randomLength: 7 });
}
