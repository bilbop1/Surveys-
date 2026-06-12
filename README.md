# StudyFlow

A **compliant personal control layer** for people who participate in paid UX
research studies (Respondent, User Interviews, UserTesting, Prolific, dscout).

It is a private dashboard for **you, the participant**. It does not scrape,
log into, or automate any research platform — doing that violates their terms
and, as of 2026, reliably gets accounts banned and earnings confiscated
(Prolific's authenticity checks detect AI agents at ~100% accuracy and
LLM-written answers at 98.7% precision). StudyFlow stays entirely on your side
of the line: the platforms email you study invites, and StudyFlow reads **your
own inbox** to turn them into ranked, one-click-to-apply offer cards — plus
tracking, follow-ups, voice control, and interview practice.

**→ Start with the [Setup Guide](web/setup-guide.html)** — one read takes you
from nothing to a fully wired control center (dedicated Gmail, all five
platforms tuned, dashboard live, reachable from every device via Tailscale).
It's served at `/setup-guide.html` when the app is running, and prints to a
clean PDF.

## What it does

- **Offers** — your study-invite emails, auto-ingested from a dedicated Gmail
  (IMAP app-password or OAuth, polled every 5 min) or pasted in manually.
  Each is parsed (platform, pay, length), scored by effective $/hr, and staged
  with an *Open to apply* link. Nothing is scraped — these were sent to you.
- **Application locker** — your reusable screener answers (intro blurb,
  occupation, devices…), copy-to-clipboard, so applying takes two minutes.
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
  *"what should I apply to"*, *"show pipeline"*, *"how much have I made"*,
  *"what's next"*, or *"start practice"*. Uses on-device recognition on
  Chrome 139+ (audio never leaves your machine), Web Speech API elsewhere.

## Run it (server mode — recommended)

```bash
npm install
cp .env.example .env     # then fill in GMAIL_USER + GMAIL_APP_PASSWORD
npm start                # → http://localhost:4173
npm run dev              # same, with auto-restart on file changes
```

Server mode persists everything in local SQLite (`data/zarb.db`) and polls
your dedicated Gmail every 5 minutes for new study invites. The Gmail
credentials are an **app password for an inbox you create just for platform
notifications** — read-only blast radius, revocable any time, no Google Cloud
project needed. See the [Setup Guide](web/setup-guide.html) for the 15-minute
walkthrough.

### Static fallback

The web app also runs with **no backend at all** — it detects the server is
absent and falls back to browser `localStorage` (demo seed data included;
`StudyFlowReset()` in the console wipes it). That's what the earlier Netlify
deploy used, and it still works: drop `web/` on any static host.

## Host on Windows, use from your Mac/iPhone (Tailscale)

The Setup Guide has the full runbook, in short:

```powershell
# on the Windows PC, as admin — keep it alive across reboots:
#   https://github.com/jessety/pm2-installer
pm2 start C:\path\to\StudyFlow\server.js --name studyflow && pm2 save
# publish HTTPS to your private tailnet (never public):
tailscale serve --bg 4173
```

That prints `https://<machine>.<tailnet>.ts.net` — open it from any of your
Tailscale-connected devices. The real HTTPS origin matters: browsers only
allow microphone access (voice features) on secure origins, so the Tailscale
URL keeps voice working from the Mac, unlike a plain `http://<ip>:4173`.

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
server.js              Express API + static host + 5-min Gmail poll (no platform access)
src/db.js              SQLite store: studies, applications, earnings, offers, settings
src/offers.js          Offer parser/scorer (shared by paste + Gmail ingest)
src/gmail.js           Gmail ingest: IMAP app-password or OAuth, your inbox only
src/prep.js            Interview prep question bank
src/cli.js             Local CLI (stats / track / lead)
web/                   Liquid-glass SPA (auto-detects server vs static mode)
web/setup-guide.html   The printable end-to-end setup guide
```

## Why "compliant" is the whole point

The honest economics: research participation is a *nice supplement*, not an
"arbitrage" — roughly $200–600/month for an active generalist, more with
sought-after professional demographics. The bottleneck is never *finding*
studies (the platforms email you matches for free); it's *getting selected*
and *being good once you're in the room*. So StudyFlow automates the only
things you can legitimately automate: **your own inbox, organization,
follow-up discipline, and practice.** Everything that would touch a platform's
servers with a bot has been deliberately left out — and the platforms' own
2025–26 detection systems are exactly why that trade is correct.
