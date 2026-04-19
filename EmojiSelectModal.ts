import { App, Modal } from "obsidian";
import { EMOJI_PICKER_CATEGORIES } from "./emojiPickerData";

export class EmojiSelectModal extends Modal {
	constructor(
		app: App,
		private readonly onChoose: (emoji: string) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("timeline-planner-emoji-modal");
		this.titleEl.setText("Choose emoji");

		const searchWrap = contentEl.createDiv({
			cls: "timeline-planner-emoji-search",
		});
		const search = searchWrap.createEl("input", {
			type: "search",
			attr: { placeholder: "Search by keyword or category…" },
		});

		const gridHost = contentEl.createDiv({
			cls: "timeline-planner-emoji-grid-host",
		});

		const render = (query: string): void => {
			gridHost.empty();
			const q = query.trim().toLowerCase();
			for (const cat of EMOJI_PICKER_CATEGORIES) {
				const items = cat.items.filter(
					(it) =>
						!q ||
						it.tags.includes(q) ||
						cat.label.toLowerCase().includes(q)
				);
				if (items.length === 0) continue;
				const sec = gridHost.createDiv({
					cls: "timeline-planner-emoji-section",
				});
				sec.createDiv({
					cls: "timeline-planner-emoji-section-label",
					text: cat.label,
				});
				const grid = sec.createDiv({ cls: "timeline-planner-emoji-grid" });
				for (const it of items) {
					const btn = grid.createEl("button", {
						type: "button",
						cls: "timeline-planner-emoji-cell",
						text: it.emoji,
					});
					btn.addEventListener("click", () => {
						this.onChoose(it.emoji);
						this.close();
					});
				}
			}
			if (!gridHost.childElementCount) {
				gridHost.createDiv({
					cls: "timeline-planner-emoji-empty",
					text: "No matches — try another word.",
				});
			}
		};

		search.addEventListener("input", () => render(search.value));
		render("");
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
