/**
 * Obsidian loads only `styles.css` from the plugin folder. Relative `@import`
 * URLs are resolved against the app origin (e.g. `app://obsidian.md/`), not the
 * plugin path — so `./styles/foo.css` becomes `app://obsidian.md/styles/foo.css`
 * and fails with ERR_FILE_NOT_FOUND. This script concatenates `styles/*.css` into
 * the single file Obsidian expects. Run via `npm run build` (or `npm run styles`).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const stylesDir = path.join(root, "styles");
const outFile = path.join(root, "styles.css");

const files = [
	"root.css",
	"toolbar.css",
	"scroll-main.css",
	"today-line.css",
	"grid-dayhead.css",
	"rows.css",
	"row.css",
	"track.css",
	"bar.css",
	"empty-modal.css",
	"doc-cursors.css",
	"marquee.css",
];

let out = "/* Timeline Planner — merged from styles/*.css (npm run styles / npm run build) */\n\n";

console.log("[merge-styles] Starting to merge into styles.css...");

for (const f of files) {
	const p = path.join(stylesDir, f);
	if (!fs.existsSync(p)) {
		console.error(`\n[merge-styles] missing: ${p}`);
		process.exit(1);
	}

	console.log(`\t[merge-styles] Merging ${f}.`);

	const content = fs.readFileSync(p, "utf8").trimEnd();
	out += `/* ===== ${f} ===== */\n`;
	out += content + "\n\n";
}

fs.writeFileSync(outFile, out.replace(/\n+$/, "\n"), "utf8");
console.log("\n[merge-styles] Merge complete.");
