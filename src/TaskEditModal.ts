import { App, Modal } from "obsidian";
import { createTaskEditModalSettings } from "./Settings";
import { DisplayedTexts } from "./DisplayedTexts";
import type { EmojiPickerCategoryForModal } from "./emoji/emojiPickerRuntime";
import type { TaskStateDefinition } from "./settings/settingsData";
import type { TimelineTask } from "./timeline/TimelineTypes";

export class TaskEditModal extends Modal {
	constructor(
		app: App,
		private task: TimelineTask,
		private onSubmit: (t: Partial<TimelineTask>) => void,
		private readonly pluginDefaultBarColor: string = "",
		private readonly taskStates: TaskStateDefinition[] = [],
		private readonly emojiPickerCategories: EmojiPickerCategoryForModal[] = []
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText(DisplayedTexts.taskModal.title);

		createTaskEditModalSettings(
			this.app,
			contentEl,
			this.task,
			{
				pluginDefaultBarColor: this.pluginDefaultBarColor,
				taskStates: this.taskStates,
				emojiPickerCategories: this.emojiPickerCategories,
			},
			(partial) => {
				this.onSubmit(partial);
			}
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
