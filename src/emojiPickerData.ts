import { DisplayedTexts } from "./DisplayedTexts";
import defaultEmojiPickerJson from "../data/defaultEmojiPicker.json";
import type { EmojiPickerCategoryDefinition } from "./settingsData";

type DefaultEmojiPickerFile = {
	version: number;
	categories: Array<{
		nameKey: string;
		items: Array<{ emoji: string; tags: string }>;
	}>;
};

const defaultEmojiPickerData =
	defaultEmojiPickerJson as DefaultEmojiPickerFile;

function resolveCategoryLabel(nameKey: string): string {
	const keys = DisplayedTexts.emojiCategories;
	if (nameKey in keys) {
		return keys[nameKey as keyof typeof keys];
	}
	return nameKey;
}

function normalizeTags(tags: string): string {
	return tags.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Default set copied into settings when none are stored yet (from `data/defaultEmojiPicker.json`). */
export function getBuiltInEmojiPickerCategoryDefinitions(): EmojiPickerCategoryDefinition[] {
	return defaultEmojiPickerData.categories.map((cat, i) => ({
		id: `ecat-builtin-${i}`,
		name: resolveCategoryLabel(cat.nameKey),
		items: cat.items.map((it) => ({
			emoji: it.emoji,
			tags: normalizeTags(it.tags),
		})),
	}));
}
