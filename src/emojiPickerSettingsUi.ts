import { Plugin, Setting } from "obsidian";
import { DisplayedTexts } from "./DisplayedTexts";
import { getBuiltInEmojiPickerCategoryDefinitions } from "./emojiPickerData";
import { newEmojiCategoryId } from "./emojiCategoryId";
import type { TimelinePlannerSettings } from "./settingsData";

export type TimelinePlannerPluginLike = Plugin & {
	settings: TimelinePlannerSettings;
	saveSettings(): Promise<void>;
};

export type EmojiPickerSettingsUiContext = {
	plugin: TimelinePlannerPluginLike;
	refreshTimelineViews: () => void;
	/** Rebuild this emoji settings panel (after add/remove category or item). */
	redraw: () => void;
	/** Category ids that should render expanded (preserved across redraw). */
	initiallyOpenCategoryIds?: Set<string>;
};

/**
 * Full emoji picker configuration UI (used in `EmojiPickerSettingsModal`).
 */
export function renderEmojiPickerSettings(
	containerEl: HTMLElement,
	ctx: EmojiPickerSettingsUiContext
): void {
	const { plugin, refreshTimelineViews, redraw, initiallyOpenCategoryIds } =
		ctx;

	containerEl.createEl("p", {
		text: DisplayedTexts.settings.emojiPickerIntro,
	});

	new Setting(containerEl).addButton((btn) =>
		btn
			.setButtonText(DisplayedTexts.settings.emojiPickerRestoreDefaults)
			.setTooltip(
				DisplayedTexts.settings.emojiPickerRestoreDefaultsTooltip
			)
			.onClick(async () => {
				plugin.settings.emojiPickerCategories =
					getBuiltInEmojiPickerCategoryDefinitions().map((c) => ({
						id: c.id,
						name: c.name,
						items: c.items.map((it) => ({
							emoji: it.emoji,
							tags: it.tags,
						})),
					}));
				await plugin.saveSettings();
				refreshTimelineViews();
				redraw();
			})
	);

	for (const cat of plugin.settings.emojiPickerCategories) {
		const syncCategorySummary = (
			titleEl: HTMLElement,
			countEl: HTMLElement
		): void => {
			titleEl.setText(
				cat.name.trim() || DisplayedTexts.settings.emojiCategoryUnnamed
			);
			countEl.setText(
				` · ${DisplayedTexts.settings.emojiCategorySummaryCount(cat.items.length)}`
			);
		};

		const det = containerEl.createEl("details", {
			cls: "timeline-planner-emoji-settings-category",
			attr: { "data-category-id": cat.id },
		});
		if (initiallyOpenCategoryIds?.has(cat.id)) {
			det.open = true;
		}

		const sum = det.createEl("summary", {
			cls: "timeline-planner-emoji-cat-summary",
		});
		const titleEl = sum.createSpan({
			cls: "timeline-planner-emoji-cat-summary-title",
		});
		const countEl = sum.createSpan({
			cls: "timeline-planner-emoji-cat-count",
		});
		syncCategorySummary(titleEl, countEl);

		const body = det.createDiv({ cls: "timeline-planner-emoji-cat-body" });

		new Setting(body)
			.setName(DisplayedTexts.settings.emojiCategoryNameLabel)
			.addText((tc) => {
				tc.setValue(cat.name).onChange(async (v) => {
					cat.name = v;
					syncCategorySummary(titleEl, countEl);
					await plugin.saveSettings();
					refreshTimelineViews();
				});
			})
			.addExtraButton((btn) => {
				btn.setIcon("trash");
				btn.setTooltip(DisplayedTexts.settings.emojiCategoryRemoveTooltip);
				btn.onClick(async () => {
					plugin.settings.emojiPickerCategories =
						plugin.settings.emojiPickerCategories.filter(
							(c) => c.id !== cat.id
						);
					await plugin.saveSettings();
					refreshTimelineViews();
					redraw();
				});
			});

		for (const it of cat.items) {
			new Setting(body)
				.setName(DisplayedTexts.settings.emojiItemEmojiLabel)
				.setDesc(DisplayedTexts.settings.emojiItemTagsDesc)
				.addText((tc) => {
					tc.inputEl.style.maxWidth = "4rem";
					tc.setValue(it.emoji).onChange(async (v) => {
						it.emoji = v;
						await plugin.saveSettings();
						refreshTimelineViews();
					});
				})
				.addText((tc) => {
					tc.setPlaceholder("e.g. meeting urgent");
					tc.setValue(it.tags).onChange(async (v) => {
						it.tags = v;
						await plugin.saveSettings();
						refreshTimelineViews();
					});
				})
				.addExtraButton((btn) => {
					btn.setIcon("trash");
					btn.setTooltip(DisplayedTexts.settings.emojiItemRemoveTooltip);
					btn.onClick(async () => {
						const idx = cat.items.indexOf(it);
						if (idx !== -1) {
							cat.items.splice(idx, 1);
						}
						await plugin.saveSettings();
						refreshTimelineViews();
						redraw();
					});
				});
		}

		new Setting(body).addButton((btn) =>
			btn
				.setButtonText(DisplayedTexts.settings.addEmojiItemButton)
				.onClick(async () => {
					cat.items.push({ emoji: "", tags: "" });
					await plugin.saveSettings();
					refreshTimelineViews();
					redraw();
				})
		);
	}

	new Setting(containerEl).addButton((btn) =>
		btn
			.setButtonText(DisplayedTexts.settings.addEmojiCategoryButton)
			.onClick(async () => {
				plugin.settings.emojiPickerCategories.push({
					id: newEmojiCategoryId(),
					name: DisplayedTexts.settings.newEmojiCategoryDefaultName,
					items: [{ emoji: "⭐", tags: "star" }],
				});
				await plugin.saveSettings();
				refreshTimelineViews();
				redraw();
			})
	);
}
