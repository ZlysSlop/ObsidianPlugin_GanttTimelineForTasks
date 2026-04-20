/** Stable id for a row in `TimelinePlannerSettings.emojiPickerCategories`. */
export function newEmojiCategoryId(): string {
	return `ecat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
