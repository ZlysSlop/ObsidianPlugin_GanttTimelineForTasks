import { TIMELINE_LABEL_COLUMN_PX } from "../constants";
import { addDays, daysBetweenInclusive, formatYmd, fractionOfLocalDayElapsed, parseYmd, todayYmd } from "../dateUtils";
import { DisplayedTexts } from "../DisplayedTexts";

export function removeTodayLineElements(mainWrapEl: HTMLElement): void {
	mainWrapEl
		.querySelectorAll(".timeline-planner-today-line")
		.forEach((el) => el.remove());
}

export function renderDayHeaderRow(
	gridEl: HTMLElement,
	rangeStart: Date,
	dayCount: number,
	dayW: number
): void {
	gridEl.style.gridTemplateColumns = `${TIMELINE_LABEL_COLUMN_PX}px repeat(${dayCount}, ${dayW}px)`;
	gridEl.createDiv({ cls: "timeline-planner-dayhead-spacer" });
	for (let i = 0; i < dayCount; i++) {
		const d = addDays(rangeStart, i);
		const w = d.getDay();
		const head = gridEl.createDiv({
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
	const line = mainWrapEl.createDiv({ cls: "timeline-planner-today-line" });
	line.style.left = `${leftPx}px`;
}
