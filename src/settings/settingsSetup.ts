import { getBuiltInEmojiPickerCategoryDefinitions } from "../emoji/emojiPickerData";
import { normalizeEmojiPickerCategories } from "../emoji/emojiPickerNormalize";
import {
	DEFAULT_TIMELINE_SETTINGS,
	type TimelinePlannerSettings,
} from "./settingsData";

export function clampTaskBarStackBreakpointPx(value: unknown): number {
	const n =
		typeof value === "number" && Number.isFinite(value)
			? value
			: DEFAULT_TIMELINE_SETTINGS.taskBarStackLayoutBreakpointPx;
	return Math.round(Math.min(600, Math.max(120, n)));
}

export function clampTimelineZoomDayStep(value: unknown): number {
	const n =
		typeof value === "number" && Number.isFinite(value)
			? value
			: DEFAULT_TIMELINE_SETTINGS.timelineZoomDayStep;
	return Math.round(Math.min(30, Math.max(1, n)));
}

/** Merge `data.json` payload with defaults and normalize arrays / emoji config. */
export function mergeLoadedTimelineSettings(
	raw: unknown
): TimelinePlannerSettings {
	const data = (raw ?? {}) as Partial<TimelinePlannerSettings>;
	const settings: TimelinePlannerSettings = Object.assign(
		{},
		DEFAULT_TIMELINE_SETTINGS,
		data
	);
	if (!Array.isArray(settings.taskStates)) {
		settings.taskStates = [];
	}
	settings.taskBarStackLayoutBreakpointPx = clampTaskBarStackBreakpointPx(
		settings.taskBarStackLayoutBreakpointPx
	);
	settings.timelineZoomDayStep = clampTimelineZoomDayStep(
		settings.timelineZoomDayStep
	);
	if (!Array.isArray(settings.emojiPickerCategories)) {
		settings.emojiPickerCategories = [];
	}
	if (settings.emojiPickerCategories.length === 0) {
		settings.emojiPickerCategories =
			getBuiltInEmojiPickerCategoryDefinitions();
	}
	normalizeEmojiPickerCategories(settings.emojiPickerCategories);
	return settings;
}
