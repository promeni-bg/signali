// Local test: summarise the details of a saved Tally download ({form, pages}) and
// write a review page with each text next to its summary. The page holds the
// volunteers' own words: it is written only outside the repo or under .local/.
//   node scripts/try_summaries.mjs <download.json> <key file> <review.html> [how many | rows:12,33,…]
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { formOptions, questionIds } from "../src/aggregate.js";
import { makeClient, placeNames, summarize } from "../src/summarize.js";

const fail = (msg) => { console.error(msg); process.exit(1); };
const [file, keyFile, out, limit] = process.argv.slice(2);
if (!file || !keyFile || !out) fail("usage: node scripts/try_summaries.mjs <download.json> <key file> <review.html> [how many | rows:12,33,…]");

const repo = fileURLToPath(new URL("..", import.meta.url));
const rel = relative(repo, resolve(out));
if (!rel.startsWith("..") && !isAbsolute(rel) && !rel.startsWith(`.local${sep}`)) fail("the review page holds the volunteers' text: write it outside the repo or under .local/");

const d = JSON.parse(readFileSync(file, "utf8"));
if (!d?.form?.blocks || !Array.isArray(d.pages) || !d.pages.length) fail("not a Tally download: expected {form, pages: [...]}");
const q = questionIds(d.pages[0].questions ?? []);
if (!q.details) fail("the form has no free-text question");
const { options, index, other } = formOptions(d.form);

// last election's form took the volunteer's own "other" text as a type; this
// year's has a plain "Друго" with all their words in the details: test it that way
const items = [];
for (const s of d.pages.flatMap((p) => p.submissions ?? [])) {
  const a = Object.fromEntries((s.responses ?? []).map((r) => [r.questionId, r.answer]));
  let text = typeof a[q.details] === "string" ? a[q.details].trim() : "";
  if (!text) continue; // only reports with details, so row numbers stay comparable between runs
  const t = a[q.types];
  const types = new Set();
  for (const x of (Array.isArray(t) ? t : t ? [t] : []).map((x) => String(x).trim())) {
    const i = index.get(x.normalize("NFC"));
    if (i !== undefined) { types.add(options[i]); continue; }
    types.add(options[other]);
    if (!text.includes(x)) text = `${x}. ${text}`;
  }
  items.push({ key: s.id, text, types: [...types], section: a[q.section] });
}

// rows:… picks rows by their number on a full review page, which it keeps
let todo;
if (limit?.startsWith("rows:")) {
  const nums = limit.slice(5).split(",").filter(Boolean).map(Number);
  const bad = nums.filter((n) => !Number.isInteger(n) || n < 1 || n > items.length);
  if (bad.length) console.log(`left out rows not between 1 and ${items.length}: ${bad.join(", ")}`);
  todo = nums.filter((n) => !bad.includes(n)).map((n) => ({ ...items[n - 1], row: n }));
} else todo = limit ? items.slice(0, Number(limit)) : items;
if (!todo.length) fail("nothing to summarise");

const client = await makeClient(readFileSync(keyFile, "utf8").trim());
const usage = {};
const t0 = Date.now();
const places = placeNames(JSON.parse(readFileSync(new URL("../src/sections.json", import.meta.url), "utf8")));
const res = await summarize(client, todo, usage, { deadline: Infinity, places });
const cost = (usage.input * 4 + usage.output * 20) / 1e6;
const count = {};
for (const r of res.values()) for (const k of [r.verdict, r.level]) if (k) count[k] = (count[k] ?? 0) + 1;
console.log(`${todo.length} texts, ${res.size} answered (${usage.failed} failed, ${usage.skipped} skipped, ${usage.withheld} withheld by the contact check${usage.stopped ? ", stopped" : ""}) in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${JSON.stringify(count)}; ${usage.input} in / ${usage.output} out tokens ≈ $${cost.toFixed(2)}`);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const rows = todo.map((x, i) => {
  const r = res.get(x.key) ?? { verdict: "failed", summary: "", level: null };
  return `<tr class="${esc(r.verdict)}"><td>${x.row ?? i + 1}</td><td>${esc(x.section)}</td><td>${esc(x.types.join("; "))}</td><td>${esc(x.text)}</td><td>${esc(r.verdict)}</td><td class="${esc(r.level)}">${esc(r.level)}</td><td>${esc(r.summary)}</td></tr>`;
});
writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Summaries review</title>
<style>body{font:14px system-ui;margin:16px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 6px;vertical-align:top}
td:nth-child(4){max-width:480px}td:nth-child(7){max-width:360px;font-weight:600}td.red{background:#fdd}td.amber{background:#fec}td.green{background:#dfd}td.gray{background:#ddd}.unsafe td:nth-child(5){color:#b00}.nothing_new{color:#888}</style>
<p>${todo.length} texts · ${esc(JSON.stringify(count))} · ≈ $${cost.toFixed(2)}</p>
<table><tr><th>#</th><th>Секция</th><th>Видове</th><th>Текст (не се публикува)</th><th>Решение</th><th>Ниво</th><th>Обобщение</th></tr>
${rows.join("\n")}</table>`);
