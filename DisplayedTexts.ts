/**
 * All user-visible copy for the plugin (UI labels, notices, tooltips, empty states).
 * Edit strings here rather than hunting through components.
 */

import { TIMELINE_FM_KEY } from "./constants";

export const DisplayedTexts = {
	main: {
		ribbonNewFile: (ext: string) => `New .${ext} file`,
		commandNewTimeline: (ext: string) => `New ${ext} timeline`,
		noticeSaveFailed: "Could not save timeline file. See console.",
		noticeCreateFailed: "Could not create timeline file. See console.",
		noticeFileNotCreated: "Timeline file was not created.",
		newFileBasename: "Timeline",
	},

	settings: {
		heading: "Timeline Planner",
		intro: (ext: string) =>
			`Timelines live in dedicated \`.${ext}\` files (JSON). Double‑click one in the vault to open the planner, or use the ribbon / command to create a new file next to the active note (or in the vault root if nothing is open).\n\nOlder setups stored data in markdown frontmatter; that format is no longer opened by this view — use new \`.${ext}\` files for the visual timeline.`,
		defaultBarColorName: "Default task bar color",
		defaultBarColorDesc:
			"Pick a color for bars that have no per-task color. Clear (×) to use the theme accent (gradient bar). When accent is active, the swatch is a neutral preview until you choose a color.",
		useThemeAccentTooltip: "Use theme accent",
	},

	taskModal: {
		title: "Edit task",
		fieldTitle: "Title",
		fieldEmoji: "Emoji",
		fieldEmojiDesc: "Optional icon before the task title on the timeline.",
		chooseEmoji: "Choose emoji",
		removeEmojiTooltip: "Remove emoji",
		fieldStartDate: "Start date",
		fieldEndDate: "End date",
		fieldBarColor: "Bar color",
		clearBarColorTooltip: "Clear — use plugin default",
		fieldNotes: "Notes",
		save: "Save",
		barColorDescLead:
			"Obsidian color picker (#rrggbb). Clear (×) to use the plugin default",
		barColorDescWithPluginDefault: (c: string) => ` (${c})`,
		barColorDescNoDefault: " (or theme accent if none)",
		barColorDescTail:
			". Non-hex CSS colors are kept until you change the swatch.",
	},

	emojiModal: {
		title: "Choose emoji",
		searchPlaceholder: "Search by keyword or category…",
		noMatches: "No matches — try another word.",
	},

	/** Section titles in the emoji picker grid (see emojiPickerData.ts). */
	emojiCategories: {
		smileys: "Smileys",
		gesturesPeople: "Gestures & people",
		nature: "Nature",
		foodDrink: "Food & drink",
		activity: "Activity",
		travelPlaces: "Travel & places",
		objects: "Objects",
		symbols: "Symbols",
	},

	timeline: {
		viewTitle: "Timeline",
		filePathPlaceholder: "—",
		toolbarHeading: "Timeline",
		newTask: "New task",
		jumpToToday: "Jump to today",
		navEarlierAria: "Earlier",
		navLaterAria: "Later",
		zoomTitle:
			"Ctrl + Scroll on the timeline to zoom in or out.",
		zoomLabel: "Zoom",
		zoomOutAria: "Zoom out",
		zoomInAria: "Zoom in",
		shiftSelectionLabel: "Shift selection",
		nudgeEarlierTitle:
			"Move all selected tasks one day earlier (Ctrl+click bars to select)",
		nudgeEarlierAria: "Selected tasks one day earlier",
		nudgeLaterTitle:
			"Move all selected tasks one day later (Ctrl+click bars to select)",
		nudgeLaterAria: "Selected tasks one day later",
		scrollRegionTitle:
			"Right Click-drag: move up/down through tasks, left/right to change which days are visible.\nWheel: scroll. Ctrl + Scroll: to zoom in or out.",
		noticeParseError: (ext: string) =>
			`Could not parse this .${ext} file (invalid JSON?). Using empty planner.`,
		noticeNoFile: "No timeline file loaded.",
		noticeNoSelection:
			"No tasks selected. Ctrl+click bars to select.",
		emptyNoFileLoaded: "No .zly-timeline file loaded.",
		emptyNoTasks: 'No tasks yet. Click "New task" to add one.',
		reorderHandleGlyph: "⋮⋮",
		reorderAria: "Drag to reorder",
		reorderTitle:
			"Drag up or down to reorder (or drag the bar vertically on the timeline)",
		deleteTask: "x",
		outsideRangeMsg:
			"This task is outside the visible dates — use ◀ ▶ or Jump to today, or jump straight to the task.",
		jumpToTaskButton: "Show this task",
		jumpToTaskTitle:
			"Scroll the timeline so this task appears in the day grid",
		barTitle:
			"Double-click to edit. Ctrl+click to multi-select, or drag on empty track to box-select. Drag horizontally to move in time; drag vertically to reorder (or use ⋮⋮).",
		untitledLabel: "[untitled]",
		untitledBar: "(untitled)",
		newTaskDefaultTitle: "New task",
		noticeTaskAdded: "Task added — drag the bar or edges to plan.",
		noticeTaskRemoved: "Task removed.",
		dateRangeSeparator: " → ",
	},
} as const;

/** Markdown body for legacy `.md` + frontmatter helper (optional). */
export function legacyMarkdownNoteBody(): string {
	return `# Timeline planner

The timeline is stored in the \`${TIMELINE_FM_KEY}\` property in YAML frontmatter above.\nYou can write anything you want in this note below the frontmatter — links, context, meeting notes — it will not be overwritten by the plugin.
`;
}
