# Zoom Arbitrage System — Strategy Guide

## The Economics

Companies spend $100M+ improving products. You get paid $25-750 to talk about them.

```
Company Budget for UX Research: $500K-5M/year
Your Cut Per Session:           $25-750
Sessions Available Per Month:   50-200 across platforms
Realistic Monthly Income:       $1,200-2,500 (8-12 hrs/week)
Annual Potential:                $15,000-30,000
```

## Platform Tier List

### S-Tier (Primary Income)

**Respondent.io** — The Big Fish
- Pay: $100-750/study (advertised avg $100/hr)
- Reality: ~$31/hr effective after search/apply time
- Acceptance rate: ~4% (1 in 25 applications)
- Limit: 3 applications/day
- Key: LinkedIn profile is CRITICAL for acceptance
- Best demographics: Tech professionals, finance, healthcare, product managers

**User Interviews** — Volume King
- Pay: $60-200/study
- 3,500+ studies launching monthly
- Fastest growing platform
- Best for: breadth of study types (interviews, surveys, diary, focus groups)
- Key: Apply within first hour of posting

### A-Tier (Stack These)

**Prolific** — Academic Steady
- Pay: $8-15/hr (minimum $8/hr enforced)
- Studies fill in SECONDS
- Prolific Assistant browser extension is almost mandatory
- Best for: consistent smaller payments while waiting for big fish

**UserTesting** — Baseline Income
- Pay: $4-60/test (standard: $10/20min = $30/hr)
- Steady availability, lower individual pay
- Live conversations pay more
- Best for: filling schedule gaps

**dscout** — Hidden Gem
- Pay: $25-200/mission
- Diary studies = multi-day recurring pay ($50-200)
- Express missions auto-pay on acceptance
- Best for: stacking income alongside interviews

## The Arbitrage System

### Why "Arbitrage"

The inefficiency you're exploiting:
1. Companies NEED real user feedback (willingness to pay: HIGH)
2. Most people don't know these platforms exist (supply of participants: LOW)
3. The middleman platforms take ~20% (Respondent: 5%)
4. You're converting TIME into money at $30-100+/hr rates

### The Daily Playbook

```
MORNING (15 min):
  1. Check Respondent for new projects — apply to top 3
  2. Check User Interviews — apply to anything >$50
  3. Check Prolific — grab any available studies immediately

MIDDAY (10 min):
  4. Check UserTesting dashboard for available tests
  5. Check dscout for new missions
  6. Follow up on any pending applications

EVENING (10 min):
  7. Log completed studies and earnings
  8. Review acceptance rates by platform
  9. Optimize profile if acceptance <5%
```

Total daily time investment: 35 minutes of admin + actual study time

### Automation Edge (This System)

What this codebase automates:

1. **Monitoring** — Scrapers check all 5 platforms on schedule
2. **Alerting** — Instant notifications when high-pay studies appear
3. **Tracking** — SQLite database tracks applications, acceptance rates, earnings
4. **Scoring** — Algorithm ranks studies by effective hourly rate
5. **Analytics** — ROI dashboard shows which platforms/demographics perform best

What you still do manually:
- Screener responses (must be genuine — these filter for specific people)
- The actual study sessions (that's where the money is)
- Profile optimization based on analytics

## Demographic Optimization

### High-Value Demographics (in order)

1. **Tech professionals** (engineers, PMs, designers) — $75-200/hr
2. **Finance/banking** — $75-150/hr
3. **Healthcare professionals** — $75-200/hr
4. **Business decision makers** (directors+) — $100-300/hr
5. **Small business owners** — $50-100/hr
6. **Parents with young children** — $40-75/hr
7. **General consumers** — $25-50/hr

### Profile Optimization Checklist

```
[ ] LinkedIn connected (Respondent: 2x acceptance rate)
[ ] Complete demographics on ALL platforms
[ ] Employment: include company SIZE, industry, title
[ ] List specific software/products you use
[ ] Professional headshot (not selfie)
[ ] Bio mentions specific expertise areas
[ ] PayPal verified and connected
[ ] Timezone set correctly
```

## Using AI Tools

### Chrome DevTools MCP

The `.mcp/config.json` in this repo configures Chrome DevTools MCP to work with Claude Code.

**What it does:**
- Gives Claude direct browser control
- Can navigate to platforms, extract study data, take screenshots
- Enables natural-language commands like "check Respondent for new studies"

**How to use:**
```bash
# In Claude Code with MCP configured:
"Navigate to app.respondent.io/respondent/projects and list all available studies with their pay rates"
```

### Antigravity AI IDE

The `.antigravity/agents.json` configures 5 specialized agents:

| Agent | Model | Job |
|-------|-------|-----|
| Study Scanner | Gemini 3 Pro | Scrapes platforms for new studies |
| Notification Dispatcher | Gemini 3 Flash | Sends alerts across channels |
| Earnings Analyst | Claude Opus 4.5 | Analyzes ROI, generates reports |
| Profile Optimizer | Gemini 3 Pro | Audits profile completeness |
| Application Tracker | Gemini 3 Flash | Tracks application statuses |

**Manager View workflow:**
1. Open Antigravity Manager View
2. Launch the "Daily Arbitrage Routine" workflow
3. All 5 agents coordinate: scan → alert → track → analyze
4. Review artifacts (screenshots, reports, recommendations)

### Gemini 3 + Computer Use

For fully autonomous browser operation:
- Gemini 3 with Computer Use can control the browser end-to-end
- Use the prompts in `src/mcp-study-agent.js` as starting templates
- The `fullSweep` prompt checks all platforms in one pass
- The `opportunityAlert` prompt focuses only on >$75/hr studies

## Common Mistakes

1. **Applying to 5 studies and giving up** — Acceptance rate is ~4%. You need 25+ applications to land 1 study. Volume matters.

2. **Ghosting after acceptance** — Instant blacklist on most platforms. If you can't make it, cancel 24h+ in advance.

3. **Incomplete profiles** — Researchers filter by demographics. Missing fields = invisible to high-paying studies.

4. **Ignoring the hourly rate math** — A $10 UserTesting test taking 20 minutes = $30/hr. A $100 Respondent study taking 3 hours = $33/hr. Calculate effective rate, not just absolute pay.

5. **Only using one platform** — The arbitrage is in stacking: Respondent for big paydays, User Interviews for volume, Prolific for gaps, UserTesting for baseline.

6. **Not logging earnings** — You can't optimize what you don't measure. Use `zarb track` to log every earning.

## Revenue Projections

### Conservative (Beginner)
```
Respondent:       1 study/month  × $100  = $100
User Interviews:  3 studies/month × $65  = $195
UserTesting:      8 tests/month  × $10   = $80
Prolific:         10 studies/month × $8   = $80
dscout:           1 mission/month × $50   = $50
                                   TOTAL = $505/month
```

### Moderate (3-6 months in)
```
Respondent:       2 studies/month  × $150 = $300
User Interviews:  5 studies/month  × $75  = $375
UserTesting:      12 tests/month   × $12  = $144
Prolific:         15 studies/month  × $10 = $150
dscout:           2 missions/month × $75  = $150
                                    TOTAL = $1,119/month
```

### Optimized (1+ year, good demographics)
```
Respondent:       4 studies/month  × $200 = $800
User Interviews:  6 studies/month  × $100 = $600
UserTesting:      15 tests/month   × $15  = $225
Prolific:         20 studies/month  × $12 = $240
dscout:           3 missions/month × $100 = $300
                                    TOTAL = $2,165/month
```

## CLI Quick Reference

```bash
# Setup
cp .env.example .env        # Configure credentials
npm install                  # Install dependencies
npx playwright install       # Install browser

# Monitor
node src/cli.js monitor                        # One-time scan
node src/cli.js monitor --watch                # Continuous monitoring
node src/cli.js monitor -p respondent -m 50    # Respondent only, $50+ min

# View
node src/cli.js recent                   # Last 24h studies
node src/cli.js recent -h 4 -m 75       # Last 4h, $75+ only
node src/cli.js platforms                # Platform rankings + tips
node src/cli.js stats                    # Earnings dashboard

# Track
node src/cli.js track --add-earning --platform respondent --amount 150 --duration 60
node src/cli.js track --list             # View applications
node src/cli.js track -s completed       # View completed studies
```
