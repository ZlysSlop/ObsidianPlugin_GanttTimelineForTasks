import {
	TIMELINE_LABEL_COLUMN_PX,
	TIMELINE_VISIBLE_DAYS_MAX,
	TIMELINE_VISIBLE_DAYS_MIN,
} from "../constants";

export function clampVisibleDayCount(n: number): number {
	return Math.min(
		TIMELINE_VISIBLE_DAYS_MAX,
		Math.max(TIMELINE_VISIBLE_DAYS_MIN, Math.round(n))
	);
}

/** Width available for day columns inside the scrollport (excludes label column + padding). */
export function getAvailableDayTrackWidthPx(scrollEl: HTMLElement | null): number {
	if (!scrollEl) return 0;
	const el = scrollEl;
	const cs = getComputedStyle(el);
	const pl = parseFloat(cs.paddingLeft) || 0;
	const pr = parseFloat(cs.paddingRight) || 0;
	return Math.max(0, el.clientWidth - pl - pr - TIMELINE_LABEL_COLUMN_PX);
}

/**
 * How many days to add/remove at the start vs end for zoom step `s`.
 * `swapSides` alternates which end gets the larger half when `s` is odd.
 */
export function pickZoomSideDeltas(s: number, swapSides: boolean): [number, number] {
	const lo = Math.floor(s / 2);
	const hi = s - lo;
	let startSide: number;
	let endSide: number;
	if (s === 1) {
		startSide = hi;
		endSide = lo;
	} else {
		startSide = lo;
		endSide = hi;
	}
	if (swapSides) {
		const t = startSide;
		startSide = endSide;
		endSide = t;
	}
	return [startSide, endSide];
}
