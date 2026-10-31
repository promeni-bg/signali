# Technical documentation

How the dashboard at https://signali.promeni.bg/ is built, published and run.
For what it is and who runs it, see the [README](../README.md).

- **Live:** https://signali.promeni.bg/, from the Tally form in the secret
  `TALLY_FORM_ID`.
- **Archive:** https://signali.promeni.bg/dashboard-25-october-2026/, the final
  data of the 25 October 2026 form (`staging/25-october-2026.json`, summaries
  included), frozen and indexed.
- **Test:** https://signali.promeni.bg/dashboard-19-april-2026/, a frozen
  snapshot of the 19 April 2026 form (`staging/19-april-2026.json`).

## How it works

GitHub Actions builds the site (`scripts/build_site.mjs`) and publishes it to
GitHub Pages:

1. Read every submission of the form with the secret `TALLY_API_KEY`.
2. Summarise the free-text details of new reports with Claude (see
   [AI summaries](#ai-summaries)).
3. Reduce them to the public snapshot (`src/aggregate.js`).
4. Write each dashboard as a static page plus `api/data.json`.

The site root is the live dashboard; `/dashboard/` redirects to it. The
preview image for social media (`public/og.png`) and the touch icon are drawn
by `scripts/make_og.py`.

The page (`public/index.html`) is self-contained and reloads the data every
minute while it is open. Visitors only fetch static files from GitHub's CDN,
so traffic never reaches Tally.

**Published:** for each section, the number of reports, the number of
distinct volunteers, the problem types and the time of each report, and for
a report with details, a one-line AI summary and its level, when it passed
the checks below.

**Not published:** emails, free-text details and screenshots. Emails are used
only to count distinct volunteers, and never leave the build. The details go
to the Claude API to be summarised, and nowhere else.

`src/sections.json` maps every 9-digit section ID to its МИР, област, община,
район, settlement, address and number of voters. It comes from ЦИК's 2026
section lists, the addresses and the voter counts, and is built by
`scripts/build_sections.py`. The form's section field is a number, so a leading
zero is lost: IDs are padded back to 9 digits.

A number that is on ЦИК's list, or abroad (МИР 32), is a section. So is one
whose МИР, община and район exist but whose section is not on the list (one
formed late, such as a mobile or hospital section); it is shown without an
address. Any other number is only counted, never published: it may be a phone
number or an ЕГН typed into the wrong field. Totals and type counts cover the
reports on a section; the rest are reported as one count.

## AI summaries

`src/summarize.js` sends the details of new reports to Claude Opus 5.5 (5
per request, as JSON with a random id each, so one text can sway only the
four others in its request) and gets back, per report, a
verdict, a one-sentence Bulgarian summary and a level:

- **Verdict:** `publish`; `nothing_new` (it only repeats the ticked
  types, or is not about the section); `unsafe` (it names a person or gives
  a contact: withheld whole, not cleaned up); `refused` or `too_long` (not
  retried).
- **Level:** red (could affect the result), amber (the count can't be
  observed properly, or is disorderly), green (technical, minor or resolved),
  gray (not a real report: a joke, spam, unclear).
- **Checked again in code:** a summary with 6+ digits, `@`, a link or
  domain, a Latin-script word or over 30 words is withheld as `unsafe`; so is
  one with a capitalised word in mid-sentence that the volunteer wrote too and
  that is no place on ЦИК's list, institution or party (possibly a name).

`src/live-summaries.js` keeps the answers between builds in
`.cache/summaries.json`, which the workflow restores from and saves to the
Actions cache. It is keyed by an HMAC of the submission id (keyed with the
form's ID) and holds only verdicts, levels and summaries, never the details.
Each build sends only reports without an answer: at most 300, within a
2-minute budget, so a backlog is worked off over several runs.

Whatever Claude does, the build goes on: a failed request leaves its reports
without a summary until a later run; no credit, a spend limit, a bad key or a
rate limit stops further requests for that run. The build log shows counts and
an approximate cost, never the details.

`scripts/try_summaries.mjs` runs the same code on a saved Tally download and
writes a review page (each text next to its summary). It holds the volunteers'
words: it writes only outside the repository or under `.local/`.

The test page's summaries are baked into `staging/19-april-2026.json`.

## Election night

The workflow refreshes the live dashboard about once a minute, but only
while the repository variable `LIVE` is `true`:

1. **Switch on:** Settings → Secrets and variables → Actions → Variables, set
   `LIVE` to `true`. Then go to Actions → Deploy → Run workflow, once.
   - Each run starts the next one when it finishes.
   - The 5-minute schedule restarts the loop if it ever breaks.
2. **Switch off:** set `LIVE` to `false` after the count, then Actions → Deploy
   → Run workflow once more. That last snapshot stays published, and no longer
   counts as live: the page stops warning that its data is old.
3. **AI summaries:** they run when the secret `ANTHROPIC_API_KEY` is set. To
   switch them off, and hide the ones already published, set the variable
   `SUMMARIES` to `false`; the next run publishes without them.
   - They stay in the Actions cache. To make the next runs summarise again
     from scratch (e.g. after changing the prompt), delete it too:
     `gh cache delete --all --repo promeni-bg/signali`. To withhold only one
     bad summary, there is no switch yet: switch them all off.
4. **evideo.bg links:** when evideo.bg publishes this election's folder (e.g.
   `pe202604` for April), set the variable `EVIDEO_ELECTION` to it. Until
   then, the links go to evideo.bg's home page.

A push to `main` always deploys once.

**What the page shows when something fails:** it gives the time of its data
("Данни към 21:05 ч."). Only while `LIVE` is on does old data count as a failure;
before and after the count the page just gives the time. If the build stops working (Tally down, a bad key),
the data stops changing, and after 10 minutes the page says how long ago it was
updated, with a grey dot. (Ten minutes, not five: a run that works off a
backlog of summaries takes about three.) If the page can't reach its data, it says so and
keeps what it had. With no reports yet, each panel says so and the AI card
waits for the first summaries.

## Setup

- **Secrets:** `TALLY_API_KEY` and `TALLY_FORM_ID`. The form's ID is secret:
  anyone who has it can file reports. Never write it into the repository, an
  issue or a workflow variable, because Actions logs on a public repository
  are public.
- **Secrets (optional):** `ANTHROPIC_API_KEY`, for the AI summaries. Use a key
  with its own spend limit.
- **Variables:** `LIVE`, and `EVIDEO_ELECTION` and `SUMMARIES` (optional).
- **Pages:** Settings → Pages → Source: GitHub Actions; custom domain
  `signali.promeni.bg`; Enforce HTTPS. (A workflow-published site takes its
  domain from these settings, not from a `CNAME` file.)
  - On the free plan, Pages works only once the repository is public.
- **DNS (Cloudflare):** `signali` CNAME `promeni-bg.github.io`, proxied (orange
  cloud) for caching and visitor counts: SSL "Full", a cache rule making
  `signali.promeni.bg` eligible for cache with the browser TTL respecting the
  origin. GitHub renews its certificate through the domain, which can fail
  while proxied: switch back to DNS only before mid-December 2026.

## Local

```bash
npm ci --ignore-scripts
TALLY_API_KEY=... TALLY_FORM_ID=... ANTHROPIC_API_KEY=... node scripts/build_site.mjs _site
python -m http.server --directory _site
node scripts/snapshot.mjs <key file> <form id> <out.json>   # one snapshot, e.g. to freeze a test set
node scripts/try_summaries.mjs <download.json> <key file> <review.html> [rows:12,33]   # review summaries
```
