import type { App } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";
import {
	armColorPickerGate,
	isHex6,
	PICKER_PLACEHOLDER_HEX,
} from "../colorUi";
import { TIMELINE_VIEW_TYPE, ZLY_TIMELINE_EXTENSION } from "../constants";
import { DisplayedTexts } from "../DisplayedTexts";
import { EmojiPickerSettingsModal } from "../emoji/EmojiPickerSettingsModal";
import { TimelineView } from "../timeline/TimelineView";
import {
	clampPlannerMaxUndoSteps,
	clampTimelineMarqueeDragPx,
	clampTimelinePendingBarDragPx,
	clampTimelineTrackAddEdgePx,
	clampTimelineWheelZoomMinIntervalMs,
	clampTimelineZoomDayStep,
} from "./settingsSetup";
import type { TimelinePlannerPluginLike } from "./timelinePluginLike";
import { TaskStatesSettingsModal } from "./TaskStatesSettingsModal";

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

		new Setting(containerEl)
			.setName(DisplayedTexts.settings.taskBarStackBreakpointName)
			.setDesc(DisplayedTexts.settings.taskBarStackBreakpointDesc)
			.addText((tc) => {
				const input = tc.inputEl;
				input.type = "text";
				input.inputMode = "numeric";
				input.autocomplete = "off";
				input.spellcheck = false;
				const previous = (): number =>
					this.plugin.settings.taskBarStackLayoutBreakpointPx;
				const revert = (): void => {
					tc.setValue(String(previous()));
				};
				tc.setValue(String(previous()));
				const commit = async (): Promise<void> => {
					const raw = tc.getValue().trim();
					if (raw === "" || !/^\d+$/.test(raw)) {
						revert();
						return;
					}
					const n = parseInt(raw, 10);
					if (!Number.isFinite(n)) {
						revert();
						return;
					}
					const clamped = Math.round(Math.min(600, Math.max(120, n)));
					this.plugin.settings.taskBarStackLayoutBreakpointPx = clamped;
					await this.plugin.saveSettings();
					this.refreshOpenTimelineViews();
					tc.setValue(String(clamped));
				};
				this.plugin.registerDomEvent(input, "blur", () => {
					void commit();
				});
				this.plugin.registerDomEvent(input, "keydown", (ev: KeyboardEvent) => {
					if (ev.key === "Enter") {
						ev.preventDefault();
						input.blur();
					}
				});
			});

		new Setting(containerEl)
			.setName(DisplayedTexts.settings.timelineZoomDayStepName)
			.setDesc(DisplayedTexts.settings.timelineZoomDayStepDesc)
			.addText((tc) => {
				const input = tc.inputEl;
				input.type = "text";
				input.inputMode = "numeric";
				input.autocomplete = "off";
				input.spellcheck = false;
				const previous = (): number =>
					this.plugin.settings.timelineZoomDayStep;
				const revert = (): void => {
					tc.setValue(String(previous()));
				};
				tc.setValue(String(previous()));
				const commit = async (): Promise<void> => {
					const raw = tc.getValue().trim();
					if (raw === "" || !/^\d+$/.test(raw)) {
						revert();
						return;
					}
					const n = parseInt(raw, 10);
					if (!Number.isFinite(n)) {
						revert();
						return;
					}
					const clamped = clampTimelineZoomDayStep(n);
					this.plugin.settings.timelineZoomDayStep = clamped;
					await this.plugin.saveSettings();
					tc.setValue(String(clamped));
				};
				this.plugin.registerDomEvent(input, "blur", () => {
					void commit();
				});
				this.plugin.registerDomEvent(input, "keydown", (ev: KeyboardEvent) => {
					if (ev.key === "Enter") {
						ev.preventDefault();
						input.blur();
					}
				});
			});

		new Setting(containerEl)
			.setName(DisplayedTexts.settings.emojiPickerHeading)
			.setDesc(DisplayedTexts.settings.emojiPickerSummaryDesc)
			.addButton((btn) =>
				btn
					.setButtonText(
						DisplayedTexts.settings.openEmojiPickerSettingsButton
					)
					.onClick(() => {
						new EmojiPickerSettingsModal(
							this.app,
							this.plugin
						).open();
					})
			);

		new Setting(containerEl)
			.setName(DisplayedTexts.settings.taskStatesHeading)
			.setDesc(DisplayedTexts.settings.taskStatesSummaryDesc)
			.addButton((btn) =>
				btn
					.setButtonText(
						DisplayedTexts.settings.openTaskStatesSettingsButton
					)
					.onClick(() => {
						new TaskStatesSettingsModal(
							this.app,
							this.plugin
						).open();
					})
			);


		containerEl.createEl("h3", {
			text: DisplayedTexts.settings.timelineInteractionCategoryHeading,
		});

		new Setting(containerEl)
			.setName(DisplayedTexts.settings.timelinePendingBarDragPxName)
			.setDesc(DisplayedTexts.settings.timelinePendingBarDragPxDesc)
			.addText((tc) => {
				const input = tc.inputEl;
				input.type = "text";
				input.inputMode = "numeric";
				input.autocomplete = "off";
				input.spellcheck = false;
				const previous = (): number =>
					this.plugin.settings.timelinePendingBarDragPx;
				const revert = (): void => {
					tc.setValue(String(previous()));
				};
				tc.setValue(String(previous()));
				const commit = async (): Promise<void> => {
					const raw = tc.getValue().trim();
					if (raw === "" || !/^\d+$/.test(raw)) {
						revert();
						return;
					}
					const n = parseInt(raw, 10);
					if (!Number.isFinite(n)) {
						revert();
						return;
					}
					const clamped = clampTimelinePendingBarDragPx(n);
					this.plugin.settings.timelinePendingBarDragPx = clamped;
					await this.plugin.saveSettings();
					this.refreshOpenTimelineViews();
					tc.setValue(String(clamped));
				};
				this.plugin.registerDomEvent(input, "blur", () => {
					void commit();
				});
				this.plugin.registerDomEvent(input, "keydown", (ev: KeyboardEvent) => {
					if (ev.key === "Enter") {
						ev.preventDefault();
						input.blur();
					}
				});
			});

		new Setting(containerEl)
			.setName(DisplayedTexts.settings.timelineTrackAddEdgePxName)
			.setDesc(DisplayedTexts.settings.timelineTrackAddEdgePxDesc)
			.addText((tc) => {
				const input = tc.inputEl;
				input.type = "text";
				input.inputMode = "numeric";
				input.autocomplete = "off";
				input.spellcheck = false;
				const previous = (): number =>
					this.plugin.settings.timelineTrackAddEdgePx;
				const revert = (): void => {
					tc.setValue(String(previous()));
				};
				tc.setValue(String(previous()));
				const commit = async (): Promise<void> => {
					const raw = tc.getValue().trim();
					if (raw === "" || !/^\d+$/.test(raw)) {
						revert();
						return;
					}
					const n = parseInt(raw, 10);
					if (!Number.isFinite(n)) {
						revert();
						return;
					}
					const clamped = clampTimelineTrackAddEdgePx(n);
					this.plugin.settings.timelineTrackAddEdgePx = clamped;
					await this.plugin.saveSettings();
					this.refreshOpenTimelineViews();
					tc.setValue(String(clamped));
				};
				this.plugin.registerDomEvent(input, "blur", () => {
					void commit();
				});
				this.plugin.registerDomEvent(input, "keydown", (ev: KeyboardEvent) => {
					if (ev.key === "Enter") {
						ev.preventDefault();
						input.blur();
					}
				});
			});

		new Setting(containerEl)
			.setName(DisplayedTexts.settings.timelineMarqueeDragPxName)
			.setDesc(DisplayedTexts.settings.timelineMarqueeDragPxDesc)
			.addText((tc) => {
				const input = tc.inputEl;
				input.type = "text";
				input.inputMode = "numeric";
				input.autocomplete = "off";
				input.spellcheck = false;
				const previous = (): number =>
					this.plugin.settings.timelineMarqueeDragPx;
				const revert = (): void => {
					tc.setValue(String(previous()));
				};
				tc.setValue(String(previous()));
				const commit = async (): Promise<void> => {
					const raw = tc.getValue().trim();
					if (raw === "" || !/^\d+$/.test(raw)) {
						revert();
						return;
					}
					const n = parseInt(raw, 10);
					if (!Number.isFinite(n)) {
						revert();
						return;
					}
					const clamped = clampTimelineMarqueeDragPx(n);
					this.plugin.settings.timelineMarqueeDragPx = clamped;
					await this.plugin.saveSettings();
					this.refreshOpenTimelineViews();
					tc.setValue(String(clamped));
				};
				this.plugin.registerDomEvent(input, "blur", () => {
					void commit();
				});
				this.plugin.registerDomEvent(input, "keydown", (ev: KeyboardEvent) => {
					if (ev.key === "Enter") {
						ev.preventDefault();
						input.blur();
					}
				});
			});

		new Setting(containerEl)
			.setName(DisplayedTexts.settings.timelineWheelZoomMinIntervalMsName)
			.setDesc(DisplayedTexts.settings.timelineWheelZoomMinIntervalMsDesc)
			.addText((tc) => {
				const input = tc.inputEl;
				input.type = "text";
				input.inputMode = "numeric";
				input.autocomplete = "off";
				input.spellcheck = false;
				const previous = (): number =>
					this.plugin.settings.timelineWheelZoomMinIntervalMs;
				const revert = (): void => {
					tc.setValue(String(previous()));
				};
				tc.setValue(String(previous()));
				const commit = async (): Promise<void> => {
					const raw = tc.getValue().trim();
					if (raw === "" || !/^\d+$/.test(raw)) {
						revert();
						return;
					}
					const n = parseInt(raw, 10);
					if (!Number.isFinite(n)) {
						revert();
						return;
					}
					const clamped = clampTimelineWheelZoomMinIntervalMs(n);
					this.plugin.settings.timelineWheelZoomMinIntervalMs = clamped;
					await this.plugin.saveSettings();
					this.refreshOpenTimelineViews();
					tc.setValue(String(clamped));
				};
				this.plugin.registerDomEvent(input, "blur", () => {
					void commit();
				});
				this.plugin.registerDomEvent(input, "keydown", (ev: KeyboardEvent) => {
					if (ev.key === "Enter") {
						ev.preventDefault();
						input.blur();
					}
				});
			});

		containerEl.createEl("h3", {
			text: DisplayedTexts.settings.undoCategoryHeading,
		});
		new Setting(containerEl)
			.setName(DisplayedTexts.settings.plannerMaxUndoStepsName)
			.setDesc(DisplayedTexts.settings.plannerMaxUndoStepsDesc)
			.addText((tc) => {
				const input = tc.inputEl;
				input.type = "text";
				input.inputMode = "numeric";
				input.autocomplete = "off";
				input.spellcheck = false;
				const previous = (): number => this.plugin.settings.plannerMaxUndoSteps;
				const revert = (): void => {
					tc.setValue(String(previous()));
				};
				tc.setValue(String(previous()));
				const commit = async (): Promise<void> => {
					const raw = tc.getValue().trim();
					if (raw === "" || !/^\d+$/.test(raw)) {
						revert();
						return;
					}
					const n = parseInt(raw, 10);
					if (!Number.isFinite(n)) {
						revert();
						return;
					}
					const clamped = clampPlannerMaxUndoSteps(n);
					this.plugin.settings.plannerMaxUndoSteps = clamped;
					await this.plugin.saveSettings();
					this.refreshOpenTimelineViews();
					tc.setValue(String(clamped));
				};
				this.plugin.registerDomEvent(input, "blur", () => {
					void commit();
				});
				this.plugin.registerDomEvent(input, "keydown", (ev: KeyboardEvent) => {
					if (ev.key === "Enter") {
						ev.preventDefault();
						input.blur();
					}
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
