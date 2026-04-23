import { createStampedId } from "../idUtils";

/** Stable id for a row in `TimelinePlannerSettings.emojiPickerCategories`. */
export function newEmojiCategoryId(): string {
	return createStampedId("ecat", { randomLength: 7 });
}
