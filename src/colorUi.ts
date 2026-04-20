import type { HexString } from "obsidian";

/** Obsidian `ColorComponent` uses 6-digit `#rrggbb` values. */
export const HEX6_RE = /^#[0-9A-Fa-f]{6}$/;

/** Shown when no hex is stored; does not mean “saved gray” until `onChange` runs. */
export const PICKER_PLACEHOLDER_HEX = "#808080" as HexString;

export function isHex6(s: string): boolean {
	return HEX6_RE.test(s.trim());
}

/** Ignore `ColorComponent.onChange` during programmatic `setValue` (runs across microtasks). */
export function armColorPickerGate(gate: { ignore: boolean }): void {
	gate.ignore = true;
	queueMicrotask(() => {
		queueMicrotask(() => {
			gate.ignore = false;
		});
	});
}

/**
 * Same formula as `.timeline-task-row-task-bar` in `bar.css`, with `base` in place of
 * `var(--interactive-accent)` so custom/plugin colors get the same “glossy bar” look.
 */
export function barAccentLikeGradient(base: string): string {
	const c = base.trim();
	return `linear-gradient(165deg, color-mix(in srgb, ${c} 0%, white) -88%, ${c} 48%, color-mix(in srgb, ${c} 70%, black) 100%)`;
}
