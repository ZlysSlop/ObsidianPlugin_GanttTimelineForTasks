import { App, Modal, Setting, type ButtonComponent, type ColorComponent } from "obsidian";
import {
	armColorPickerGate,
	isHex6,
	PICKER_PLACEHOLDER_HEX,
} from "./colorUi";
import { DisplayedTexts } from "./DisplayedTexts";
import { EmojiSelectModal } from "./EmojiSelectModal";
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
		this.titleEl.setText(DisplayedTexts.taskModal.title);

		new Setting(contentEl)
			.setName(DisplayedTexts.taskModal.fieldTitle)
			.addText((t) => {
			t.setValue(this.task.title).onChange((v) => {
				this.task.title = v;
			});
		});

		const initialEmoji = this.task.emoji?.trim() ?? "";
		let emojiDraft: string | undefined = undefined;
		let emojiPickBtn: ButtonComponent | undefined;
		new Setting(contentEl)
			.setName(DisplayedTexts.taskModal.fieldEmoji)
			.setDesc(DisplayedTexts.taskModal.fieldEmojiDesc)
			.addButton((b) => {
				emojiPickBtn = b;
				b.setButtonText(
					initialEmoji || DisplayedTexts.taskModal.chooseEmoji
				);
				b.onClick(() => {
					new EmojiSelectModal(this.app, (ch) => {
						emojiDraft = ch;
						emojiPickBtn?.setButtonText(
							ch || DisplayedTexts.taskModal.chooseEmoji
						);
					}).open();
				});
			})
			.addExtraButton((btn) => {
				btn.setIcon("cross");
				btn.setTooltip(DisplayedTexts.taskModal.removeEmojiTooltip);
				btn.onClick(() => {
					emojiDraft = "";
					emojiPickBtn?.setButtonText(
						DisplayedTexts.taskModal.chooseEmoji
					);
				});
			});

		new Setting(contentEl)
			.setName(DisplayedTexts.taskModal.fieldStartDate)
			.addText((t) => {
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
			DisplayedTexts.taskModal.barColorDescLead +
			(this.pluginDefaultBarColor.trim()
				? DisplayedTexts.taskModal.barColorDescWithPluginDefault(
						this.pluginDefaultBarColor.trim()
					)
				: DisplayedTexts.taskModal.barColorDescNoDefault) +
			DisplayedTexts.taskModal.barColorDescTail;

		new Setting(contentEl)
			.setName(DisplayedTexts.taskModal.fieldBarColor)
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
				btn.setTooltip(DisplayedTexts.taskModal.clearBarColorTooltip);
				btn.onClick(() => {
					barColorDraft = "";
					armColorPickerGate(barColorGate);
					barColorCp?.setValue(PICKER_PLACEHOLDER_HEX);
				});
			});

		new Setting(contentEl)
			.setName(DisplayedTexts.taskModal.fieldNotes)
			.addTextArea((ta) => {
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
			b.setButtonText(DisplayedTexts.taskModal.save).setCta().onClick(() => {
				const colorSubmit =
					barColorDraft !== undefined
						? barColorDraft.trim()
						: initialBarColor;
				const emojiSubmit =
					emojiDraft !== undefined
						? emojiDraft.trim()
						: initialEmoji;
				this.onSubmit({
					title: this.task.title,
					start: this.task.start,
					end: this.task.end,
					text: this.task.text,
					color: colorSubmit,
					emoji: emojiSubmit,
				});
				this.close();
			})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
