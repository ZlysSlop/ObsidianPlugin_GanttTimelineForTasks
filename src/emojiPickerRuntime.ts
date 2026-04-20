import type { EmojiPickerCategoryDefinition } from "./settingsData";

/** Shape consumed by `EmojiSelectModal` (search uses `tags`). */
export type EmojiPickerCategoryForModal = {
	label: string;
	items: { emoji: string; tags: string }[];
};

export function definitionsToRuntimeCategories(
	defs: EmojiPickerCategoryDefinition[]
): EmojiPickerCategoryForModal[] {
	return defs
		.map((c) => ({
			label: (c.name ?? "").trim(),
			items: (c.items ?? [])
				.map((it) => ({
					emoji: (it.emoji ?? "").trim(),
					tags: (it.tags ?? "").trim().toLowerCase().replace(/\s+/g, " "),
				}))
				.filter((it) => it.emoji.length > 0),
		}))
		.filter((c) => c.label.length > 0 && c.items.length > 0);
}
