import type { App } from "obsidian";
import { Plugin, PluginSettingTab } from "obsidian";
import { ZLY_TIMELINE_EXTENSION } from "./constants";

export class TimelinePlannerSettingTab extends PluginSettingTab {
	plugin: Plugin;

	constructor(app: App, plugin: Plugin) {
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
	}
}
