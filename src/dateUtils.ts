function pad(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
}

export function parseYmd(s: string): Date {
	const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
	return new Date(y, m - 1, d);
}

export function formatYmd(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, days: number): Date {
	const x = new Date(d.getTime());
	x.setDate(x.getDate() + days);
	return x;
}

export function daysBetweenInclusive(a: Date, b: Date): number {
	const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
	const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
	return Math.round((ub - ua) / 86400000);
}

export function clampDateOrder(start: Date, end: Date): { start: Date; end: Date } {
	if (start <= end) return { start, end };
	return { start: end, end: start };
}

export function todayYmd(): string {
	return formatYmd(new Date());
}

/** 0 = local midnight (left edge of day column), 1 = end of day (right edge). */
export function fractionOfLocalDayElapsed(now: Date = new Date()): number {
	const start = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate()
	);
	const ms = now.getTime() - start.getTime();
	return Math.min(1, Math.max(0, ms / (24 * 60 * 60 * 1000)));
}
