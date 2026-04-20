import { Notice, Plugin, TFile, normalizePath } from "obsidian";
import { TIMELINE_VIEW_TYPE, ZLY_TIMELINE_EXTENSION } from "./src/constants";
import { DisplayedTexts } from "./src/DisplayedTexts";
import {
	DEFAULT_TIMELINE_SETTINGS,
	type TimelinePlannerSettings,
} from "./src/settingsData";
import { TimelinePlannerSettingTab } from "./src/settingsTab";
import { TimelineView } from "./src/TimelineView";
import { getBuiltInEmojiPickerCategoryDefinitions } from "./src/emojiPickerData";
import { definitionsToRuntimeCategories } from "./src/emojiPickerRuntime";
import { normalizeEmojiPickerCategories } from "./src/emojiPickerNormalize";
import {
	buildNewZlyTimelineFileContent,
	ensureParentFolders,
	writeTimelineZlyFile,
} from "./src/timelineStorage";

export default class TimelinePlannerPlugin extends Plugin {
	private saveIgnorePaths = new Set<string>();
	settings: TimelinePlannerSettings = { ...DEFAULT_TIMELINE_SETTINGS };

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<TimelinePlannerSettings>;
		this.settings = Object.assign({}, DEFAULT_TIMELINE_SETTINGS, data);
		if (!Array.isArray(this.settings.taskStates)) {
			this.settings.taskStates = [];
		}
		this.settings.taskBarStackLayoutBreakpointPx =
			this.clampTaskBarStackBreakpointPx(
				this.settings.taskBarStackLayoutBreakpointPx
			);
		if (!Array.isArray(this.settings.emojiPickerCategories)) {
			this.settings.emojiPickerCategories = [];
		}
		if (this.settings.emojiPickerCategories.length === 0) {
			this.settings.emojiPickerCategories =
				getBuiltInEmojiPickerCategoryDefinitions();
		}
		normalizeEmojiPickerCategories(this.settings.emojiPickerCategories);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(TIMELINE_VIEW_TYPE, (leaf) => {
			return new TimelineView(leaf, {
				persist: (v) => this.persistTimelineView(v),
				getDefaultTaskBarColor: () => this.settings.defaultTaskBarColor,
				getTaskStates: () => this.settings.taskStates,
				getTaskBarStackLayoutBreakpointPx: () =>
					this.clampTaskBarStackBreakpointPx(
						this.settings.taskBarStackLayoutBreakpointPx
					),
				getEmojiPickerCategories: () => {
					const runtime = definitionsToRuntimeCategories(
						this.settings.emojiPickerCategories
					);
					if (runtime.length > 0) {
						return runtime;
					}
					return definitionsToRuntimeCategories(
						getBuiltInEmojiPickerCategoryDefinitions()
					);
				},
			});
		});

		this.registerExtensions([ZLY_TIMELINE_EXTENSION], TIMELINE_VIEW_TYPE);

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

		this.addRibbonIcon(
			"calendar-range",
			DisplayedTexts.main.ribbonNewFile(ZLY_TIMELINE_EXTENSION),
			() => {
				void this.createNewTimelineFile();
			}
		);

		this.addCommand({
			id: "timeline-planner-new-zly-file",
			name: DisplayedTexts.main.commandNewTimeline(ZLY_TIMELINE_EXTENSION),
			callback: () => void this.createNewTimelineFile(),
		});

		this.addSettingTab(new TimelinePlannerSettingTab(this.app, this));
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(TIMELINE_VIEW_TYPE);
	}

	private clampTaskBarStackBreakpointPx(value: unknown): number {
		const n =
			typeof value === "number" && Number.isFinite(value)
				? value
				: DEFAULT_TIMELINE_SETTINGS.taskBarStackLayoutBreakpointPx;
		return Math.round(Math.min(600, Math.max(120, n)));
	}

	private async persistTimelineView(view: TimelineView): Promise<void> {
		const file = view.getTimelineFile();
		if (!file || file.extension !== ZLY_TIMELINE_EXTENSION) return;
		this.saveIgnorePaths.add(file.path);
		try {
			await writeTimelineZlyFile(this.app, file, view.data);
		} catch (e) {
			new Notice(DisplayedTexts.main.noticeSaveFailed);
			console.error(e);
		} finally {
			window.setTimeout(() => {
				this.saveIgnorePaths.delete(file.path);
			}, 120);
		}
	}

	/** Puts the new file next to the active note when possible; otherwise vault root. */
	private suggestedFolderPath(): string {
		const active = this.app.workspace.getActiveFile();
		const p = active?.parent?.path ?? "";
		return p ? normalizePath(p) : "";
	}

	private uniqueZlyPath(folder: string, basename: string): string {
		const ext = `.${ZLY_TIMELINE_EXTENSION}`;
		let path = folder
			? normalizePath(`${folder}/${basename}${ext}`)
			: normalizePath(`${basename}${ext}`);
		let n = 2;
		while (this.app.vault.getAbstractFileByPath(path)) {
			path = folder
				? normalizePath(`${folder}/${basename} ${n}${ext}`)
				: normalizePath(`${basename} ${n}${ext}`);
			n++;
		}
		return path;
	}

	async createNewTimelineFile(): Promise<void> {
		const folder = this.suggestedFolderPath();
		const basename = DisplayedTexts.main.newFileBasename;
		const path = this.uniqueZlyPath(folder, basename);
		try {
			await ensureParentFolders(this.app.vault, path);
			await this.app.vault.create(path, buildNewZlyTimelineFileContent());
		} catch (e) {
			new Notice(DisplayedTexts.main.noticeCreateFailed);
			console.error(e);
			return;
		}
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(DisplayedTexts.main.noticeFileNotCreated);
			return;
		}
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.openFile(file);
	}
}
