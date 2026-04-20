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
