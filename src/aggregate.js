// Tally submissions -> the public snapshot. Everything personal stops here: the
// reporter's email is used only to count distinct reporters and never leaves this
// function; free-text details and screenshots are not read at all, and a section
// number that matches no section is only counted, never published (it may be a
// phone number or an ЕГН typed into the wrong field).

// Questions are found by type, not id, so the same code reads last election's form.
function questionIds(questions) {
  const q = {};
  for (const x of questions) {
    if (x.type === "INPUT_NUMBER" && !q.section) q.section = x.id;
    else if (x.type === "INPUT_TIME" && !q.time) q.time = x.id;
    else if (x.type === "MULTIPLE_CHOICE" || x.type === "CHECKBOXES") q.types ??= x.id;
    else if (x.type === "INPUT_EMAIL" && !q.email) q.email = x.id;
  }
  return q;
}

// The form's options: their texts, and a lookup by text or by option id, since
// Tally may answer with either. Anything else (the free-text "other") counts as "Друго".
function formOptions(form) {
  const blocks = form.blocks.filter((b) => b.type === "MULTIPLE_CHOICE_OPTION" || b.type === "CHECKBOX");
  const options = [...new Set(blocks.map((b) => (b.payload?.text ?? "").trim()).filter(Boolean))];
  // the form's own "other" option may carry an emoji ("❓ Друго")
  let other = options.findIndex((o) => o.replace(/^[^\p{L}\p{N}]+/u, "") === "Друго");
  if (other < 0) other = options.push("Друго") - 1;
  const index = new Map(options.map((o, i) => [o.normalize("NFC"), i]));
  for (const b of blocks) {
    const i = index.get((b.payload?.text ?? "").trim().normalize("NFC"));
    if (i !== undefined && b.uuid) index.set(b.uuid, i);
  }
  return { options, index, other };
}

// The section field is a number, so a leading zero (МИР 01-09) is lost: pad back to 9 digits.
export function sectionId(answer) {
  if (answer === null || answer === undefined || answer === "") return null;
  const digits = String(answer).replace(/\D/g, "");
  if (!digits || digits.length > 9) return { bad: true };
  return { id: digits.padStart(9, "0") };
}

// A number's place: a section on ЦИК's list; one abroad (МИР 32); or one ЦИК's list
// doesn't have yet (formed late: mobile, hospital) in a known МИР, община and район.
function placeOf(id, sections, areas) {
  if (sections[id]) return { place: sections[id] };
  if (id.startsWith("32")) return { place: ["32", "ЧУЖБИНА", "", "", "", "", "", null] };
  const a = areas.get(id.slice(0, 6));
  return a ? { place: a, extra: true } : null;
}

// stats (optional) receives counts for the build log only: how type answers matched.
export function aggregate(form, questions, submissions, sections, now = new Date(), stats = {}) {
  const q = questionIds(questions);
  const { options, index, other } = formOptions(form);
  const areas = new Map();
  for (const [id, p] of Object.entries(sections)) if (!areas.has(id.slice(0, 6))) areas.set(id.slice(0, 6), [p[0], p[1], p[2], p[3], p[4], "", "", null]);

  const bySid = new Map();
  const reporters = new Set();
  const byType = new Array(options.length).fill(0);
  let total = 0, unknown = 0, last = null;
  Object.assign(stats, { typesMatched: 0, typesOther: 0 });

  for (const s of submissions) {
    if (s.isCompleted === false) continue;
    const ans = {};
    for (const r of s.responses) ans[r.questionId] = r.answer;
    const sec = sectionId(ans[q.section]);
    if (!sec) continue;
    const email = typeof ans[q.email] === "string" ? ans[q.email].trim().toLowerCase() : "";
    if (email) reporters.add(email);

    let raw = ans[q.types];
    raw = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const types = [...new Set(raw.map((t) => {
      const i = index.get(String(t).trim().normalize("NFC"));
      stats[i === undefined ? "typesOther" : "typesMatched"]++;
      return i ?? other;
    }))].sort((a, b) => a - b);

    const where = sec.bad ? null : placeOf(sec.id, sections, areas);
    if (!where) { unknown++; continue; }
    for (const t of types) byType[t]++;

    total++;
    const at = s.submittedAt;
    if (!last || at > last) last = at;
    let e = bySid.get(sec.id);
    if (!e) bySid.set(sec.id, (e = { id: sec.id, ...where, reports: [], people: new Set() }));
    if (email) e.people.add(email);
    // [submitted at (ISO), the time the volunteer gave ("HH:MM"), type indexes]
    const told = typeof ans[q.time] === "string" ? ans[q.time].slice(0, 5) : "";
    e.reports.push([at, told, types]);
  }

  const rows = [];
  for (const e of bySid.values()) {
    e.reports.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const types = new Array(options.length).fill(0);
    for (const r of e.reports) for (const t of r[2]) types[t]++;
    rows.push({
      id: e.id,
      n: e.reports.length,
      people: e.people.size,
      types,
      last: e.reports[e.reports.length - 1][0],
      place: e.place, // [МИР код, МИР, област, община, район, населено място, адрес, избиратели]
      ...(e.extra ? { extra: true } : {}), // not on ЦИК's list: no settlement or address
      reports: e.reports,
    });
  }

  return {
    updated: now.toISOString(),
    form: form.name,
    total,         // reports on a section; `unknown` counts those whose number is no section
    sections: rows.length,
    reporters: reporters.size,
    last,
    options,
    byType,
    unknown,
    rows,
  };
}

// All submissions of a form, every page.
export async function fetchTally(formId, apiKey, fetchImpl = fetch) {
  const h = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  const get = async (path) => {
    const r = await fetchImpl(`https://api.tally.so${path}`, { headers: h });
    // never name the form: its ID is secret, and Actions logs are public
    if (!r.ok) throw new Error(`Tally API: HTTP ${r.status}`);
    return r.json();
  };
  const form = await get(`/forms/${formId}`);
  let questions = [];
  const submissions = [];
  for (let page = 1; page < 200; page++) {
    const d = await get(`/forms/${formId}/submissions?filter=completed&limit=500&page=${page}`);
    if (page === 1) questions = d.questions ?? [];
    submissions.push(...(d.submissions ?? []));
    if (!d.hasMore) break;
  }
  return { form, questions, submissions };
}
