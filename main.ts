import { Notice, Plugin, TFile } from "obsidian";
import { TIMELINE_VIEW_TYPE } from "./constants";
import { TimelinePlannerSettingTab } from "./settingsTab";
import { TimelineView } from "./TimelineView";
import { writeTimelineToFile } from "./timelineStorage";

export default class TimelinePlannerPlugin extends Plugin {
	private saveIgnorePaths = new Set<string>();

	async onload(): Promise<void> {
		this.registerView(TIMELINE_VIEW_TYPE, (leaf) => {
			return new TimelineView(leaf, {
				persist: (v) => this.persistTimelineView(v),
			});
		});

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (this.saveIgnorePaths.has(file.path)) return;
				for (const leaf of this.app.workspace.getLeavesOfType(
					TIMELINE_VIEW_TYPE
				)) {
					const v = leaf.view;
					if (v instanceof TimelineView && v.ownsFilePath(file.path)) {
						void v.reloadFromDisk();
					}
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile)) return;
				if (file.extension !== "md") return;
				menu.addItem((item) => {
					item.setTitle("Open as timeline")
						.setIcon("calendar-range")
						.onClick(() => {
							void this.openTimelineForFile(file);
						});
				});
			})
		);

		this.addRibbonIcon(
			"calendar-range",
			"Timeline for active note",
			() => {
				void this.openTimelineForActiveNote();
			}
		);

		this.addCommand({
			id: "open-timeline-for-active-note",
			name: "Open timeline for active note",
			callback: () => void this.openTimelineForActiveNote(),
		});

		this.addSettingTab(new TimelinePlannerSettingTab(this.app, this));
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(TIMELINE_VIEW_TYPE);
	}

	private async persistTimelineView(view: TimelineView): Promise<void> {
		const file = view.getTimelineFile();
		if (!file) return;
		this.saveIgnorePaths.add(file.path);
		try {
			await writeTimelineToFile(this.app, file, view.data);
		} catch (e) {
			new Notice("Could not save timeline (YAML error?). See console.");
			console.error(e);
		} finally {
			window.setTimeout(() => {
				this.saveIgnorePaths.delete(file.path);
			}, 120);
		}
	}

	async openTimelineForActiveNote(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			new Notice("Open a markdown note first, then use the calendar.");
			return;
		}
		await this.openTimelineForFile(file);
	}

	async openTimelineForFile(file: TFile): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE);
		for (const leaf of leaves) {
			const v = leaf.view;
			if (v instanceof TimelineView && v.ownsFilePath(file.path)) {
				await this.app.workspace.revealLeaf(leaf);
				return;
			}
		}
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.setViewState({
			type: TIMELINE_VIEW_TYPE,
			active: true,
			state: { filePath: file.path },
		});
		await this.app.workspace.revealLeaf(leaf);
	}
}
