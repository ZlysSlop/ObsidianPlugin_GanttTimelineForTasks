/** Custom view type id registered with `registerView`. */
export const TIMELINE_VIEW_TYPE = "timeline-planner-view";

/** Vault file extension (no leading dot) for dedicated timeline documents. */
export const ZLY_TIMELINE_EXTENSION = "zly-timeline";

/** JSON document `version` field inside `.zly-timeline` files. */
export const ZLY_TIMELINE_FORMAT_VERSION = 1;

/** Must match `.timeline-task-row-label` width in `styles/row.css`. */
export const TIMELINE_LABEL_COLUMN_PX = 200;

/** Minimum days visible (strongest zoom-in; widest day columns). */
export const TIMELINE_VISIBLE_DAYS_MIN = 7;
/** Maximum days visible (strongest zoom-out; narrowest day columns). */
export const TIMELINE_VISIBLE_DAYS_MAX = 120;
