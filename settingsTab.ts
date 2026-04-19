import type { App } from "obsidian";
import { Plugin, PluginSettingTab, Setting } from "obsidian";
import {
	armColorPickerGate,
	isHex6,
	PICKER_PLACEHOLDER_HEX,
} from "./colorUi";
import { TIMELINE_VIEW_TYPE, ZLY_TIMELINE_EXTENSION } from "./constants";
import { DisplayedTexts } from "./DisplayedTexts";
import type { TimelinePlannerSettings } from "./settingsData";
import { TimelineView } from "./TimelineView";

interface TimelinePlannerPluginLike extends Plugin {
	settings: TimelinePlannerSettings;
	saveSettings(): Promise<void>;
}

export class TimelinePlannerSettingTab extends PluginSettingTab {
	plugin: TimelinePlannerPluginLike;

	constructor(app: App, plugin: TimelinePlannerPluginLike) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: DisplayedTexts.settings.heading });
		containerEl.createEl("p", {
			text: DisplayedTexts.settings.intro(ZLY_TIMELINE_EXTENSION),
		});

		const defaultGate = { ignore: false };
		new Setting(containerEl)
			.setName(DisplayedTexts.settings.defaultBarColorName)
			.setDesc(DisplayedTexts.settings.defaultBarColorDesc)
			.addColorPicker((cp) => {
				const stored = this.plugin.settings.defaultTaskBarColor.trim();
				const shown = isHex6(stored) ? stored : PICKER_PLACEHOLDER_HEX;
				armColorPickerGate(defaultGate);
				cp.setValue(shown);
				cp.onChange(async (hex) => {
					if (defaultGate.ignore) return;
					this.plugin.settings.defaultTaskBarColor = hex;
					await this.plugin.saveSettings();
					this.refreshOpenTimelineViews();
				});
			})
			.addExtraButton((btn) => {
				btn.setIcon("cross");
				btn.setTooltip(DisplayedTexts.settings.useThemeAccentTooltip);
				btn.onClick(async () => {
					this.plugin.settings.defaultTaskBarColor = "";
					await this.plugin.saveSettings();
					this.refreshOpenTimelineViews();
					this.display();
				});
			});
	}

	private refreshOpenTimelineViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(
			TIMELINE_VIEW_TYPE
		)) {
			const v = leaf.view;
			if (v instanceof TimelineView) v.refresh();
		}
	}
}
