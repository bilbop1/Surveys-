/**
 * MCP Study Agent
 *
 * This module provides prompts and workflows designed to work with
 * Chrome DevTools MCP. When loaded in Claude Code, Antigravity AI IDE,
 * or any MCP-compatible agent, it enables natural-language browser
 * automation for study monitoring.
 *
 * Usage with Claude Code:
 *   Claude can use the chrome-devtools MCP server to directly
 *   navigate to platforms, extract study data, and report findings.
 *
 * Usage with Antigravity AI IDE:
 *   Create a browser subagent with these prompts to autonomously
 *   monitor platforms in the Manager View.
 *
 * Usage with Gemini 3:
 *   Gemini 3 + Computer Use can execute these as autonomous workflows.
 */

export const AGENT_PROMPTS = {
  /**
   * Quick scan: Check a single platform for new studies.
   */
  quickScan: (platform) => `
You are a research study monitor. Your job is to check ${platform} for new paid UX research studies.

STEPS:
1. Navigate to the ${platform} studies page
2. Wait for the page to fully load
3. Extract all visible study listings
4. For each study, capture:
   - Title
   - Pay amount (in USD)
   - Duration (in minutes)
   - Study type (interview, survey, usability, diary)
   - Direct URL/link
5. Calculate the effective hourly rate for each study
6. Rank studies by hourly rate (highest first)
7. Flag any study with hourly rate > $75 as "HIGH PRIORITY"
8. Take a screenshot of the results page

Return the data as a JSON array of study objects.
`,

  /**
   * Full sweep: Check all platforms and compare.
   */
  fullSweep: () => `
You are a research study arbitrage agent. Run a comprehensive sweep of ALL platforms.

PLATFORMS TO CHECK (in order of priority):
1. Respondent.io (https://app.respondent.io/respondent/projects) - HIGHEST PAY
2. User Interviews (https://www.userinterviews.com/studies) - MOST VOLUME
3. Prolific (https://app.prolific.com/studies) - ACADEMIC STUDIES
4. UserTesting (https://app.usertesting.com/my_dashboard) - STEADY FLOW
5. dscout (https://dscout.com/scouts/missions) - DIARY STUDIES

FOR EACH PLATFORM:
1. Navigate to the studies page
2. Extract all available studies with pay, duration, and type
3. Calculate effective hourly rate
4. Take a screenshot

AFTER ALL PLATFORMS:
1. Combine all studies into a single ranked list
2. Sort by effective hourly rate (highest first)
3. Identify the top 5 opportunities
4. Flag any study paying > $100/hr as "UNICORN"

Return a comprehensive report with all findings.
`,

  /**
   * Opportunity alert: Quick check for high-value studies only.
   */
  opportunityAlert: (minHourlyRate = 75) => `
You are hunting for high-value research studies. SPEED IS CRITICAL.

Check these URLs as fast as possible:
- https://app.respondent.io/respondent/projects
- https://www.userinterviews.com/studies

ONLY report studies where the effective hourly rate exceeds $${minHourlyRate}/hr.

For qualifying studies, return:
- Platform
- Title
- Pay amount
- Duration
- Hourly rate
- Direct link

If you find any qualifying studies, prefix the response with "ALERT: HIGH-VALUE STUDY FOUND"
If none found, respond with "No high-value studies at this time."
`,

  /**
   * Application helper: Help fill out a study application.
   */
  applicationHelper: (studyUrl) => `
Navigate to this study: ${studyUrl}

1. Read the study requirements carefully
2. Identify the screener questions
3. Note any demographic requirements
4. Check the pay amount and duration
5. Take a screenshot of the application page

DO NOT submit any application. Just gather and report the requirements
so the user can decide whether to apply.

Return:
- Study title and description
- Pay and duration
- All screener questions listed
- Any demographic requirements
- Whether user likely qualifies based on common demographics
`,

  /**
   * Profile optimizer: Check profile completeness across platforms.
   */
  profileOptimizer: () => `
Check profile completeness across research platforms.

For each platform where credentials are available:
1. Navigate to the profile/settings page
2. Identify incomplete fields
3. Note which fields are most important for getting selected
4. Take a screenshot

Key fields that boost acceptance rates:
- LinkedIn profile linked (Respondent: CRITICAL)
- Complete demographics
- Employment information (industry, company size, title)
- Technical skills/expertise
- Photo/avatar
- Bio/description

Return a checklist of what's missing on each platform.
`,
};

/**
 * Generate a monitoring schedule prompt for multi-agent systems.
 */
export function generateSchedulePrompt(intervalMinutes = 30) {
  return `
You are a study monitoring scheduler. Set up the following monitoring cadence:

Every ${intervalMinutes} minutes:
1. Run a quick scan of Respondent.io and User Interviews (highest value)
2. If new studies found, calculate hourly rates and send notification

Every ${intervalMinutes * 2} minutes:
3. Run a scan of Prolific, UserTesting, and dscout
4. Update the local database with new findings

Every ${intervalMinutes * 4} minutes:
5. Run a full sweep across ALL platforms
6. Generate a summary report
7. Update earnings projections

NOTIFICATION RULES:
- Studies paying > $100/hr: Immediate alert (all channels)
- Studies paying $50-100/hr: Standard notification
- Studies paying $25-50/hr: Batch notification (every 2 hours)
- Studies paying < $25/hr: Log only, no notification
`;
}
