// Build the GitHub Pages site into <out>:
//   /                           landing: choose an election
//   dashboard-1-november-2026/  archive: final data of 1 November 2026, staging/1-november-2026.json
//   dashboard-25-october-2026/  archive: the final data of 25 October 2026, staging/25-october-2026.json
//   dashboard-19-april-2026/    archive: the final data of 19 April 2026, staging/19-april-2026.json
//   dashboard/                  redirect to the latest (1 November)
// EVIDEO_ELECTION (optional): evideo.bg's folder for this election, e.g. "pe202610".
// ANTHROPIC_API_KEY (optional): no longer used for live; archives have baked summaries.
//   node scripts/build_site.mjs _site
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";

const out = process.argv[2] ?? "_site";
const root = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const page = read("public/index.html");
const sections = JSON.parse(read("src/sections.json"));
const SITE = "https://signali.promeni.bg/";
if (!page.includes("%%ELECTION%%")) throw new Error("public/index.html: the %%ELECTION%% placeholder is missing");
if (!page.includes('const FROZEN = "";')) throw new Error("public/index.html: the FROZEN status is missing");

// The page, with this copy's election label (titles) and evideo.bg folder; a
// frozen copy (`frozen`: its status line) also gets its own address.
function writePage(dir, snapshot, { label, evideo, frozen }) {
  let html = page.replaceAll("%%ELECTION%%", label)
    .replace('const EVIDEO_ELECTION = "";', `const EVIDEO_ELECTION = ${JSON.stringify(evideo ?? "")};`)
    .replace('const LIVE_DATA_URL = "";', `const LIVE_DATA_URL = "";`);
  if (frozen) html = html.replaceAll(`"${SITE}"`, `"${SITE}${dir}/"`)
    .replace('const FROZEN = "";', `const FROZEN = ${JSON.stringify(frozen)};`);
  const base = dir ? `${out}/${dir}` : out;
  mkdirSync(`${base}/api`, { recursive: true });
  writeFileSync(`${base}/index.html`, html);
  writeFileSync(`${base}/api/data.json`, JSON.stringify(snapshot));
  console.log(`/${dir}: ${snapshot.total} сигнала за ${snapshot.sections} секции, ${snapshot.unknown} с непознат номер, ${snapshot.reporters} доброволци`);
}

mkdirSync(out, { recursive: true });

// landing page at root
const landing = read("public/landing.html");
writeFileSync(`${out}/index.html`, landing);
console.log("/ : landing page");

// archive: 1 November 2026 (final data)
writePage("dashboard-1-november-2026", JSON.parse(read("staging/1-november-2026.json")),
  { label: "Избори 1 ноември 2026", evideo: "pe202611", frozen: "Окончателни данни · не се обновяват" });

// archive: the first round's final data
writePage("dashboard-25-october-2026", JSON.parse(read("staging/25-october-2026.json")),
  { label: "Избори 25 октомври 2026", evideo: "pvr2026", frozen: "Окончателни данни · не се обновяват" });

// archive: 19 April 2026 (final data)
writePage("dashboard-19-april-2026", JSON.parse(read("staging/19-april-2026.json")),
  { label: "Избори 19 април 2026", evideo: "pe202604", frozen: "Окончателни данни · не се обновяват" });

mkdirSync(`${out}/dashboard`, { recursive: true });
writeFileSync(`${out}/dashboard/index.html`, `<!doctype html><meta charset="utf-8"><title>Сигнали от видеонаблюдение</title>
<meta http-equiv="refresh" content="0; url=/dashboard-1-november-2026/"><link rel="canonical" href="${SITE}dashboard-1-november-2026/"><a href="/dashboard-1-november-2026/">Сигнали от видеонаблюдение</a>
`);
// the preview image and icons
for (const f of readdirSync(new URL("public", root))) if (f.endsWith(".png")) copyFileSync(new URL(`public/${f}`, root), `${out}/${f}`);
writeFileSync(`${out}/.nojekyll`, "");
