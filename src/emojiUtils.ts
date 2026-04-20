/** First user-perceived character (handles multi-codepoint emoji). */
export function firstGrapheme(s: string): string {
	const t = s.trim();
	if (!t) return "";
	try {
		const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
		for (const { segment } of seg.segment(t)) {
			return segment;
		}
	} catch {
		/* very old runtimes */
	}
	const ch = Array.from(t)[0];
	return ch ?? "";
}
