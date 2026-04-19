import { App, Modal, Setting, type ColorComponent } from "obsidian";
import {
	armColorPickerGate,
	isHex6,
	PICKER_PLACEHOLDER_HEX,
} from "./colorUi";
import type { TimelineTask } from "./types";

export class TaskEditModal extends Modal {
	constructor(
		app: App,
		private task: TimelineTask,
		private onSubmit: (t: Partial<TimelineTask>) => void,
		private readonly pluginDefaultBarColor: string = ""
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

		const initialBarColor = this.task.color?.trim() ?? "";
		let barColorDraft: string | undefined = undefined;
		let barColorCp: ColorComponent | undefined;
		const barColorGate = { ignore: false };
		const barColorDesc =
			"Obsidian color picker (#rrggbb). Clear (×) to use the plugin default" +
			(this.pluginDefaultBarColor.trim()
				? ` (${this.pluginDefaultBarColor.trim()})`
				: " (or theme accent if none)") +
			". Non-hex CSS colors are kept until you change the swatch.";

		new Setting(contentEl)
			.setName("Bar color")
			.setDesc(barColorDesc)
			.addColorPicker((cp) => {
				barColorCp = cp;
				const shown = isHex6(initialBarColor)
					? initialBarColor
					: PICKER_PLACEHOLDER_HEX;
				armColorPickerGate(barColorGate);
				cp.setValue(shown);
				cp.onChange((hex) => {
					if (barColorGate.ignore) return;
					barColorDraft = hex;
				});
			})
			.addExtraButton((btn) => {
				btn.setIcon("cross");
				btn.setTooltip("Clear — use plugin default");
				btn.onClick(() => {
					barColorDraft = "";
					armColorPickerGate(barColorGate);
					barColorCp?.setValue(PICKER_PLACEHOLDER_HEX);
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
				const colorSubmit =
					barColorDraft !== undefined
						? barColorDraft.trim()
						: initialBarColor;
				this.onSubmit({
					title: this.task.title,
					start: this.task.start,
					end: this.task.end,
					text: this.task.text,
					color: colorSubmit,
				});
				this.close();
			})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
