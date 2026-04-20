import { TIMELINE_LABEL_COLUMN_PX } from "../constants";
import { addDays, daysBetweenInclusive, formatYmd, fractionOfLocalDayElapsed, parseYmd, todayYmd } from "../dateUtils";
import { DisplayedTexts } from "../DisplayedTexts";

export function removeTodayLineElements(mainWrapEl: HTMLElement): void {
	mainWrapEl
		.querySelectorAll(".timeline-planner-today-line")
		.forEach((el) => el.remove());
}

export function renderDayHeaderRow(
	element_grid: HTMLElement,
	rangeStart: Date,
	dayCount: number,
	dayW: number,
	callback_AddTask: () => void
): void {
	element_grid.style.gridTemplateColumns = `${TIMELINE_LABEL_COLUMN_PX}px repeat(${dayCount}, ${dayW}px)`;

	const element_spacer_dh = element_grid.createDiv({ cls: "timeline-planner-dayhead-spacer" });
	{
		const element_button_altNewTask = element_spacer_dh.createEl("button", {
			type: "button",
			attr: {
				"aria-label": "Create new task.",
				"aria-haspopup": "menu",
			},
			text: "+",
		});

		element_button_altNewTask.addEventListener("click", callback_AddTask);
	}
	
	for (let i = 0; i < dayCount; i++) {
		const d = addDays(rangeStart, i);
		const w = d.getDay();
		const head = element_grid.createDiv({
			cls: "timeline-planner-dayhead",
			text: `${d.getDate()}`,
		});
		if (w === 0 || w === 6) {
			head.addClass("is-weekend");
		}
		if (formatYmd(d) === todayYmd()) {
			head.addClass("is-today");
		}
		head.setAttr("title", "");
		head.setAttr("aria-label", formatYmd(d));
	}
}

/** Vertical marker for “now” when today lies in the visible range. */
export function placeTodayLine(
	mainWrapEl: HTMLElement,
	rangeStart: Date,
	dayCount: number,
	dayW: number
): void {
	const today = parseYmd(todayYmd());
	const idx = daysBetweenInclusive(rangeStart, today);
	if (idx < 0 || idx >= dayCount) {
		return;
	}
	const labelCol = TIMELINE_LABEL_COLUMN_PX;
	const t = fractionOfLocalDayElapsed();
	const leftPx = labelCol + idx * dayW + t * dayW;

	/* Sticky: bar + arrow stay aligned with the top of the scrollport while rows scroll. */
	const line = mainWrapEl.createDiv({ cls: "timeline-planner-today-line" });
	line.style.left = `${leftPx}px`;
	const h = mainWrapEl.clientHeight;
	line.style.setProperty(
		"--tp-today-line-sticky-h",
		`${Math.max(1, h)}px`
	);
	mainWrapEl.prepend(line);
}
