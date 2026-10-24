// Build the GitHub Pages site into <out>:
//   /                           live: the Tally form TALLY_FORM_ID, read now with TALLY_API_KEY
//   dashboard-19-april-2026/    test: the frozen snapshot staging/19-april-2026.json, not indexed
//   dashboard/                  redirect to /, the first address we announced
// EVIDEO_ELECTION (optional): evideo.bg's folder for this election, e.g. "pe202610".
// ANTHROPIC_API_KEY (optional): AI summaries of the reports' details on the live page;
//   SUMMARIES=false turns them off (and hides the ones already made). The summaries
//   carry over between builds in SUMMARIES_STORE (default .cache/summaries.json).
//   node scripts/build_site.mjs _site
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { aggregate, fetchTally } from "../src/aggregate.js";
import { liveSummaries } from "../src/live-summaries.js";

const out = process.argv[2] ?? "_site";
const root = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const page = read("public/index.html");
const sections = JSON.parse(read("src/sections.json"));
const SITE = "https://signali.promeni.bg/";
if (!page.includes("%%ELECTION%%")) throw new Error("public/index.html: the %%ELECTION%% placeholder is missing");
if (!page.includes("const IS_TEST = false;")) throw new Error("public/index.html: the IS_TEST flag is missing");

// The page, with this copy's election label (titles) and evideo.bg folder; the
// test copy also gets its own address and stays out of search engines.
function writePage(dir, snapshot, { label, evideo, test }) {
  let html = page.replaceAll("%%ELECTION%%", label)
    .replace('const EVIDEO_ELECTION = "";', `const EVIDEO_ELECTION = ${JSON.stringify(evideo ?? "")};`);
  if (test) html = html.replaceAll(`"${SITE}"`, `"${SITE}${dir}/"`).replace("<head>", '<head>\n<meta name="robots" content="noindex">')
    .replace("const IS_TEST = false;", "const IS_TEST = true;");
  const base = dir ? `${out}/${dir}` : out;
  mkdirSync(`${base}/api`, { recursive: true });
  writeFileSync(`${base}/index.html`, html);
  writeFileSync(`${base}/api/data.json`, JSON.stringify(snapshot));
  console.log(`/${dir}: ${snapshot.total} сигнала за ${snapshot.sections} секции, ${snapshot.unknown} с непознат номер, ${snapshot.reporters} доброволци`);
}

mkdirSync(out, { recursive: true });

// live
const key = process.env.TALLY_API_KEY, form = process.env.TALLY_FORM_ID;
if (!key || !form) throw new Error("TALLY_API_KEY and TALLY_FORM_ID are required");
const t = await fetchTally(form, key);
const now = new Date();
const placed = {};
aggregate(t.form, t.questions, t.submissions, sections, now, placed);
const sum = await liveSummaries({ ...t, placed: placed.placed, formId: form, apiKey: process.env.ANTHROPIC_API_KEY,
  setting: process.env.SUMMARIES, storePath: process.env.SUMMARIES_STORE || ".cache/summaries.json" });
console.log(sum.log);
// the workflow saves the store only when it changed
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `summaries_changed=${sum.changed}\n`);
const stats = {};
const live = aggregate(t.form, t.questions, t.submissions, sections, now, stats, sum.map);
live.ai = sum.on;
// counts only: a type answer the form's options don't know is a volunteer's own "other" text
console.log(`видове: ${stats.typesMatched} разпознати, ${stats.typesOther} като „Друго“`);
writePage("", live, { label: "Избори 25 октомври 2026", evideo: process.env.EVIDEO_ELECTION });

// test: last election, frozen
writePage("dashboard-19-april-2026", { ...JSON.parse(read("staging/19-april-2026.json")), ai: true },
  { label: "ТЕСТ с данни от 19 април 2026", evideo: "pe202604", test: true });

mkdirSync(`${out}/dashboard`, { recursive: true });
writeFileSync(`${out}/dashboard/index.html`, `<!doctype html><meta charset="utf-8"><title>Сигнали от видеонаблюдение</title>
<meta http-equiv="refresh" content="0; url=/"><link rel="canonical" href="${SITE}"><a href="/">Сигнали от видеонаблюдение</a>
`);
// the preview image and icons
for (const f of readdirSync(new URL("public", root))) if (f.endsWith(".png")) copyFileSync(new URL(`public/${f}`, root), `${out}/${f}`);
writeFileSync(`${out}/.nojekyll`, "");
