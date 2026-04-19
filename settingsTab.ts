import type { App } from "obsidian";
import { Plugin, PluginSettingTab, Setting } from "obsidian";
import {
	armColorPickerGate,
	isHex6,
	PICKER_PLACEHOLDER_HEX,
} from "./colorUi";
import { TIMELINE_VIEW_TYPE, ZLY_TIMELINE_EXTENSION } from "./constants";
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
		containerEl.createEl("h2", { text: "Timeline Planner" });
		containerEl.createEl("p", {
			text: `Timelines live in dedicated \`.${ZLY_TIMELINE_EXTENSION}\` files (JSON). Double‑click one in the vault to open the planner, or use the ribbon / command to create a new file next to the active note (or in the vault root if nothing is open).\n\nOlder setups stored data in markdown frontmatter; that format is no longer opened by this view — use new \`.${ZLY_TIMELINE_EXTENSION}\` files for the visual timeline.`,
		});

		const defaultGate = { ignore: false };
		new Setting(containerEl)
			.setName("Default task bar color")
			.setDesc(
				"Pick a color for bars that have no per-task color. Clear (×) to use the theme accent (gradient bar). When accent is active, the swatch is a neutral preview until you choose a color."
			)
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
				btn.setTooltip("Use theme accent");
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
