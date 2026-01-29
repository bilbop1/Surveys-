/**
 * Respondent.io scraper
 *
 * Respondent is the highest-paying platform ($100-750/study).
 * Studies are browsable at app.respondent.io after login.
 * 3 applications per day limit enforced server-side.
 *
 * Strategy: Monitor the projects feed, filter by hourly rate,
 * and get instant notifications for high-value opportunities.
 */

import { BaseScraper } from './base.js';

const RESPONDENT_BASE = 'https://app.respondent.io';

export class RespondentScraper extends BaseScraper {
  constructor(options = {}) {
    super('respondent', options);
    this.email = options.email || process.env.RESPONDENT_EMAIL;
    this.password = options.password || process.env.RESPONDENT_PASSWORD;
  }

  async login() {
    if (!this.email || !this.password) {
      console.warn('[respondent] No credentials configured. Running in anonymous mode.');
      return false;
    }

    await this.page.goto(`${RESPONDENT_BASE}/login`, { waitUntil: 'networkidle' });
    await this.humanDelay();

    // Fill email
    await this.page.fill('input[type="email"], input[name="email"]', this.email);
    await this.humanDelay(300, 800);

    // Fill password
    await this.page.fill('input[type="password"], input[name="password"]', this.password);
    await this.humanDelay(500, 1000);

    // Click login
    await this.page.click('button[type="submit"]');
    await this.page.waitForURL('**/respondent/**', { timeout: 15000 }).catch(() => {});
    await this.humanDelay();

    return true;
  }

  async scrapeStudies() {
    const studies = [];

    try {
      await this.launch();
      const loggedIn = await this.login();

      // Navigate to projects
      const projectsUrl = loggedIn
        ? `${RESPONDENT_BASE}/respondent/projects`
        : 'https://www.respondent.io/research-projects';

      await this.page.goto(projectsUrl, { waitUntil: 'networkidle' });
      await this.humanDelay(1000, 3000);
      await this.screenshot('projects');

      // Wait for project cards to render
      await this.page.waitForSelector(
        '[class*="project"], [class*="card"], [class*="study"], [data-testid*="project"]',
        { timeout: 10000 }
      ).catch(() => console.warn('[respondent] Could not find project cards selector'));

      // Extract study data from the page
      const rawStudies = await this.page.evaluate(() => {
        const results = [];

        // Try multiple possible selectors for project cards
        const selectors = [
          '[data-testid*="project"]',
          '[class*="ProjectCard"]',
          '[class*="project-card"]',
          'article',
          '[class*="card"]',
        ];

        let cards = [];
        for (const sel of selectors) {
          cards = document.querySelectorAll(sel);
          if (cards.length > 0) break;
        }

        cards.forEach((card, i) => {
          const title = card.querySelector('h2, h3, [class*="title"]')?.textContent?.trim();
          if (!title) return;

          // Extract pay amount
          const payText = card.textContent || '';
          const payMatch = payText.match(/\$(\d+(?:\.\d{2})?)/);
          const pay = payMatch ? parseFloat(payMatch[1]) : null;

          // Extract duration
          const durMatch = payText.match(/(\d+)\s*(?:min|minute)/i);
          const duration = durMatch ? parseInt(durMatch[1]) : null;

          // Extract link
          const link = card.querySelector('a')?.href || '';

          // Extract description
          const desc = card.querySelector('p, [class*="description"]')?.textContent?.trim() || '';

          results.push({
            index: i,
            title,
            pay,
            duration,
            link,
            description: desc.slice(0, 500),
            fullText: payText.slice(0, 1000),
          });
        });

        return results;
      });

      // Transform to standard format
      for (const raw of rawStudies) {
        studies.push({
          id: `respondent-${raw.title.replace(/\s+/g, '-').toLowerCase().slice(0, 60)}-${raw.pay || 0}`,
          platform: 'respondent',
          title: raw.title,
          description: raw.description,
          payAmount: raw.pay,
          payCurrency: 'USD',
          durationMinutes: raw.duration,
          studyType: 'interview',
          url: raw.link || `${RESPONDENT_BASE}/respondent/projects`,
          requirements: null,
          spotsRemaining: null,
          rawData: raw,
        });
      }

      console.log(`[respondent] Found ${studies.length} studies`);
    } catch (err) {
      console.error(`[respondent] Scrape error: ${err.message}`);
      await this.screenshot('error');
    } finally {
      await this.close();
    }

    return studies;
  }
}
