/**
 * All user-visible copy for the plugin (UI labels, notices, tooltips, empty states).
 * Edit strings here rather than hunting through components.
 */

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
		intro: (ext: string) => `Timelines live in dedicated \`.${ext}\` files (JSON).\nDouble-click one in the vault to open the planner,\nor use the ribbon / command to create a new file next to the active note (or in the vault root if nothing is open).`,
		defaultBarColorName: "Default task bar color",
		defaultBarColorDesc: "Pick a color for bars that have no per-task color.\nClear (×) to use the theme accent (gradient bar).\nWhen accent is active, the swatch is a neutral preview until you choose a color.",
		useThemeAccentTooltip: "Use theme accent",
		taskBarStackBreakpointName: "Compact task bar breakpoint",
		taskBarStackBreakpointDesc:
			"When a bar is narrower than this many pixels, the title stacks above the state control (zoom affects bar width in px).\nHigher = stay on one row longer while zoomed out; lower = stack sooner.\nRange: 120–600.",
		taskStatesHeading: "Task states",
		taskStatesIntro: "Define states you can assign to tasks (shown on the bar and in the edit dialog). Each state has a name and color.",
		taskStateNameLabel: "Name",
		taskStateColorLabel: "Color",
		addTaskStateButton: "Add state",
		newTaskStateDefaultName: "New state",
		removeTaskStateTooltip: "Remove this state",
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
		fieldTaskState: "State",
		taskStateNone: "None",
		save: "Save",
		barColorDescLead: "Obsidian color picker (#rrggbb).\nClear (×) to use the plugin default",
		barColorDescWithPluginDefault: (c: string) => ` (${c})`,
		barColorDescNoDefault: " (or theme accent if none)",
		barColorDescTail: ". Non-hex CSS colors are kept until you change the swatch.",
	},

	emojiModal: {
		title: "Choose emoji",
		searchPlaceholder: "Search by keyword or category...",
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

		zoomTitle: "Ctrl + Scroll on the timeline to zoom in or out.",
		zoomLabel: "Zoom",
		zoomOutAria: "Zoom out",
		zoomInAria: "Zoom in",
		
		shiftSelectionLabel: "Shift selection",
		nudgeEarlierTitle: "Move all selected tasks one day earlier (Ctrl+click bars to select)",
		nudgeLaterTitle: "Move all selected tasks one day later (Ctrl+click bars to select)",
		nudgeEarlierAria: "Selected tasks one day earlier",
		nudgeLaterAria: "Selected tasks one day later",

		scrollRegionTitle: "Right Click-drag: move up/down through tasks,\nleft/right to change which days are visible.\nWheel: scroll. Ctrl + Scroll: to zoom in or out.",
		noticeParseError: (ext: string) => `Could not parse this .${ext} file (invalid JSON?).\nUsing empty planner.`,
		noticeNoFile: "No timeline file loaded.",
		noticeNoSelection: "No tasks selected. Ctrl+click bars to select.",
		emptyNoFileLoaded: "No .zly-timeline file loaded.",
		emptyNoTasks: 'No tasks yet. Click "New task" to add one.',
		reorderHandleGlyph: "⋮⋮",
		reorderAria: "Drag to reorder",
		reorderTitle: "Drag up or down to reorder (or drag the bar vertically on the timeline)",
		deleteTask: "x",
		outsideRangeArrowTitleLeft: (firstVisibleDay: string) => `Task is earlier — ends before ${firstVisibleDay} (left of the timeline).`,
		outsideRangeArrowTitleRight: (lastVisibleDay: string) => `Task is later — starts after ${lastVisibleDay} (right of the timeline).`,
		jumpToTaskButton: "Jump to task",
		jumpToTaskTitle: "Scroll the timeline so this task appears in the day grid",
		barTitle: "Double-click to edit.\nCtrl+click to multi-select, or drag on empty track to box-select.\nDrag horizontally to move in time; drag vertically to reorder.\nCan also use ⋮⋮ on the task to reorder vertically.",
		untitledLabel: "[untitled]",
		untitledBar: "(untitled)",
		newTaskDefaultTitle: "New task",
		noticeTaskAdded: "Task added — drag the bar or edges to plan.",
		noticeTaskRemoved: "Task removed.",
		dateRangeSeparator: " → ",
		taskStateSelectTitle: "Task state",
	},
} as const;
