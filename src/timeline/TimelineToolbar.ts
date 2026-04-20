import { DisplayedTexts } from "../DisplayedTexts";
import type { TimelineView } from "./TimelineView";

/** Appends `.timeline-toolbar` and wires it to `view`. */
export function createTimelineToolbar(
	rootEl: HTMLElement,
	view: TimelineView
): void {
	const toolbar = rootEl.createDiv({ cls: "timeline-toolbar" });

	const element_toolbar_leftSpacer = toolbar.createDiv({
		cls: "timeline-toolbar-left-spacer",
	});
	const element_button_addTask = element_toolbar_leftSpacer.createEl("button", {
		text: DisplayedTexts.timeline.newTask,
	});
	element_button_addTask.addEventListener("click", () => view.addTask());

	const element_ViewManagment_group = toolbar.createDiv({
		cls: "timeline-toolbar-group",
	});
	const element_button_JumpToToday = element_ViewManagment_group.createEl(
		"button",
		{ text: DisplayedTexts.timeline.jumpToToday }
	);
	element_button_JumpToToday.addEventListener("click", () =>
		view.toolbarJumpToToday()
	);

	const element_button_shiftDaysbackToLeft = element_ViewManagment_group.createEl(
		"button",
		{ text: "◀" }
	);
	element_button_shiftDaysbackToLeft.setAttr("title", "");
	element_button_shiftDaysbackToLeft.setAttr("aria-label", DisplayedTexts.timeline.navEarlierAria);
	element_button_shiftDaysbackToLeft.addEventListener("click", () =>
		view.toolbarShiftVisibleRangeByDays(-14)
	);

	const element_button_shiftDaysbackToRight = element_ViewManagment_group.createEl(
		"button",
		{ text: "▶" }
	);
	element_button_shiftDaysbackToRight.setAttr("title", "");
	element_button_shiftDaysbackToRight.setAttr(
		"aria-label",
		DisplayedTexts.timeline.navLaterAria
	);
	element_button_shiftDaysbackToRight.addEventListener("click", () =>
		view.toolbarShiftVisibleRangeByDays(14)
	);

	toolbar.createDiv({ cls: "timeline-toolbar-spacer" });

	const element_zoom_group = toolbar.createDiv({
		cls: "timeline-toolbar-group",
	});
	element_zoom_group.setAttr("title", "");
	element_zoom_group.setAttr("aria-label", DisplayedTexts.timeline.zoomTitle);
	element_zoom_group.createSpan({
		cls: "timeline-toolbar-zoom-label",
		text: DisplayedTexts.timeline.zoomLabel,
	});

	const element_button_ZoomDecrement = element_zoom_group.createEl("button", {
		text: "−",
	});
	element_button_ZoomDecrement.setAttr("title", "");
	element_button_ZoomDecrement.setAttr(
		"aria-label",
		DisplayedTexts.timeline.zoomOutAria
	);
	element_button_ZoomDecrement.addEventListener("click", () =>
		view.toolbarZoomOut()
	);

	const element_button_ZoomIncrement = element_zoom_group.createEl("button", {
		text: "+",
	});
	element_button_ZoomIncrement.setAttr("title", "");
	element_button_ZoomIncrement.setAttr(
		"aria-label",
		DisplayedTexts.timeline.zoomInAria
	);
	element_button_ZoomIncrement.addEventListener("click", () =>
		view.toolbarZoomIn()
	);

	const selTools = toolbar.createDiv({ cls: "timeline-toolbar-group" });
	selTools.createSpan({
		cls: "timeline-toolbar-selection-label",
		text: DisplayedTexts.timeline.shiftSelectionLabel,
	});

	const nudgeLeft = selTools.createEl("button", { text: "◀" });
	nudgeLeft.setAttr("title", "");
	nudgeLeft.setAttr("aria-label", DisplayedTexts.timeline.nudgeEarlierTitle);
	nudgeLeft.addEventListener("click", () => view.shiftSelectedTasksByDays(-1));

	const nudgeRight = selTools.createEl("button", { text: "▶" });
	nudgeRight.setAttr("title", "");
	nudgeRight.setAttr("aria-label", DisplayedTexts.timeline.nudgeLaterTitle);
	nudgeRight.addEventListener("click", () => view.shiftSelectedTasksByDays(1));
}
