import type { App, TFile, Vault } from "obsidian";
import { ZLY_TIMELINE_FORMAT_VERSION } from "./constants";
import type { TimelinePlannerData, TimelineTask } from "./types";

function pad2(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
}

export function defaultRangeStart(): string {
	const t = new Date();
	t.setHours(0, 0, 0, 0);
	t.setDate(t.getDate() - 7);
	return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}

export function createEmptyPlannerData(): TimelinePlannerData {
	return {
		tasks: [],
		rangeStart: defaultRangeStart(),
		dayCount: 42,
		pixelsPerDay: 32,
	};
}

function normalizeTask(raw: unknown): TimelineTask | null {
	if (!raw || typeof raw !== "object")
	{
		return null;
	}
	
	const o = raw as Record<string, unknown>;
	const id = typeof o.id === "string" ? o.id : "";
	const title = typeof o.title === "string" ? o.title : "";
	const text = typeof o.text === "string" ? o.text : "";
	const start = typeof o.start === "string" ? o.start : "";
	const end = typeof o.end === "string" ? o.end : "";
	
	if (!id || !start || !end) {
		return null;
	}

	const colorRaw = o.color;
	const color =
		typeof colorRaw === "string" && colorRaw.trim() !== ""
			? colorRaw.trim()
			: undefined;
	const emojiRaw = o.emoji;
	const emoji =
		typeof emojiRaw === "string" && emojiRaw.trim() !== ""
			? emojiRaw.trim()
			: undefined;
	const stateRaw = o.stateId;
	const stateId =
		typeof stateRaw === "string" && stateRaw.trim() !== ""
			? stateRaw.trim()
			: undefined;
	const task: TimelineTask = { id, title, text, start, end };
	if (color !== undefined) task.color = color;
	if (emoji !== undefined) task.emoji = emoji;
	if (stateId !== undefined) task.stateId = stateId;
	return task;
}

export function normalizePlannerData(raw: unknown): TimelinePlannerData | null {
	if (!raw || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	const tasksRaw = o.tasks;
	const tasks = Array.isArray(tasksRaw)
		? (tasksRaw.map(normalizeTask).filter(Boolean) as TimelineTask[])
		: [];
	return {
		tasks,
		rangeStart: typeof o.rangeStart === "string" ? o.rangeStart : "",
		dayCount: typeof o.dayCount === "number" && o.dayCount > 0 ? o.dayCount : 42,
		pixelsPerDay:
			typeof o.pixelsPerDay === "number" && o.pixelsPerDay > 0
				? o.pixelsPerDay
				: 32,
	};
}

function plannerToPlain(data: TimelinePlannerData): Record<string, unknown> {
	return {
		rangeStart: data.rangeStart,
		dayCount: data.dayCount,
		pixelsPerDay: data.pixelsPerDay,
		tasks: data.tasks.map((t) => {
			const row: Record<string, unknown> = {
				id: t.id,
				title: t.title,
				text: t.text,
				start: t.start,
				end: t.end,
			};
			
			if (t.color?.trim()) {
				row.color = t.color.trim();
			}
			
			if (t.emoji?.trim()) {
				row.emoji = t.emoji.trim();
			}
			if (t.stateId?.trim()) {
				row.stateId = t.stateId.trim();
			}

			return row;
		}),
	};
}

/** Initial contents for a new `.zly-timeline` file. */
export function buildNewZlyTimelineFileContent(): string {
	return JSON.stringify(
		{ version: ZLY_TIMELINE_FORMAT_VERSION, ...plannerToPlain(createEmptyPlannerData()) },
		null,
		"\t"
	);
}

export async function readTimelineZlyFile(
	app: App,
	file: TFile
): Promise<TimelinePlannerData | null> {
	const raw = (await app.vault.read(file)).trim();
	if (!raw) {
		return createEmptyPlannerData();
	}
	try {
		const o = JSON.parse(raw) as Record<string, unknown>;
		if (!o || typeof o !== "object") {
			return createEmptyPlannerData();
		}
		const { version: _ver, ...rest } = o;
		return normalizePlannerData(rest) ?? createEmptyPlannerData();
	} catch {
		return null;
	}
}

export async function writeTimelineZlyFile(
	app: App,
	file: TFile,
	data: TimelinePlannerData
): Promise<void> {
	const payload = {
		version: ZLY_TIMELINE_FORMAT_VERSION,
		...plannerToPlain(data),
	};
	await app.vault.modify(file, JSON.stringify(payload, null, "\t"));
}

export async function ensureParentFolders(vault: Vault, filePath: string): Promise<void> {
	const normalized = filePath.replace(/\\/g, "/");
	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash <= 0) return;
	const dir = normalized.slice(0, lastSlash);
	const parts = dir.split("/").filter(Boolean);
	let acc = "";
	for (const part of parts) {
		acc = acc ? `${acc}/${part}` : part;
		if (!(await vault.adapter.exists(acc))) {
			await vault.createFolder(acc);
		}
	}
}
