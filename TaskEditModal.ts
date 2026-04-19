import { App, Modal, Setting } from "obsidian";
import type { TimelineTask } from "./types";

export class TaskEditModal extends Modal {
	constructor(
		app: App,
		private task: TimelineTask,
		private onSubmit: (t: Partial<TimelineTask>) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText("Edit task");

		new Setting(contentEl).setName("Title").addText((t) => {
			t.setValue(this.task.title).onChange((v) => {
				this.task.title = v;
			});
		});

		new Setting(contentEl).setName("Start date").addText((t) => {
			t.inputEl.type = "date";
			t.setValue(this.task.start).onChange((v) => {
				this.task.start = v;
			});
		});

		new Setting(contentEl).setName("End date").addText((t) => {
			t.inputEl.type = "date";
			t.setValue(this.task.end).onChange((v) => {
				this.task.end = v;
			});
		});

		new Setting(contentEl).setName("Notes").addTextArea((ta) => {
			ta.inputEl.addClass("timeline-planner-modal-text");
			/* Full-width row under label — avoids flex + two-axis resize fighting layout. */
			let p: HTMLElement | null = ta.inputEl.parentElement;
			while (p && !p.classList.contains("setting-item")) {
				p = p.parentElement;
			}
			p?.addClass("timeline-planner-modal-notes");
			ta.setValue(this.task.text).onChange((v) => {
				this.task.text = v;
			});
		});

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("Save").setCta().onClick(() => {
				this.onSubmit({
					title: this.task.title,
					start: this.task.start,
					end: this.task.end,
					text: this.task.text,
				});
				this.close();
			})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
