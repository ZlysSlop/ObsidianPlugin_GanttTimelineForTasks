import type { Plugin } from "obsidian";
import type { TimelinePlannerSettings } from "./settingsData";

export type TimelinePlannerPluginLike = Plugin & {
	settings: TimelinePlannerSettings;
	saveSettings(): Promise<void>;
};
