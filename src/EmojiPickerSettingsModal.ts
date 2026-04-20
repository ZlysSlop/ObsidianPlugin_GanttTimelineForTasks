import { App, Modal } from "obsidian";
import { TIMELINE_VIEW_TYPE } from "./constants";
import { DisplayedTexts } from "./DisplayedTexts";
import {
	renderEmojiPickerSettings,
	type TimelinePlannerPluginLike,
} from "./emojiPickerSettingsUi";
import { TimelineView } from "./TimelineView";

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
			this.contentEl.empty();
			renderEmojiPickerSettings(this.contentEl, {
				plugin: this.plugin,
				refreshTimelineViews: () => this.refreshTimelineViews(),
				redraw,
			});
		};
		redraw();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
