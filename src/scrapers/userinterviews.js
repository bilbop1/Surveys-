/**
 * User Interviews scraper (userinterviews.com)
 *
 * 3,500+ studies/month. Average pays $60+.
 * Professional segments can hit $90-200/hr.
 * Studies browsable at userinterviews.com/studies after signup.
 *
 * Strategy: Monitor frequently. Professional/tech demographics
 * command the highest pay. Apply fast — spots fill quickly.
 */

import { BaseScraper } from './base.js';

const UI_BASE = 'https://www.userinterviews.com';

export class UserInterviewsScraper extends BaseScraper {
  constructor(options = {}) {
    super('userinterviews', options);
    this.email = options.email || process.env.USERINTERVIEWS_EMAIL;
    this.password = options.password || process.env.USERINTERVIEWS_PASSWORD;
  }

  async login() {
    if (!this.email || !this.password) {
      console.warn('[userinterviews] No credentials configured.');
      return false;
    }

    await this.page.goto(`${UI_BASE}/accounts/sign_in`, { waitUntil: 'networkidle' });
    await this.humanDelay();

    await this.page.fill('input[type="email"], input[name*="email"]', this.email);
    await this.humanDelay(300, 700);
    await this.page.fill('input[type="password"], input[name*="password"]', this.password);
    await this.humanDelay(400, 900);

    await this.page.click('button[type="submit"], input[type="submit"]');
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.humanDelay();

    return true;
  }

  async scrapeStudies() {
    const studies = [];

    try {
      await this.launch();
      const loggedIn = await this.login();

      // Navigate to studies listing
      const studiesUrl = loggedIn
        ? `${UI_BASE}/studies`
        : `${UI_BASE}/studies`;

      await this.page.goto(studiesUrl, { waitUntil: 'networkidle' });
      await this.humanDelay(1000, 3000);
      await this.screenshot('studies');

      // Wait for study cards
      await this.page.waitForSelector(
        '[class*="study"], [class*="card"], [class*="project"], [data-testid*="study"]',
        { timeout: 10000 }
      ).catch(() => console.warn('[userinterviews] Could not find study cards'));

      const rawStudies = await this.page.evaluate(() => {
        const results = [];

        const selectors = [
          '[data-testid*="study"]',
          '[class*="StudyCard"]',
          '[class*="study-card"]',
          '[class*="ProjectCard"]',
          'article',
          '.card',
        ];

        let cards = [];
        for (const sel of selectors) {
          cards = document.querySelectorAll(sel);
          if (cards.length > 0) break;
        }

        cards.forEach((card, i) => {
          const title = card.querySelector('h2, h3, h4, [class*="title"]')?.textContent?.trim();
          if (!title) return;

          const text = card.textContent || '';

          // Pay extraction
          const payMatch = text.match(/\$(\d+(?:\.\d{2})?)/);
          const pay = payMatch ? parseFloat(payMatch[1]) : null;

          // Duration extraction
          const durMatch = text.match(/(\d+)\s*(?:min|minute|hr|hour)/i);
          let duration = null;
          if (durMatch) {
            duration = parseInt(durMatch[1]);
            if (text.match(/hr|hour/i) && durMatch) duration *= 60;
          }

          // Study type
          let studyType = 'interview';
          if (text.match(/survey/i)) studyType = 'survey';
          if (text.match(/usability/i)) studyType = 'usability';
          if (text.match(/focus group/i)) studyType = 'focus_group';
          if (text.match(/diary/i)) studyType = 'diary';

          const link = card.querySelector('a')?.href || '';
          const desc = card.querySelector('p, [class*="description"]')?.textContent?.trim() || '';

          results.push({
            index: i,
            title,
            pay,
            duration,
            studyType,
            link,
            description: desc.slice(0, 500),
          });
        });

        return results;
      });

      for (const raw of rawStudies) {
        studies.push({
          id: `ui-${raw.title.replace(/\s+/g, '-').toLowerCase().slice(0, 60)}-${raw.pay || 0}`,
          platform: 'userinterviews',
          title: raw.title,
          description: raw.description,
          payAmount: raw.pay,
          payCurrency: 'USD',
          durationMinutes: raw.duration,
          studyType: raw.studyType,
          url: raw.link || `${UI_BASE}/studies`,
          requirements: null,
          spotsRemaining: null,
          rawData: raw,
        });
      }

      console.log(`[userinterviews] Found ${studies.length} studies`);
    } catch (err) {
      console.error(`[userinterviews] Scrape error: ${err.message}`);
      await this.screenshot('error');
    } finally {
      await this.close();
    }

    return studies;
  }
}
