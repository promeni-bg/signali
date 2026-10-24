// Tally submissions -> the public snapshot. Everything personal stops here: the
// reporter's email is used only to count distinct reporters and never leaves this
// function; free-text details and screenshots are not read at all.

const TZ = "Europe/Sofia";

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

// The form's own option texts; anything else a volunteer typed under "Друго" counts as "Друго".
function formOptions(form) {
  const opts = form.blocks
    .filter((b) => b.type === "MULTIPLE_CHOICE_OPTION" || b.type === "CHECKBOX")
    .map((b) => (b.payload?.text ?? "").trim())
    .filter(Boolean);
  if (!opts.includes("Друго")) opts.push("Друго");
  return [...new Set(opts)];
}

// The section field is a number, so a leading zero (МИР 01-09) is lost: pad back to 9 digits.
export function sectionId(answer) {
  if (answer === null || answer === undefined || answer === "") return null;
  const digits = String(answer).replace(/\D/g, "");
  if (!digits || digits.length > 9) return { bad: String(answer).slice(0, 20) };
  return { id: digits.padStart(9, "0") };
}

const hm = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function aggregate(form, questions, submissions, sections, now = new Date()) {
  const q = questionIds(questions);
  const options = formOptions(form);
  const optIndex = new Map(options.map((o, i) => [o, i]));
  const other = optIndex.get("Друго");

  const bySid = new Map();
  const unknown = new Map();
  const reporters = new Set();
  const byType = new Array(options.length).fill(0);
  const times = [];
  let total = 0;

  for (const s of submissions) {
    if (s.isCompleted === false) continue;
    const ans = {};
    for (const r of s.responses) ans[r.questionId] = r.answer;
    const sec = sectionId(ans[q.section]);
    if (!sec) continue;
    total++;
    const at = s.submittedAt;
    times.push(at);
    const email = typeof ans[q.email] === "string" ? ans[q.email].trim().toLowerCase() : "";
    if (email) reporters.add(email);

    let raw = ans[q.types];
    raw = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const types = [...new Set(raw.map((t) => optIndex.get(String(t).trim()) ?? other))].sort((a, b) => a - b);
    for (const t of types) byType[t]++;

    if (sec.bad || !(sec.id in sections || sec.id.startsWith("32"))) {
      const key = sec.bad ?? sec.id;
      unknown.set(key, (unknown.get(key) ?? 0) + 1);
      continue;
    }
    let e = bySid.get(sec.id);
    if (!e) bySid.set(sec.id, (e = { id: sec.id, reports: [], people: new Set() }));
    if (email) e.people.add(email);
    // [submitted at (ISO), the time the volunteer gave ("HH:MM"), type indexes]
    const told = typeof ans[q.time] === "string" ? ans[q.time].slice(0, 5) : "";
    e.reports.push([at, told, types]);
  }

  const out = [];
  for (const e of bySid.values()) {
    e.reports.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const types = new Array(options.length).fill(0);
    for (const r of e.reports) for (const t of r[2]) types[t]++;
    const p = sections[e.id] ?? [e.id.slice(0, 2), "ЧУЖБИНА", "", "", "", "", "", null];
    out.push({
      id: e.id,
      n: e.reports.length,
      people: e.people.size,
      types,
      last: e.reports[e.reports.length - 1][0],
      place: p, // [МИР код, МИР, област, община, район, населено място, адрес, избиратели]
      reports: e.reports,
    });
  }
  out.sort((a, b) => b.n - a.n || b.people - a.people || (a.last < b.last ? 1 : -1));

  times.sort();
  return {
    updated: now.toISOString(),
    form: form.name,
    total,
    sections: out.length,
    reporters: reporters.size,
    first: times[0] ?? null,
    last: times[times.length - 1] ?? null,
    lastLocal: times.length ? hm.format(new Date(times[times.length - 1])) : null,
    options,
    byType,
    unknown: [...unknown].map(([raw, n]) => ({ raw, n })).sort((a, b) => b.n - a.n),
    rows: out,
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
