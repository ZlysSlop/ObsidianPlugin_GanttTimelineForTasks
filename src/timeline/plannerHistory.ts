import type { TimelinePlannerData, TimelineTask } from "./TimelineTypes";

const MAX_UNDO = 50;

/** Deep copy of one task (for undo + task editor). */
export function cloneTimelineTask(t: TimelineTask): TimelineTask {
	const out: TimelineTask = {
		id: t.id,
		title: t.title,
		text: t.text,
		start: t.start,
		end: t.end,
	};
	if (t.color !== undefined) out.color = t.color;
	if (t.emoji !== undefined) out.emoji = t.emoji;
	if (t.stateId !== undefined) out.stateId = t.stateId;
	return out;
}

export function clonePlannerData(data: TimelinePlannerData): TimelinePlannerData {
	return {
		rangeStart: data.rangeStart,
		dayCount: data.dayCount,
		pixelsPerDay: data.pixelsPerDay,
		tasks: data.tasks.map(cloneTimelineTask),
	};
}

/**
 * Replaces in-place the contents of `target` with `source` (same object identity as `data` on the view).
 */
export function applyPlannerData(
	target: TimelinePlannerData,
	source: TimelinePlannerData
): void {
	target.rangeStart = source.rangeStart;
	target.dayCount = source.dayCount;
	target.pixelsPerDay = source.pixelsPerDay;
	target.tasks = source.tasks.map(cloneTimelineTask);
}

const PPX_EPS = 0.0001;

function sameOptionalStr(a: string | undefined, b: string | undefined): boolean {
	return (a?.trim() ?? "") === (b?.trim() ?? "");
}

function taskDataEqual(a: TimelineTask, b: TimelineTask): boolean {
	if (a.id !== b.id) return false;
	if (a.title !== b.title) return false;
	if (a.text !== b.text) return false;
	if (a.start !== b.start) return false;
	if (a.end !== b.end) return false;
	if (!sameOptionalStr(a.color, b.color)) return false;
	if (!sameOptionalStr(a.emoji, b.emoji)) return false;
	if (!sameOptionalStr(a.stateId, b.stateId)) return false;
	return true;
}

/** True if both snapshots represent the same planner file content (tasks order matters). */
export function plannerDataEqual(
	a: TimelinePlannerData,
	b: TimelinePlannerData
): boolean {
	if (a.rangeStart !== b.rangeStart) return false;
	if (a.dayCount !== b.dayCount) return false;
	if (Math.abs(a.pixelsPerDay - b.pixelsPerDay) > PPX_EPS) {
		return false;
	}
	if (a.tasks.length !== b.tasks.length) return false;
	for (let i = 0; i < a.tasks.length; i++) {
		if (!taskDataEqual(a.tasks[i], b.tasks[i])) {
			return false;
		}
	}
	return true;
}

/**
 * JSON snapshot history for a single timeline file: undo = restore an older snapshot, redo the inverse.
 * Call `pushBeforeMutation` before each discrete in-place user edit that is about to change `data`.
 * Use `pushUndoablePastState` when the “before” state is no longer equal to the current in-memory
 * document (e.g. a drag gesture already mutated the model).
 */
export class PlannerHistory {
	private undo: TimelinePlannerData[] = [];
	private redo: TimelinePlannerData[] = [];
	/**
	 * Off until the timeline file is fully read into the view, so we never
	 * record snapshots of the pre-load empty `data` (which would make the first
	 * “undo” wipe tasks).
	 */
	private recordingEnabled = false;

	/** When false, all pushes are ignored; undo/redo only apply to stacks built while enabled. */
	setRecordingEnabled(enabled: boolean): void {
		this.recordingEnabled = enabled;
	}

	isRecordingEnabled(): boolean {
		return this.recordingEnabled;
	}

	clear(): void {
		this.undo = [];
		this.redo = [];
	}

	/** The current in-memory `data` is about to be replaced by a mutation: remember it, clear redo. */
	pushBeforeMutation(current: TimelinePlannerData): void {
		if (!this.recordingEnabled) {
			return;
		}
		this.undo.push(clonePlannerData(current));
		if (this.undo.length > MAX_UNDO) {
			this.undo.shift();
		}
		this.redo = [];
	}

	/**
	 * Pushes a known prior snapshot (full clone) as the next undo point; clears redo.
	 * The snapshot is usually captured before a gesture that is not bracketed with `pushBeforeMutation`.
	 */
	pushUndoablePastState(snap: TimelinePlannerData): void {
		if (!this.recordingEnabled) {
			return;
		}
		this.undo.push(clonePlannerData(snap));
		if (this.undo.length > MAX_UNDO) {
			this.undo.shift();
		}
		this.redo = [];
	}

	canUndo(): boolean {
		return this.undo.length > 0;
	}

	canRedo(): boolean {
		return this.redo.length > 0;
	}

	/** Pop one undo: returns the snapshot to apply, or `null`. */
	undoToApply(current: TimelinePlannerData): TimelinePlannerData | null {
		if (this.undo.length === 0) {
			return null;
		}
		const next = this.undo.pop()!;
		this.redo.push(clonePlannerData(current));
		return next;
	}

	/** Pop one redo: returns the snapshot to apply, or `null`. */
	redoToApply(current: TimelinePlannerData): TimelinePlannerData | null {
		if (this.redo.length === 0) {
			return null;
		}
		const next = this.redo.pop()!;
		this.undo.push(clonePlannerData(current));
		return next;
	}
}
