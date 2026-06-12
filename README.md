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

```bash
npm install
npm run seed      # optional: load realistic mock data
npm run web       # → http://localhost:4173
```

Voice features need Chrome or Edge (Web Speech API).

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
