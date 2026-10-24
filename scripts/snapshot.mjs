// Local test: build the snapshot from a Tally form with the same code the Worker runs.
//   node scripts/snapshot.mjs <key file> <form id> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { aggregate, fetchTally } from "../src/aggregate.js";

const [keyFile, formId, out] = process.argv.slice(2);
const key = readFileSync(keyFile, "utf8").trim().split("=").pop().trim();
const sections = JSON.parse(readFileSync(new URL("../src/sections.json", import.meta.url), "utf8"));
const { form, questions, submissions } = await fetchTally(formId, key);
const snap = aggregate(form, questions, submissions, sections);
writeFileSync(out, JSON.stringify(snap));
console.log(`${snap.total} сигнала, ${snap.sections} секции, ${snap.reporters} сигнализиращи, ${snap.unknown.length} непознати номера -> ${out}`);
