import { Setting } from "obsidian";
import {
	armColorPickerGate,
	isHex6,
	PICKER_PLACEHOLDER_HEX,
} from "../colorUi";
import { DisplayedTexts } from "../DisplayedTexts";
import type { TaskStateDefinition } from "./settingsData";
import type { TimelinePlannerPluginLike } from "./timelinePluginLike";
import { newTaskStateId } from "./taskStateId";

export type TaskStatesSettingsUiContext = {
	plugin: TimelinePlannerPluginLike;
	refreshTimelineViews: () => void;
	redraw: () => void;
};

export function renderTaskStatesSettings(
	containerEl: HTMLElement,
	ctx: TaskStatesSettingsUiContext
): void {
	const { plugin, refreshTimelineViews, redraw } = ctx;

	containerEl.createEl("p", {
		text: DisplayedTexts.settings.taskStatesIntro,
		cls: "timeline-planner-settings-task-states-intro",
	});

	for (const st of plugin.settings.taskStates) {
		const colorGate = { ignore: false };
		new Setting(containerEl)
			.setName(DisplayedTexts.settings.taskStateNameLabel)
			.setDesc(DisplayedTexts.settings.taskStateColorLabel)
			.addText((tc) => {
				tc.setValue(st.name).onChange(async (v) => {
					st.name = v;
					await plugin.saveSettings();
					refreshTimelineViews();
				});
			})
			.addColorPicker((cp) => {
				const shown = isHex6(st.color) ? st.color : PICKER_PLACEHOLDER_HEX;
				armColorPickerGate(colorGate);
				cp.setValue(shown);
				cp.onChange(async (hex) => {
					if (colorGate.ignore) return;
					st.color = hex;
					await plugin.saveSettings();
					refreshTimelineViews();
				});
			})
			.addExtraButton((btn) => {
				btn.setIcon("trash");
				btn.setTooltip(DisplayedTexts.settings.removeTaskStateTooltip);
				btn.onClick(async () => {
					plugin.settings.taskStates = plugin.settings.taskStates.filter(
						(x) => x.id !== st.id
					);
					await plugin.saveSettings();
					refreshTimelineViews();
					redraw();
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
				plugin.settings.taskStates.push(next);
				await plugin.saveSettings();
				refreshTimelineViews();
				redraw();
			})
	);
}
