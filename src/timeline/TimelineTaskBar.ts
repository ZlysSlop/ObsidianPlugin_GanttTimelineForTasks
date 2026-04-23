import { barAccentLikeGradient } from "../colorUi";
import { DisplayedTexts } from "../DisplayedTexts";
import type { TaskStateDefinition } from "../settings/settingsData";
import type { TimelineTask } from "./TimelineTypes";
import type { TaskLabelDisplay } from "./timelineTaskLabel";
import type { TaskRowRenderContext } from "./timelineTaskTrack";

/**
 * Filled state: full pill uses state color; hover/focus/active kept identical so
 * opening the native menu does not flash theme “unhovered” chrome.
 */
export function styleTaskStateSelect(el: HTMLElement, fillHex: string | null): void {
	el.removeClass("timeline-task-row-task-bar-state-select--filled");
	if (!fillHex?.trim()) {
		el.style.removeProperty("--tp-state-fill");
		return;
	}
	el.style.setProperty("--tp-state-fill", fillHex.trim());
	el.addClass("timeline-task-row-task-bar-state-select--filled");
}

/** Uses theme bar CSS when both task and plugin default are empty. */
export function applyTaskBarColor(
	element_task_bar: HTMLElement,
	task: TimelineTask,
	pluginDefaultBarColor: string
): void {
	const fallback = pluginDefaultBarColor.trim();
	const rawColor = (task.color?.trim() || fallback) || "";
	const useCustom = rawColor.length > 0;
	element_task_bar.classList.toggle("timeline-task-row-task-bar--custom", useCustom);
	if (useCustom) {
		element_task_bar.style.background = barAccentLikeGradient(rawColor);
		element_task_bar.style.borderColor = `color-mix(in srgb, ${rawColor} 55%, black)`;
	} else {
		element_task_bar.style.removeProperty("background");
		element_task_bar.style.removeProperty("border-color");
	}
}

/**
 * Narrow bars: stack title + state (class mirrors CSS). Uses ResizeObserver
 * because `@container` is unreliable in Obsidian’s embedded Chromium.
 */
export function bindTaskBarStackLayout(
	element_task_bar: HTMLElement,
	thresholdPx: number,
	observersOut: ResizeObserver[]
): void {
	const apply = (): void => {
		const w = element_task_bar.offsetWidth;
		element_task_bar.toggleClass(
			"timeline-task-row-task-bar--stacked",
			w > 0 && w < thresholdPx
		);
	};
	apply();
	requestAnimationFrame(apply);
	const ro = new ResizeObserver(apply);
	ro.observe(element_task_bar);
	observersOut.push(ro);
}

/** Builds `.timeline-task-row-task-bar` inside the track. */
export function appendTimelineTaskBar(
	trackEl: HTMLElement,
	task: TimelineTask,
	ctx: TaskRowRenderContext,
	geometry: { i0: number; span: number; dayW: number },
	display: TaskLabelDisplay,
	orderedRange: { start: Date; end: Date }
): void {
	const { i0, span, dayW } = geometry;
	const { start, end } = orderedRange;

	const element_task_bar = trackEl.createDiv({
		cls:
			"timeline-task-row-task-bar" +
			(ctx.selectedTaskIds.has(task.id) ? " is-selected" : ""),
	});
	element_task_bar.dataset.taskId = task.id;
	element_task_bar.style.left = `${i0 * dayW}px`;
	element_task_bar.style.width = `${span * dayW - 4}px`;
	element_task_bar.setAttr("title", "");
	element_task_bar.setAttr("aria-label", DisplayedTexts.timeline.barTitle);

	const element_labelRow = element_task_bar.createDiv({
		cls: "timeline-task-row-task-bar-labelrow",
	});
	if (display.emoji) {
		element_labelRow.createSpan({
			cls: "timeline-task-row-task-bar-emoji",
			text: display.emoji,
		});
	}
	const element_task_name = element_labelRow.createDiv({
		cls: "timeline-task-row-task-bar-text",
		text: display.title,
	});
	if(display.hasText){
		element_task_name.style.textDecoration = "underline";
	}

	const taskStates: TaskStateDefinition[] = ctx.getTaskStates();
	const resolvedStateId =
		task.stateId?.trim() && taskStates.some((s) => s.id === task.stateId!.trim())
			? task.stateId!.trim()
			: "";
	const curState = taskStates.find((s) => s.id === resolvedStateId);

	const stateBtn = element_task_bar.createEl("button", {
		type: "button",
		cls: "timeline-task-row-task-bar-state-select",
		attr: {
			"aria-label": DisplayedTexts.timeline.taskStateSelectTitle,
			"aria-haspopup": "menu",
		},
		text: curState?.name ?? DisplayedTexts.taskModal.taskStateNone,
	});

	styleTaskStateSelect(stateBtn, curState?.color ?? null);
	stateBtn.addEventListener("mousedown", (ev) => {
		ev.stopPropagation();
	});

	stateBtn.addEventListener("click", (ev) => {
		ctx.onStateButtonPress(ev, task, taskStates, stateBtn);
	});

	applyTaskBarColor(element_task_bar, task, ctx.getDefaultTaskBarColor());
	bindTaskBarStackLayout(
		element_task_bar,
		ctx.getTaskBarStackLayoutBreakpointPx(),
		ctx.taskBarStackObservers
	);
	element_task_bar.addEventListener("dblclick", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		ctx.openEditModal(task);
	});

	const hL = element_task_bar.createDiv({
		cls: "timeline-task-row-task-bar-handle timeline-task-row-task-bar-handle-left",
	});
	const hR = element_task_bar.createDiv({
		cls: "timeline-task-row-task-bar-handle timeline-task-row-task-bar-handle-right",
	});

	element_task_bar.addEventListener("mousedown", (ev) => {
		if (ev.button !== 0 || ev.target === hL || ev.target === hR) {
			return;
		}

		if (
			(ev.target as HTMLElement).closest(".timeline-task-row-task-bar-state-select")
		) {
			return;
		}

		ev.preventDefault();
		ev.stopPropagation();

		if (!ctx.selectedTaskIds.has(task.id)) {
			if (!(ev.ctrlKey || ev.metaKey)) {
				ctx.selectedTaskIds.clear();
			}
		}

		ctx.beginPendingBarDrag(
			task.id,
			ev.clientX,
			ev.clientY,
			new Date(start),
			new Date(end),
			ev.ctrlKey || ev.metaKey
				? {
						duplicateOnVertical: true,
						toggleSelectionOnMouseUp: true,
					}
				: undefined
		);
	});

	hL.addEventListener("mousedown", (ev) => {
		if (ev.button !== 0) {
			return;
		}
		ev.preventDefault();
		ev.stopPropagation();
		ctx.beginResizeLeft(task.id, ev.clientX, new Date(start), new Date(end));
	});

	hR.addEventListener("mousedown", (ev) => {
		if (ev.button !== 0) {
			return;
		}
		ev.preventDefault();
		ev.stopPropagation();
		ctx.beginResizeRight(task.id, ev.clientX, new Date(start), new Date(end));
	});
}
