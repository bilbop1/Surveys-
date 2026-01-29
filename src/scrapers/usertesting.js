/**
 * UserTesting.com scraper
 *
 * Most established platform. Steady flow of tests.
 * Standard tests: $10/20min ($30/hr effective)
 * Live conversations: higher pay
 * Payment: PayPal, 14-day cycle
 *
 * Strategy: Volume play. Lower pay but high availability.
 * Good for consistent baseline income while hunting
 * bigger fish on Respondent/User Interviews.
 */

import { BaseScraper } from './base.js';

const UT_BASE = 'https://app.usertesting.com';

export class UserTestingScraper extends BaseScraper {
  constructor(options = {}) {
    super('usertesting', options);
    this.email = options.email || process.env.USERTESTING_EMAIL;
    this.password = options.password || process.env.USERTESTING_PASSWORD;
  }

  async login() {
    if (!this.email || !this.password) {
      console.warn('[usertesting] No credentials configured.');
      return false;
    }

    await this.page.goto(`${UT_BASE}/users/sign_in`, { waitUntil: 'networkidle' });
    await this.humanDelay();

    await this.page.fill('input[type="email"], input#email', this.email);
    await this.humanDelay(300, 800);
    await this.page.fill('input[type="password"], input#password', this.password);
    await this.humanDelay(400, 900);

    await this.page.click('button[type="submit"], input[type="submit"]');
    await this.page.waitForLoadState('networkidle').catch(() => {});
    await this.humanDelay(1500, 3000);

    return true;
  }

  async scrapeStudies() {
    const studies = [];

    try {
      await this.launch();
      const loggedIn = await this.login();

      if (!loggedIn) {
        console.warn('[usertesting] Cannot scrape without login.');
        return studies;
      }

      // Navigate to dashboard / available tests
      await this.page.goto(`${UT_BASE}/my_dashboard`, { waitUntil: 'networkidle' });
      await this.humanDelay(1000, 3000);
      await this.screenshot('dashboard');

      // UserTesting uses a dashboard model — tests appear as available
      const rawStudies = await this.page.evaluate(() => {
        const results = [];

        const selectors = [
          '[class*="test-card"]',
          '[class*="TestCard"]',
          '[data-testid*="test"]',
          '[class*="available"]',
          '.card',
          'article',
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

          const payMatch = text.match(/\$(\d+(?:\.\d{2})?)/);
          const pay = payMatch ? parseFloat(payMatch[1]) : null;

          const durMatch = text.match(/(\d+)\s*(?:min|minute)/i);
          const duration = durMatch ? parseInt(durMatch[1]) : null;

          let studyType = 'usability';
          if (text.match(/live|conversation/i)) studyType = 'live_conversation';
          if (text.match(/survey/i)) studyType = 'survey';

          const link = card.querySelector('a')?.href || '';

          results.push({
            index: i,
            title,
            pay,
            duration,
            studyType,
            link,
          });
        });

        return results;
      });

      for (const raw of rawStudies) {
        studies.push({
          id: `ut-${raw.title.replace(/\s+/g, '-').toLowerCase().slice(0, 60)}-${raw.pay || 0}`,
          platform: 'usertesting',
          title: raw.title,
          description: null,
          payAmount: raw.pay,
          payCurrency: 'USD',
          durationMinutes: raw.duration,
          studyType: raw.studyType,
          url: raw.link || `${UT_BASE}/my_dashboard`,
          requirements: null,
          spotsRemaining: null,
          rawData: raw,
        });
      }

      console.log(`[usertesting] Found ${studies.length} studies`);
    } catch (err) {
      console.error(`[usertesting] Scrape error: ${err.message}`);
      await this.screenshot('error');
    } finally {
      await this.close();
    }

    return studies;
  }
}
