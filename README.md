# StudyFlow

A **compliant personal control layer** for people who participate in paid UX
research studies (Respondent, User Interviews, UserTesting, Prolific, dscout).

It is a private dashboard for **you, the participant**. It does not scrape,
log into, or automate any research platform — doing that violates their terms
and, as of 2026, reliably gets accounts banned and earnings confiscated
(Prolific's Feb-2026 bot-authenticity checks detect AI agents with ~100%
accuracy). StudyFlow stays entirely on your side of the line: you enter your
own leads (or paste them from the platforms' own notification emails), and it
helps you track, follow up, and prepare.

![liquid glass UI](web/)

## What it does

- **Dashboard** — total earned, effective $/hr, this-month, pipeline value, and
  follow-ups that need attention.
- **Pipeline** — a glass kanban of every lead across `Invited → Applied →
  Scheduled → Completed → Paid`. One click advances a lead; moving to *Paid*
  logs the earning automatically.
- **Interview Prep** — a question bank (think-aloud, behavioral, product
  feedback, logistics) with a **voice practice mode**: it reads a question
  aloud, listens to your spoken answer, times you, and transcribes it. Being
  good in sessions is the real income lever — good sessions get you re-invited.
- **Voice control** — tap the mic (or ⌘+Space) and say things like
  *"show pipeline"*, *"how much have I made"*, *"what's next"*, *"add a lead"*,
  or *"start practice"*. Built on the browser's Web Speech API.

## Run it

The web app is **fully static** — it stores your data in the browser's
`localStorage` (nothing leaves your machine) via `web/store.js`. So you can
just open it, or deploy it anywhere static.

```bash
# simplest: serve the static folder
npx serve web            # → http://localhost:3000
# or with the bundled dev server (also serves web/)
npm install && npm run web   # → http://localhost:4173
```

Voice features need Chrome or Edge (Web Speech API). On first load it seeds
realistic demo data; run `StudyFlowReset()` in the console to wipe it.

## Deploy to Netlify (new isolated site)

Because it's static, this drops onto Netlify's free plan for ~nothing and
**won't affect any of your other Netlify sites** — each site is independent.
`netlify.toml` sets `base = "web"`, which has no `package.json`, so Netlify
skips dependency install (no build, near-zero build credits).

Two ways:

```bash
# A) drag-and-drop: zip/drop the web/ folder at https://app.netlify.com/drop
# B) connect this repo in the Netlify UI → it reads netlify.toml automatically
```

Either gives you a fresh `*.netlify.app` URL. Heads-up on the free plan: sites
are unlimited, but all sites share one monthly usage pool (legacy: 100 GB /
300 build-min; credit-based accounts: 300 credits, hard cap). A static
dashboard uses almost none of it.

> Note: the deployed web app and the optional CLI/SQLite path are **separate
> local stores** — the browser app uses `localStorage`, the CLI uses
> `data/zarb.db`. For most people the web app is the only one you'll touch.

## CLI (optional)

For when you'd rather type than click — also fully local:

```bash
node src/cli.js stats
node src/cli.js lead --platform respondent --title "Fintech interview" --pay 175 --duration 60 --status scheduled
node src/cli.js track --add-earning --platform respondent --amount 175 --duration 60
node src/cli.js track --list
```

## Architecture

```
server.js        Express API over the local SQLite tracker (no platform access)
src/db.js        SQLite store: studies, applications, earnings
src/prep.js      Interview prep question bank
src/seed.js      Mock data seeder
src/cli.js       Local CLI (stats / track / lead)
web/             Liquid-glass single-page app (index.html, styles.css, app.js)
```

## Why "compliant" is the whole point

The honest economics: research participation is a *nice supplement*, not an
"arbitrage" — a few hundred dollars a month for most people, occasionally more
with sought-after demographics. The bottleneck is never *finding* studies (the
platforms email you matches for free); it's *getting selected* and *being good
once you're in the room*. So StudyFlow automates the only things you can
legitimately automate: **your own organization, follow-up discipline, and
practice.** Everything that would touch a platform's servers with a bot has
been deliberately left out.
