type IdPart = string | number;

/**
 * Builds stable ids like `prefix-<stamp>-<optional extras>-<random>`.
 * Random suffix defaults to 8 base36 chars.
 */
export function createStampedId(
	prefix: string,
	options?: {
		stamp?: number;
		extraParts?: IdPart[];
		randomLength?: number;
	}
): string {
	const stamp = options?.stamp ?? Date.now();
	const randomLength = Math.max(1, options?.randomLength ?? 8);
	const random = Math.random().toString(36).slice(2, 2 + randomLength);
	const extras = (options?.extraParts ?? []).map((x) => String(x));
	return [prefix, String(stamp), ...extras, random].join("-");
}
