import { DisplayedTexts } from "../DisplayedTexts";
import { firstGrapheme } from "../emoji/emojiUtils";
import type { TimelineTask } from "./TimelineTypes";
import { TIMELINE_LABEL_COLUMN_PX } from "../constants";

/** Emoji, title line, and “has body text” flag shared by row label and task bar. */
export type TaskLabelDisplay = {
	emoji: string;
	title: string;
	hasText: boolean;
};

export function taskLabelParts(task: TimelineTask): TaskLabelDisplay {
	return {
		emoji: task.emoji?.trim() ? firstGrapheme(task.emoji) : "",
		title: task.title,
		hasText: task.text.length > 0 && task.title.length > 0,
	};
}

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
	display: TaskLabelDisplay,
): void {
	const element_label = rowEl.createDiv({ cls: "timeline-task-row-label" }); {
		element_label.style.width = `${TIMELINE_LABEL_COLUMN_PX}px`;

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

		const element_labelMain = element_label.createDiv({ cls: "timeline-task-row-info-panel" });{
			const element_title = element_labelMain.createDiv({ cls: "timeline-task-row-info-panel-title" });
			if (display.emoji) {
				element_title.createSpan({
					cls: "timeline-task-row-title-emoji",
					text: display.emoji,
				});
			}

			const element_title_text = element_title.createSpan({
				cls: "timeline-task-row-title-text",
				text: display.title,
			});
			if(display.hasText)
			{
				element_title_text.style.textDecoration = "underline";
			}

			element_title.addEventListener("click", (e) => {
				e.preventDefault();
				ctx.openEditModal(task);
			});
	
			
			const element_group_actions = element_labelMain.createDiv({ cls: "timeline-task-row-info-panel-actions" }); {
				const element_meta = element_group_actions.createDiv({cls: "timeline-task-row-info-panel-meta" });
				element_meta.setText(`${task.start} → ${task.end}`);
	
				const element_button_deleteTask = element_group_actions.createEl("button", { text: DisplayedTexts.timeline.deleteTaskSymbol });
				element_button_deleteTask.setAttr("aria-label", DisplayedTexts.timeline.deleteTask);
				element_button_deleteTask.addEventListener("click", () => ctx.deleteTask(task.id));
			}
		}
	}
}
