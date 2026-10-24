// Local test: summarise the details of a saved Tally download ({form, pages}) and
// write a review page with each text next to its summary. The page holds the
// volunteers' own words: keep it out of the repo.
//   node scripts/try_summaries.mjs <download.json> <key file> <review.html> [how many | rows:12,33,…]
import { readFileSync, writeFileSync } from "node:fs";
import { makeClient, summarize } from "../src/summarize.js";

const [file, keyFile, out, limit] = process.argv.slice(2);
const d = JSON.parse(readFileSync(file, "utf8"));
const questions = d.pages[0].questions;
const subs = d.pages.flatMap((p) => p.submissions);
const qid = (type) => questions.find((q) => q.type === type)?.id;
const [qText, qTypes, qSec] = [qid("TEXTAREA"), qid("MULTIPLE_CHOICE") ?? qid("CHECKBOXES"), qid("INPUT_NUMBER")];

// last election's form took the volunteer's own "other" text as a type; this
// year's has a plain "Друго" with all their words in the details: test it that way
const options = new Set(d.form.blocks.filter((b) => b.type === "MULTIPLE_CHOICE_OPTION" || b.type === "CHECKBOX").map((b) => (b.payload?.text ?? "").trim()));
const items = [];
for (const s of subs) {
  const a = Object.fromEntries(s.responses.map((r) => [r.questionId, r.answer]));
  let text = typeof a[qText] === "string" ? a[qText].trim() : "";
  if (!text) continue; // only reports with details, so row numbers stay comparable between runs
  const t = a[qTypes];
  const types = new Set();
  for (const x of (Array.isArray(t) ? t : t ? [t] : []).map((x) => String(x).trim())) {
    if (options.has(x)) { types.add(x); continue; }
    types.add("Друго");
    if (!text.includes(x)) text = text ? `${x}. ${text}` : x;
  }
  items.push({ key: s.id, text, types: [...types], section: a[qSec] });
}
// rows:… picks rows by their number on a full review page, which it keeps
const pick = limit?.startsWith("rows:") ? limit.slice(5).split(",").map(Number) : null;
const todo = pick ? pick.map((n) => ({ ...items[n - 1], row: n })) : limit ? items.slice(0, Number(limit)) : items;

const client = await makeClient(readFileSync(keyFile, "utf8").trim());
const usage = {};
const t0 = Date.now();
const res = await summarize(client, todo, usage);
const cost = (usage.input * 4 + usage.output * 20) / 1e6;
const count = {};
for (const r of res.values()) for (const k of [r.verdict, r.level]) count[k] = (count[k] ?? 0) + 1;
console.log(`${todo.length} texts, ${res.size} answered (${usage.failed} failed, ${usage.skipped} skipped${usage.stopped ? ", stopped" : ""}) in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${JSON.stringify(count)}; ${usage.input} in / ${usage.output} out tokens ≈ $${cost.toFixed(2)}`);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const rows = todo.map((x, i) => {
  const r = res.get(x.key) ?? { verdict: "failed", summary: "" };
  return `<tr class="${r.verdict}"><td>${x.row ?? i + 1}</td><td>${esc(x.section)}</td><td>${esc(x.types.join("; "))}</td><td>${esc(x.text)}</td><td>${r.verdict}</td><td class="${r.level}">${r.level ?? ""}</td><td>${esc(r.summary)}</td></tr>`;
});
writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Summaries review</title>
<style>body{font:14px system-ui;margin:16px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 6px;vertical-align:top}
td:nth-child(4){max-width:480px}td:nth-child(7){max-width:360px;font-weight:600}td.red{background:#fdd}td.amber{background:#fec}td.green{background:#dfd}td.gray{background:#ddd}.unsafe td:nth-child(5){color:#b00}.nothing_new{color:#888}</style>
<p>${todo.length} texts · ${JSON.stringify(count)} · ≈ $${cost.toFixed(2)}</p>
<table><tr><th>#</th><th>Секция</th><th>Видове</th><th>Текст (не се публикува)</th><th>Решение</th><th>Ниво</th><th>Обобщение</th></tr>
${rows.join("\n")}</table>`);
