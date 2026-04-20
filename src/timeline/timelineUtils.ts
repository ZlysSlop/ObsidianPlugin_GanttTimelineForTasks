import {
	addDays,
	clampDateOrder,
	daysBetweenInclusive,
	formatYmd,
} from "../dateUtils";

export function moveInArray<T>(arr: T[], from: number, to: number): void {
	if (from === to) return;
	if (from < 0 || from >= arr.length) return;
	if (to < 0 || to >= arr.length) return;
	const [item] = arr.splice(from, 1);
	arr.splice(to, 0, item);
}

/** Task ids sorted by their current index in `tasks` (stable for duplicates by first occurrence). */
export function sortTaskIdsByListOrder(
	tasks: { id: string }[],
	ids: string[]
): string[] {
	const pairs = ids
		.map((id) => ({ id, i: tasks.findIndex((t) => t.id === id) }))
		.filter((p) => p.i >= 0)
		.sort((a, b) => a.i - b.i);
	return pairs.map((p) => p.id);
}

/**
 * Move one task or a block of tasks to the row index chosen by the pointer (`toIdxOrig`),
 * matching {@link moveInArray} semantics for a single item.
 */
export function moveTasksToDisplayIndex<T extends { id: string }>(
	tasks: T[],
	taskIdsInListOrder: string[],
	toIdxOrig: number
): boolean {
	const sortedIdxs = sortTaskIdsByListOrder(tasks, taskIdsInListOrder)
		.map((id) => tasks.findIndex((t) => t.id === id))
		.filter((i) => i >= 0)
		.sort((a, b) => a - b);
	if (sortedIdxs.length === 0) return false;

	if (sortedIdxs.length === 1) {
		const from = sortedIdxs[0];
		if (from === toIdxOrig) return false;
		moveInArray(tasks, from, toIdxOrig);
		return true;
	}

	const moving = new Set(sortedIdxs);
	if (moving.has(toIdxOrig)) return false;

	const minIdx = sortedIdxs[0];
	const removedBeforeTarget = sortedIdxs.filter((i) => i < toIdxOrig).length;
	const mapped = toIdxOrig - removedBeforeTarget;
	const insertAt =
		minIdx < toIdxOrig ? mapped + 1 : mapped;

	const block = sortedIdxs.map((i) => tasks[i]);
	for (let i = sortedIdxs.length - 1; i >= 0; i--) {
		tasks.splice(sortedIdxs[i], 1);
	}

	const at = Math.max(0, Math.min(insertAt, tasks.length));
	const before = tasks.map((t) => t.id).join("\0");
	tasks.splice(at, 0, ...block);
	const after = tasks.map((t) => t.id).join("\0");
	return before !== after;
}

/**
 * New `rangeStart` (YYYY-MM-DD) so `taskStart`–`taskEnd` is visible, centered when
 * the task is shorter than `dayCount` days.
 */
export function computeJumpRangeStartYmd(
	taskStart: Date,
	taskEnd: Date,
	dayCount: number
): string {
	const { start, end } = clampDateOrder(taskStart, taskEnd);
	const n = Math.max(1, dayCount);
	const span = daysBetweenInclusive(start, end) + 1;
	let rs: Date;
	if (span >= n) {
		rs = new Date(start.getTime());
	} else {
		const pad = Math.floor((n - span) / 2);
		rs = addDays(start, -pad);
	}
	return formatYmd(rs);
}

/**
 * Drop index: which row’s vertical band contains the pointer (not row midlines).
 */
export function computeReorderTargetIndex(
	bodyEl: HTMLElement,
	clientY: number
): number {
	const rows = bodyEl.querySelectorAll(".timeline-task-row");
	if (rows.length === 0) return 0;
	if (rows.length === 1) return 0;

	const rects: DOMRect[] = [];
	for (let i = 0; i < rows.length; i++) {
		rects.push(rows[i].getBoundingClientRect());
	}

	for (let i = 0; i < rects.length; i++) {
		const r = rects[i];
		const last = i === rects.length - 1;
		if (
			clientY >= r.top &&
			(last ? clientY <= r.bottom : clientY < r.bottom)
		) {
			return i;
		}
	}

	if (clientY < rects[0].top) return 0;
	if (clientY > rects[rects.length - 1].bottom) {
		return rects.length - 1;
	}

	for (let i = 0; i < rects.length - 1; i++) {
		const a = rects[i];
		const b = rects[i + 1];
		if (clientY > a.bottom && clientY < b.top) {
			return clientY < (a.bottom + b.top) / 2 ? i : i + 1;
		}
	}

	return rects.length - 1;
}
