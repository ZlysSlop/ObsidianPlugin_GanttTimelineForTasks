import type { App } from "obsidian";
import { Plugin, PluginSettingTab } from "obsidian";

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
			text: "Each markdown note can store its own timeline in YAML frontmatter under the key timeline.\nUse the ribbon calendar (or the command) while a note is focused to open that note's timeline.\nYou can also right-click a note in the file list and choose Open as timeline.",
		});
	}
}
