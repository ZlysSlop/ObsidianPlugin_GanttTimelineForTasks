/**
 * Obsidian loads only `styles.css` from the plugin folder. Relative `@import`
 * URLs are resolved against the app origin (e.g. `app://obsidian.md/`), not the
 * plugin path — so `./styles/foo.css` becomes `app://obsidian.md/styles/foo.css`
 * and fails with ERR_FILE_NOT_FOUND. This script concatenates `styles/*.css` into
 * the single file Obsidian expects. Run via `npm run build` (or `npm run styles`).
 *
 * Every `*.css` file in `styles/` is included, in ascending filename order (so
 * later files override earlier ones when rules tie). Use numeric prefixes
 * (`01-root.css`, `02-toolbar.css`, …) if you need a specific cascade order.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const stylesDir = path.join(root, "styles");
const outFile = path.join(root, "styles.css");

if (!fs.existsSync(stylesDir)) {
	console.error(`[merge-styles] missing directory: ${stylesDir}`);
	process.exit(1);
}

const files = fs
	.readdirSync(stylesDir)
	.filter((f) => f.endsWith(".css") && !f.startsWith("."))
	.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (files.length === 0) {
	console.error(`[merge-styles] no .css files in ${stylesDir}`);
	process.exit(1);
}

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
