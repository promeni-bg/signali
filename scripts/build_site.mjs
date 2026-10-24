// Build the GitHub Pages site into <out>:
//   /                           live: the Tally form TALLY_FORM_ID, read now with TALLY_API_KEY
//   dashboard-19-april-2026/    test: the frozen snapshot staging/19-april-2026.json, not indexed
//   dashboard/                  redirect to /, the first address we announced
// EVIDEO_ELECTION (optional): evideo.bg's folder for this election, e.g. "pe202610".
//   node scripts/build_site.mjs _site
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { aggregate, fetchTally } from "../src/aggregate.js";

const out = process.argv[2] ?? "_site";
const root = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const page = read("public/index.html");
const sections = JSON.parse(read("src/sections.json"));
const SITE = "https://signali.promeni.bg/";

// The page, with this copy's evideo.bg folder; the test copy gets its own address and title.
function writePage(dir, snapshot, evideo, test) {
  let html = page.replace('const EVIDEO_ELECTION = "";', `const EVIDEO_ELECTION = ${JSON.stringify(evideo ?? "")};`);
  if (test) {
    html = html.replaceAll(`"${SITE}"`, `"${SITE}${dir}/"`)
      .replaceAll("· Избори 25 октомври 2026", `· ${test}`)
      .replace("<head>", '<head>\n<meta name="robots" content="noindex">');
  }
  const base = dir ? `${out}/${dir}` : out;
  mkdirSync(`${base}/api`, { recursive: true });
  writeFileSync(`${base}/index.html`, html);
  writeFileSync(`${base}/api/data.json`, JSON.stringify(snapshot));
  console.log(`/${dir}: ${snapshot.total} сигнала, ${snapshot.sections} секции, ${snapshot.reporters} доброволци`);
}

mkdirSync(out, { recursive: true });

// live
const key = process.env.TALLY_API_KEY, form = process.env.TALLY_FORM_ID;
if (!key || !form) throw new Error("TALLY_API_KEY and TALLY_FORM_ID are required");
const t = await fetchTally(form, key);
writePage("", aggregate(t.form, t.questions, t.submissions, sections), process.env.EVIDEO_ELECTION);

// test: last election, frozen
writePage("dashboard-19-april-2026", JSON.parse(read("staging/19-april-2026.json")), "pe202604", "ТЕСТ с данни от 19 април 2026");

mkdirSync(`${out}/dashboard`, { recursive: true });
writeFileSync(`${out}/dashboard/index.html`, `<!doctype html><meta charset="utf-8"><title>Сигнали от видеонаблюдение</title>
<meta http-equiv="refresh" content="0; url=/"><link rel="canonical" href="${SITE}"><a href="/">Сигнали от видеонаблюдение</a>
`);
// the preview image and icons
for (const f of readdirSync(new URL("public", root))) if (f.endsWith(".png")) copyFileSync(new URL(`public/${f}`, root), `${out}/${f}`);
if (existsSync(new URL("CNAME", root))) copyFileSync(new URL("CNAME", root), `${out}/CNAME`);
writeFileSync(`${out}/.nojekyll`, "");
