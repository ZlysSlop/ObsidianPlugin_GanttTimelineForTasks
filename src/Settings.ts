import {
	App,
	Setting,
	type ButtonComponent,
	type ColorComponent,
} from "obsidian";
import {
	armColorPickerGate,
	isHex6,
	PICKER_PLACEHOLDER_HEX,
} from "./colorUi";
import { DisplayedTexts } from "./DisplayedTexts";
import { EmojiSelectModal } from "./emoji/EmojiSelectModal";
import type { EmojiPickerCategoryForModal } from "./emoji/emojiPickerRuntime";
import type { TaskStateDefinition } from "./settings/settingsData";
import type { TimelineTask } from "./timeline/TimelineTypes";

export type TaskEditFormContext = {
	pluginDefaultBarColor: string;
	taskStates: TaskStateDefinition[];
	emojiPickerCategories: EmojiPickerCategoryForModal[];
};

/**
 * Builds the task editor form (Obsidian `Setting` rows) inside `parent`.
 * Mutates `task` for title, dates, and notes; `onSave` receives the full submit payload.
 */
export function createTaskEditModalSettings(
	app: App,
	parent: HTMLElement,
	task: TimelineTask,
	ctx: TaskEditFormContext,
	onSave: (partial: Partial<TimelineTask>) => void
): void {
	new Setting(parent)
		.setName(DisplayedTexts.taskModal.fieldTitle)
		.addText((t) => {
			t.setValue(task.title).onChange((v) => {
				task.title = v;
			});
		});

	const initialEmoji = task.emoji?.trim() ?? "";
	let emojiDraft: string | undefined = undefined;
	let emojiPickBtn: ButtonComponent | undefined;
	new Setting(parent)
		.setName(DisplayedTexts.taskModal.fieldEmoji)
		.setDesc(DisplayedTexts.taskModal.fieldEmojiDesc)
		.addButton((b) => {
			emojiPickBtn = b;
			b.setButtonText(
				initialEmoji || DisplayedTexts.taskModal.chooseEmoji
			);
			b.onClick(() => {
				new EmojiSelectModal(
					app,
					ctx.emojiPickerCategories,
					(ch) => {
						emojiDraft = ch;
						emojiPickBtn?.setButtonText(
							ch || DisplayedTexts.taskModal.chooseEmoji
						);
					}
				).open();
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

	new Setting(parent)
		.setName(DisplayedTexts.taskModal.fieldStartDate)
		.addText((t) => {
			t.inputEl.type = "date";
			t.setValue(task.start).onChange((v) => {
				task.start = v;
			});
		});

	new Setting(parent)
		.setName(DisplayedTexts.taskModal.fieldEndDate)
		.addText((t) => {
			t.inputEl.type = "date";
			t.setValue(task.end).onChange((v) => {
				task.end = v;
			});
		});

	const initialStateId = task.stateId?.trim() ?? "";
	let stateDraft: string | undefined = undefined;
	new Setting(parent)
		.setName(DisplayedTexts.taskModal.fieldTaskState)
		.addDropdown((dd) => {
			dd.addOption("", DisplayedTexts.taskModal.taskStateNone);
			for (const s of ctx.taskStates) {
				dd.addOption(s.id, s.name);
			}
			const valid =
				initialStateId &&
				ctx.taskStates.some((x) => x.id === initialStateId);
			dd.setValue(valid ? initialStateId : "");
			dd.onChange((v) => {
				stateDraft = v;
			});
		});

	const initialBarColor = task.color?.trim() ?? "";
	let barColorDraft: string | undefined = undefined;
	let barColorCp: ColorComponent | undefined;
	const barColorGate = { ignore: false };
	const barColorDesc =
		DisplayedTexts.taskModal.barColorDescLead +
		(ctx.pluginDefaultBarColor.trim()
			? DisplayedTexts.taskModal.barColorDescWithPluginDefault(
					ctx.pluginDefaultBarColor.trim()
				)
			: DisplayedTexts.taskModal.barColorDescNoDefault) +
		DisplayedTexts.taskModal.barColorDescTail;

	new Setting(parent)
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

	new Setting(parent)
		.setName(DisplayedTexts.taskModal.fieldNotes)
		.addTextArea((ta) => {
			ta.inputEl.addClass("timeline-planner-modal-text");
			let p: HTMLElement | null = ta.inputEl.parentElement;
			while (p && !p.classList.contains("setting-item")) {
				p = p.parentElement;
			}
			p?.addClass("timeline-planner-modal-notes");
			ta.setValue(task.text).onChange((v) => {
				task.text = v;
			});
		});

	new Setting(parent).addButton((b) =>
		b.setButtonText(DisplayedTexts.taskModal.save).setCta().onClick(() => {
			const colorSubmit =
				barColorDraft !== undefined
					? barColorDraft.trim()
					: initialBarColor;
			const emojiSubmit =
				emojiDraft !== undefined ? emojiDraft.trim() : initialEmoji;
			const stateSubmit =
				stateDraft !== undefined ? stateDraft.trim() : initialStateId;
			onSave({
				title: task.title,
				start: task.start,
				end: task.end,
				text: task.text,
				color: colorSubmit,
				emoji: emojiSubmit,
				stateId: stateSubmit,
			});
		})
	);
}
