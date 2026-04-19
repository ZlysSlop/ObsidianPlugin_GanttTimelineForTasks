import type { App } from "obsidian";
import { Plugin, PluginSettingTab, Setting } from "obsidian";
import {
	armColorPickerGate,
	isHex6,
	PICKER_PLACEHOLDER_HEX,
} from "./colorUi";
import { TIMELINE_VIEW_TYPE, ZLY_TIMELINE_EXTENSION } from "./constants";
import { DisplayedTexts } from "./DisplayedTexts";
import type {
	TaskStateDefinition,
	TimelinePlannerSettings,
} from "./settingsData";
import { newTaskStateId } from "./taskStateId";
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

		containerEl.createEl("h3", {
			text: DisplayedTexts.settings.taskStatesHeading,
		});
		containerEl.createEl("p", {
			text: DisplayedTexts.settings.taskStatesIntro,
			cls: "timeline-planner-settings-task-states-intro",
		});

		for (const st of this.plugin.settings.taskStates) {
			const colorGate = { ignore: false };
			new Setting(containerEl)
				.setName(DisplayedTexts.settings.taskStateNameLabel)
				.setDesc(DisplayedTexts.settings.taskStateColorLabel)
				.addText((tc) => {
					tc.setValue(st.name).onChange(async (v) => {
						st.name = v;
						await this.plugin.saveSettings();
						this.refreshOpenTimelineViews();
					});
				})
				.addColorPicker((cp) => {
					const shown = isHex6(st.color) ? st.color : PICKER_PLACEHOLDER_HEX;
					armColorPickerGate(colorGate);
					cp.setValue(shown);
					cp.onChange(async (hex) => {
						if (colorGate.ignore) return;
						st.color = hex;
						await this.plugin.saveSettings();
						this.refreshOpenTimelineViews();
					});
				})
				.addExtraButton((btn) => {
					btn.setIcon("trash");
					btn.setTooltip(
						DisplayedTexts.settings.removeTaskStateTooltip
					);
					btn.onClick(async () => {
						this.plugin.settings.taskStates =
							this.plugin.settings.taskStates.filter(
								(x) => x.id !== st.id
							);
						await this.plugin.saveSettings();
						this.refreshOpenTimelineViews();
						this.display();
					});
				});
		}

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText(DisplayedTexts.settings.addTaskStateButton)
				.onClick(async () => {
					const next: TaskStateDefinition = {
						id: newTaskStateId(),
						name: DisplayedTexts.settings.newTaskStateDefaultName,
						color: "#808080",
					};
					this.plugin.settings.taskStates.push(next);
					await this.plugin.saveSettings();
					this.refreshOpenTimelineViews();
					this.display();
				})
		);
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
