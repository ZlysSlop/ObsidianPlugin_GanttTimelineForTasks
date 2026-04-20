import { DisplayedTexts } from "./DisplayedTexts";
import type {
	EmojiPickerCategoryDefinition,
	EmojiPickerItemDefinition,
} from "./settingsData";

function I(emoji: string, tags: string): EmojiPickerItemDefinition {
	return { emoji, tags: tags.toLowerCase() };
}

type BuiltInCategory = { label: string; items: EmojiPickerItemDefinition[] };

const EMOJI_PICKER_CATEGORIES: BuiltInCategory[] = [
	{
		label: DisplayedTexts.emojiCategories.objects,
		items: [
			I("⌚", "watch time"),
			I("📱", "phone mobile iphone"),
			I("💻", "laptop computer"),
			I("⌨️", "keyboard"),
			I("🖥", "desktop monitor"),
			I("🖨", "printer"),
			I("🕯", "candle"),
			I("💡", "light bulb idea"),
			I("🔦", "flashlight torch"),
			I("📷", "camera photo"),
			I("🎥", "movie camera"),
			I("📞", "telephone"),
			I("📺", "tv television"),
			I("📻", "radio"),
			I("⏰", "alarm clock"),
			I("⌛", "hourglass time"),
			I("📅", "calendar date"),
			I("📌", "pin pushpin"),
			I("📎", "paperclip"),
			I("✏️", "pencil write"),
			I("🖊", "pen"),
			I("📁", "folder files"),
			I("📂", "folder open"),
			I("🗂", "card index dividers"),
			I("📋", "clipboard"),
			I("📖", "book open read"),
			I("📚", "books stack"),
			I("🔖", "bookmark"),
			I("💼", "briefcase work"),
			I("🛠", "hammer wrench tools"),
			I("🔧", "wrench"),
			I("🔨", "hammer"),
			I("⚙️", "gear settings"),
			I("💊", "pill medicine health"),
			I("🩹", "bandage"),
			I("🔗", "link chain"),
		],
	},
	{
		label: DisplayedTexts.emojiCategories.symbols,
		items: [
			I("⭐", "star"),
			I("✅", "check mark done yes"),
			I("❌", "cross mark no"),
			I("⚠️", "warning caution"),
			I("⛔", "no entry stop"),
			I("🚫", "prohibited banned"),
			I("♻️", "recycle"),
			I("✳️", "asterisk"),
			I("❓", "question"),
			I("❗", "exclamation"),
			I("💭", "thought bubble"),
			I("💬", "speech balloon chat"),
			I("🏁", "checkered flag finish"),
			I("🚩", "flag triangular"),
		],
	},
];

/** Default set copied into settings when none are stored yet. */
export function getBuiltInEmojiPickerCategoryDefinitions(): EmojiPickerCategoryDefinition[] {
	return EMOJI_PICKER_CATEGORIES.map((cat, i) => ({
		id: `ecat-builtin-${i}`,
		name: cat.label,
		items: cat.items.map((it) => ({
			emoji: it.emoji,
			tags: it.tags,
		})),
	}));
}
