import { App, Modal } from "obsidian";
import { TIMELINE_VIEW_TYPE } from "../constants";
import { DisplayedTexts } from "../DisplayedTexts";
import type { TimelinePlannerPluginLike } from "../settings/timelinePluginLike";
import { TimelineView } from "../TimelineView";
import { renderEmojiPickerSettings } from "./emojiPickerSettingsUi";

export class EmojiPickerSettingsModal extends Modal {
	constructor(
		app: App,
		private readonly plugin: TimelinePlannerPluginLike
	) {
		super(app);
	}

	private refreshTimelineViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(
			TIMELINE_VIEW_TYPE
		)) {
			const v = leaf.view;
			if (v instanceof TimelineView) v.refresh();
		}
	}

	onOpen(): void {
		this.titleEl.setText(DisplayedTexts.settings.emojiPickerHeading);
		this.contentEl.addClass("timeline-planner-emoji-settings-modal");

		const redraw = (): void => {
			const openIds = new Set<string>();
			this.contentEl
				.querySelectorAll(
					"details.timeline-planner-emoji-settings-category[data-category-id]"
				)
				.forEach((node) => {
					if (
						node instanceof HTMLDetailsElement &&
						node.open &&
						node.dataset.categoryId
					) {
						openIds.add(node.dataset.categoryId);
					}
				});
			this.contentEl.empty();
			renderEmojiPickerSettings(this.contentEl, {
				plugin: this.plugin,
				refreshTimelineViews: () => this.refreshTimelineViews(),
				redraw,
				initiallyOpenCategoryIds: openIds,
			});
		};
		redraw();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
