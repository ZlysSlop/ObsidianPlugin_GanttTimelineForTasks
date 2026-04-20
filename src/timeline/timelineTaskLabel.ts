import { DisplayedTexts } from "../DisplayedTexts";
import { firstGrapheme } from "../emoji/emojiUtils";
import type { TimelineTask } from "./TimelineTypes";

/** Notes tag + title (no emoji); emoji is separate for layout. */
export function taskLabelParts(task: TimelineTask): { emoji: string; core: string } {
	const notesTag =
		task.text.length > 0 && task.title.length > 0
			? `${DisplayedTexts.timeline.taskExisitngNoteIndication} `
			: "";
	const core = notesTag + task.title;
	const emoji = task.emoji?.trim() ? firstGrapheme(task.emoji) : "";
	return { emoji, core };
}

export type TaskLabelDisplay = {
	emoji: string;
	title: string;
};

export type TaskLabelHost = {
	beginReorder: (taskId: string) => void;
	openEditModal: (task: TimelineTask) => void;
	deleteTask: (id: string) => void;
};

/** Builds `.timeline-task-row-label` (handle, title, meta, delete). */
export function appendTimelineTaskLabel(
	rowEl: HTMLElement,
	task: TimelineTask,
	ctx: TaskLabelHost,
	display: TaskLabelDisplay
): void {
	const element_label = rowEl.createDiv({ cls: "timeline-task-row-label" });
	const element_handle = element_label.createDiv({
		cls: "timeline-task-row-movehandle",
		text: DisplayedTexts.timeline.reorderHandleGlyph,
	});
	element_handle.setAttr("title", "");
	element_handle.setAttr("aria-label", DisplayedTexts.timeline.reorderTitle);
	element_handle.addEventListener("mousedown", (ev) => {
		if (ev.button !== 0) return;
		ev.preventDefault();
		ev.stopPropagation();
		ctx.beginReorder(task.id);
	});

	const element_labelMain = element_label.createDiv({
		cls: "timeline-task-row-info-panel",
	});
	const element_titleEl = element_labelMain.createDiv({
		cls: "timeline-task-row-info-panel-title",
	});
	if (display.emoji) {
		element_titleEl.createSpan({
			cls: "timeline-task-row-title-emoji",
			text: display.emoji,
		});
	}
	element_titleEl.createSpan({
		cls: "timeline-task-row-title-text",
		text: display.title,
	});
	element_titleEl.addEventListener("click", (e) => {
		e.preventDefault();
		ctx.openEditModal(task);
	});

	const element_meta = element_labelMain.createDiv({
		cls: "timeline-task-row-info-panel-meta",
	});
	element_meta.setText(`${task.start} → ${task.end}`);

	const element_actions = element_labelMain.createDiv({
		cls: "timeline-task-row-info-panel-actions",
	});
	const delBtn = element_actions.createEl("button", {
		text: DisplayedTexts.timeline.deleteTaskSymbol,
	});
	delBtn.setAttr("aria-label", DisplayedTexts.timeline.deleteTask);
	delBtn.addEventListener("click", () => ctx.deleteTask(task.id));
}
