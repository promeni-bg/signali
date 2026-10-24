// The live form's summaries between builds. Each build reads the store, sends
// Claude only the reports it has no answer for yet, and writes the store back
// (the workflow keeps it in the Actions cache). The store is keyed by a keyed
// hash of the submission id and holds only what may be published anyway: the
// verdict, the level and a summary that passed the checks. No volunteer's text.

import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { formOptions, questionIds } from "./aggregate.js";
import { makeClient, placeNames, summarize } from "./summarize.js";

const MAX_PER_RUN = 300;     // a backlog is worked off over several runs
const BUDGET_MS = 120_000;   // the deploy job has 5 minutes in all

function loadStore(path) {
  try {
    const s = JSON.parse(readFileSync(path, "utf8"));
    if (s?.v === 1 && s.items && typeof s.items === "object") return s;
  } catch {}
  return { v: 1, items: {} };
}

// -> { map: Map submission id -> {verdict, summary, level}, on, log, changed }
//   on: summaries are published at all (SUMMARIES is not "false" and there is a key)
export async function liveSummaries({ form, questions, submissions, placed, sections, formId, apiKey, setting, storePath }) {
  const map = new Map();
  if (setting === "false") return { map, on: false, log: "обобщения: изключени (SUMMARIES=false)", changed: false };
  if (!apiKey) return { map, on: false, log: "обобщения: няма ANTHROPIC_API_KEY", changed: false };

  const store = loadStore(storePath);
  const stored = Object.keys(store.items).length; // 0 after a lost cache: everything is summarised again
  const hash = (id) => createHmac("sha256", formId).update(String(id)).digest("hex").slice(0, 32);
  const q = questionIds(questions);
  const { options, index, other } = formOptions(form);

  const todo = [];
  for (const s of submissions) {
    if (!placed.has(s.id)) continue;
    const h = hash(s.id);
    if (store.items[h]) { map.set(s.id, store.items[h]); continue; }
    const ans = {};
    for (const r of s.responses ?? []) ans[r.questionId] = r.answer;
    const text = typeof ans[q.details] === "string" ? ans[q.details].trim() : "";
    if (!text) continue;
    let t = ans[q.types];
    t = Array.isArray(t) ? t : t ? [t] : [];
    const types = [...new Set(t.map((x) => options[index.get(String(x).trim().normalize("NFC")) ?? other]))];
    todo.push({ key: s.id, text, types });
  }

  let usage = {}, got = new Map();
  if (todo.length) {
    try {
      const client = await makeClient(apiKey);
      got = await summarize(client, todo, usage, { max: MAX_PER_RUN, deadline: BUDGET_MS, places: placeNames(sections) });
    } catch (e) {
      // the SDK missing or a bad client setup: go on without new summaries
      usage.stopped = `клиентът не тръгна (${e?.name ?? "error"})`;
    }
  }
  for (const [id, r] of got) { store.items[hash(id)] = r; map.set(id, r); }
  const changed = got.size > 0;
  if (changed) { mkdirSync(dirname(storePath), { recursive: true }); writeFileSync(storePath, JSON.stringify(store)); }

  const cost = ((usage.input ?? 0) * 4 + (usage.output ?? 0) * 20) / 1e6;
  const pub = [...map.values()].filter((r) => r.verdict === "publish").length;
  const verdicts = Object.entries(usage.verdicts ?? {}).map(([k, n]) => `${k} ${n}`).join(", ");
  const log = `обобщения: ${stored} в паметта, ${todo.length} нови, ${got.size} получени (${verdicts || "—"}), ${usage.failed ?? 0} неуспешни, ${usage.skipped ?? 0} за следващия път, ${usage.withheld ?? 0} спрени от проверките в кода; ${pub} публикувани; ≈ $${cost.toFixed(2)}` + (usage.stopped ? `; спряно: ${usage.stopped}` : "");
  return { map, on: true, log, changed };
}
