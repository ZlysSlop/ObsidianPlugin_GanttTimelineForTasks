# Gantt Timeline Planner

**Obsidian plugin** for planning work on a **Gantt-style timeline**: tasks appear as horizontal bars on a day grid, stored in dedicated JSON files in your vault.

## Purpose

The plugin gives you a visual planner inside Obsidian without tying tasks to daily notes or a separate app. Each timeline is a normal vault file you can back up, sync, and version like any other note — while the custom view renders it as an interactive calendar strip with draggable task bars.

## Requirements

- **Obsidian** 1.5.0 or newer.

## Timeline files (`.zly-timeline`)

Timelines files use the extension `**.zly-timeline`**.

The document is **JSON** with a version field and planner data: visible date range, zoom (day count and column width), and a list of tasks (id, title, notes text, start/end dates, optional color, emoji, and workflow state).

Open a `.zly-timeline` file to get the planner view. If the file is changed on disk (e.g. another editor), open views **reload** when Obsidian detects the modify event.

### Create a new timeline

- **Ribbon**: “New `.zly-timeline` file”  
- **Command palette**: “New zly-timeline timeline”  
- New files are created **next to the active note** when possible; otherwise in the **vault root**.

## Capabilities

### Timeline & navigation

- **Visible range**: Shows a configurable number of calendar days (zoom in/out within min/max bounds).  
- **Zoom**: Toolbar controls and **Ctrl/Cmd + scroll** adjust how many days fit on screen (step size is configurable in settings).  
- **Pan**: Drag on the scroll area to move vertically through tasks and shift the visible date range horizontally.  
- **Jump to today**: Toolbar control to recenter the range around “today”.  
- **Today marker**: A line on the grid for the current date (updates as time passes).

### Tasks

- **Add tasks** from the toolbar.  
- **Edit**: Double-click a task bar to open the editor (title, start/end dates, notes, optional bar color, emoji, state).  
- **Delete**: Remove from the row actions in the label column.  
- **Drag horizontally** on a bar to move dates; **drag the handles** to resize start or end.  
- **Reorder rows**: Drag **vertically** from the bar (after the gesture crosses the reorder threshold) or use the **move handle** in the label column.  
- **Multi-select**: **Ctrl/Cmd + click** a task bar to add/remove it from the selection. Selected tasks **move together** when you drag dates horizontally, and can be **reordered as a block** when dragging vertically or from the handle (when the dragged row is part of the selection).  
- **Marquee selection**: Drag on **empty track** to box-select bars (**Shift** adds to the current selection).  
- **Off-screen tasks**: Tasks outside the visible range show a compact “outside range” control with **jump** actions to scroll the range so the task fits.

### Workflow & appearance

- **Task states**: Define named states with colors in settings; assign them on the bar (and in the editor).  
- **Default bar color**: Optional plugin default; clearing it uses the **theme accent** (with a gradient bar treatment).  
- **Emoji**: Per-task emoji in the row label; pick from a configurable **emoji picker** (categories, search tags).  
- **Compact bars**: When a bar is narrower than a breakpoint (pixels), title and state stack for readability; breakpoint is tunable in settings.

### Settings

Under **Settings → Timeline Planner** you can adjust:

- Default task bar color (or theme accent)  
- Task states (separate configuration window)  
- Emoji picker categories and items (separate window; can restore built-in defaults)  
- Task bar “stack” breakpoint (px)  
- Timeline zoom step (days per zoom action)

## Development

From the plugin folder:

```bash
npm install
npm run build
```

`build` merges CSS, type-checks, and bundles `main.js` for Obsidian.