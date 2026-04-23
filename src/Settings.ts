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
import { cloneTimelineTask } from "./timeline/plannerHistory";
import type { TimelineTask } from "./timeline/TimelineTypes";

export type TaskEditModalUndoMeta = {
	/** Row as it was before this `emitSave` (Settings mutates `task` before calling this). */
	taskRowBeforeThisEdit: TimelineTask;
};

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
	onSave: (
		partial: Partial<TimelineTask>,
		undo?: TaskEditModalUndoMeta
	) => void
): void {
	const emitSave = (taskRowBefore?: TimelineTask): void => {
		onSave(
			{
				title: task.title,
				start: task.start,
				end: task.end,
				text: task.text,
				color: barColorDraft !== undefined ? barColorDraft.trim() : initialBarColor,
				emoji: emojiDraft !== undefined ? emojiDraft.trim() : initialEmoji,
				stateId: stateDraft !== undefined ? stateDraft.trim() : initialStateId,
			},
			taskRowBefore
				? { taskRowBeforeThisEdit: taskRowBefore }
				: undefined
		);
	};

	const initialEmoji = task.emoji?.trim() ?? "";
	let emojiDraft: string | undefined = undefined;
	const initialStateId = task.stateId?.trim() ?? "";
	let stateDraft: string | undefined = undefined;
	const initialBarColor = task.color?.trim() ?? "";
	let barColorDraft: string | undefined = undefined;

	new Setting(parent)
		.setName(DisplayedTexts.taskModal.fieldTitle)
		.addText((t) => {
			t.setValue(task.title).onChange((v) => {
				const rowBefore = cloneTimelineTask(task);
				task.title = v;
				emitSave(rowBefore);
			});
		});

	let emojiPickBtn: ButtonComponent | undefined;
	new Setting(parent)
		.setName(DisplayedTexts.taskModal.fieldEmoji)
		.setDesc(DisplayedTexts.taskModal.fieldEmojiDesc)
		.addButton((b) => {
			emojiPickBtn = b;
			b.setButtonText(initialEmoji || DisplayedTexts.taskModal.chooseEmoji);
			b.onClick(() => {
				new EmojiSelectModal(
					app, ctx.emojiPickerCategories,
					(ch) => {
						emojiDraft = ch;
						emojiPickBtn?.setButtonText(
							ch || DisplayedTexts.taskModal.chooseEmoji
						);
						emitSave();
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
				emitSave();
			});
		});

	new Setting(parent)
		.setName(DisplayedTexts.taskModal.fieldStartDate)
		.addText((t) => {
			t.inputEl.type = "date";
			t.setValue(task.start).onChange((v) => {
				const rowBefore = cloneTimelineTask(task);
				task.start = v;
				emitSave(rowBefore);
			});
		});

	new Setting(parent)
		.setName(DisplayedTexts.taskModal.fieldEndDate)
		.addText((t) => {
			t.inputEl.type = "date";
			t.setValue(task.end).onChange((v) => {
				const rowBefore = cloneTimelineTask(task);
				task.end = v;
				emitSave(rowBefore);
			});
		});

	new Setting(parent)
		.setName(DisplayedTexts.taskModal.fieldTaskState)
		.addDropdown((dd) => {
			dd.addOption("", DisplayedTexts.taskModal.taskStateNone);
			
			for (const s of ctx.taskStates) {
				dd.addOption(s.id, s.name);
			}

			const valid = initialStateId && ctx.taskStates.some((x) => x.id === initialStateId);
			
			dd.setValue(valid ? initialStateId : "");
			
			dd.onChange((v) => {
				stateDraft = v;
				emitSave();
			});
		});

	let barColorCp: ColorComponent | undefined;
	const barColorGate = { ignore: false };
	const barColorDesc =
		DisplayedTexts.taskModal.barColorDescLead +
		(
			ctx.pluginDefaultBarColor.trim()
			? DisplayedTexts.taskModal.barColorDescWithPluginDefault(ctx.pluginDefaultBarColor.trim())
			: DisplayedTexts.taskModal.barColorDescNoDefault
		)
		+ DisplayedTexts.taskModal.barColorDescTail;

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
				emitSave();
			});
		})
		.addExtraButton((btn) => {
			btn.setIcon("cross");
			btn.setTooltip(DisplayedTexts.taskModal.clearBarColorTooltip);
			btn.onClick(() => {
				barColorDraft = "";
				armColorPickerGate(barColorGate);
				barColorCp?.setValue(PICKER_PLACEHOLDER_HEX);
				emitSave();
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
				const rowBefore = cloneTimelineTask(task);
				task.text = v;
				emitSave(rowBefore);
			});
		});
}
