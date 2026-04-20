import { newEmojiCategoryId } from "./emojiCategoryId";
import type { EmojiPickerCategoryDefinition } from "./settingsData";

/** Ensures ids, trims strings, drops empty emoji rows (mutates). */
export function normalizeEmojiPickerCategories(
	categories: EmojiPickerCategoryDefinition[]
): void {
	for (const cat of categories) {
		if (!cat.id?.trim()) {
			cat.id = newEmojiCategoryId();
		}
		cat.name = (cat.name ?? "").trim();
		if (!Array.isArray(cat.items)) {
			cat.items = [];
		}
		for (const it of cat.items) {
			it.emoji = (it.emoji ?? "").trim();
			it.tags = (it.tags ?? "")
				.trim()
				.toLowerCase()
				.replace(/\s+/g, " ");
		}
		cat.items = cat.items.filter((it) => it.emoji.length > 0);
	}
}
