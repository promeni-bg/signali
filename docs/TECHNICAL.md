# Technical documentation

How the dashboard at https://signali.promeni.bg/ is built, published and run.
For what it is and who runs it, see the [README](../README.md).

- **Live:** https://signali.promeni.bg/, from the Tally form in the secret
  `TALLY_FORM_ID`.
- **Test:** https://signali.promeni.bg/dashboard-19-april-2026/, a frozen
  snapshot of the 19 April 2026 form (`staging/19-april-2026.json`).

## How it works

GitHub Actions builds the site (`scripts/build_site.mjs`) and publishes it to
GitHub Pages:

1. Read every submission of the form with the secret `TALLY_API_KEY`.
2. Reduce them to the public snapshot (`src/aggregate.js`).
3. Write each dashboard as a static page plus `api/data.json`.

The site root is the live dashboard; `/dashboard/` redirects to it. The
preview image for social media (`public/og.png`) and the touch icon are drawn
by `scripts/make_og.py`.

The page (`public/index.html`) is self-contained and reloads the data every
minute while it is open. Visitors only fetch static files from GitHub's CDN,
so traffic never reaches Tally.

**Published:** for each section, the number of reports, the number of
distinct volunteers, the problem types and the time of each report.

**Not published:** emails, free-text details and screenshots. Emails are used
only to count distinct volunteers, and never leave the build.

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

## Election night

The workflow refreshes the live dashboard about once a minute, but only
while the repository variable `LIVE` is `true`:

1. **Switch on:** Settings → Secrets and variables → Actions → Variables, set
   `LIVE` to `true`. Then go to Actions → Deploy → Run workflow, once.
   - Each run starts the next one when it finishes.
   - The 5-minute schedule restarts the loop if it ever breaks.
2. **Switch off:** set `LIVE` to `false` after the count. The last snapshot
   stays published.
3. **evideo.bg links:** when evideo.bg publishes this election's folder (e.g.
   `pe202604` for April), set the variable `EVIDEO_ELECTION` to it. Until
   then, the links go to evideo.bg's home page.

A push to `main` always deploys once.

## Setup

- **Secrets:** `TALLY_API_KEY` and `TALLY_FORM_ID`. The form's ID is secret:
  anyone who has it can file reports. Never write it into the repository, an
  issue or a workflow variable, because Actions logs on a public repository
  are public.
- **Variables:** `LIVE`, and `EVIDEO_ELECTION` (optional).
- **Pages:** Settings → Pages → Source: GitHub Actions; custom domain
  `signali.promeni.bg`; Enforce HTTPS. (A workflow-published site takes its
  domain from these settings, not from a `CNAME` file.)
  - On the free plan, Pages works only once the repository is public.
- **DNS (Cloudflare):** `signali` CNAME `promeni-bg.github.io`, DNS only (grey
  cloud), so that GitHub can issue the HTTPS certificate.

## Local

```bash
TALLY_API_KEY=... TALLY_FORM_ID=... node scripts/build_site.mjs _site
python -m http.server --directory _site
node scripts/snapshot.mjs <key file> <form id> <out.json>   # one snapshot, e.g. to freeze a test set
```
