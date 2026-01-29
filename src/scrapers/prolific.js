/**
 * Prolific scraper (prolific.com)
 *
 * Academic/scientific research focus.
 * Enforced minimum: $8/hr USD, recommended $12/hr.
 * 200k+ active participants. Waitlist-based.
 * Payment: PayPal, $6 minimum cashout.
 *
 * Strategy: High volume, consistent availability.
 * Studies appear and fill fast — speed is everything.
 * The "assistant" browser extension helps but this
 * scraper gives you programmatic edge.
 */

import { BaseScraper } from './base.js';

const PROLIFIC_BASE = 'https://app.prolific.com';

export class ProlificScraper extends BaseScraper {
  constructor(options = {}) {
    super('prolific', options);
    this.email = options.email || process.env.PROLIFIC_EMAIL;
    this.password = options.password || process.env.PROLIFIC_PASSWORD;
  }

  async login() {
    if (!this.email || !this.password) {
      console.warn('[prolific] No credentials configured.');
      return false;
    }

    await this.page.goto(`${PROLIFIC_BASE}/auth/login`, { waitUntil: 'networkidle' });
    await this.humanDelay();

    await this.page.fill('input[type="email"], input[name="email"]', this.email);
    await this.humanDelay(300, 700);
    await this.page.fill('input[type="password"], input[name="password"]', this.password);
    await this.humanDelay(400, 800);

    await this.page.click('button[type="submit"]');
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
        console.warn('[prolific] Cannot scrape without login.');
        return studies;
      }

      // Prolific studies page
      await this.page.goto(`${PROLIFIC_BASE}/studies`, { waitUntil: 'networkidle' });
      await this.humanDelay(1000, 3000);
      await this.screenshot('studies');

      const rawStudies = await this.page.evaluate(() => {
        const results = [];

        const selectors = [
          '[class*="study"]',
          '[class*="Study"]',
          '[data-testid*="study"]',
          'article',
          '.card',
        ];

        let cards = [];
        for (const sel of selectors) {
          cards = document.querySelectorAll(sel);
          if (cards.length > 0) break;
        }

        cards.forEach((card, i) => {
          const title = card.querySelector('h2, h3, h4, [class*="title"], [class*="name"]')?.textContent?.trim();
          if (!title) return;

          const text = card.textContent || '';

          // Prolific shows pay in GBP and USD
          const payMatch = text.match(/\$(\d+(?:\.\d{2})?)/);
          const pay = payMatch ? parseFloat(payMatch[1]) : null;

          // Duration in minutes
          const durMatch = text.match(/(\d+)\s*(?:min|minute)/i);
          const duration = durMatch ? parseInt(durMatch[1]) : null;

          // Places/spots
          const spotsMatch = text.match(/(\d+)\s*(?:place|spot)/i);
          const spots = spotsMatch ? parseInt(spotsMatch[1]) : null;

          const link = card.querySelector('a')?.href || '';

          results.push({
            index: i,
            title,
            pay,
            duration,
            spots,
            link,
          });
        });

        return results;
      });

      for (const raw of rawStudies) {
        studies.push({
          id: `prolific-${raw.title.replace(/\s+/g, '-').toLowerCase().slice(0, 60)}-${raw.pay || 0}`,
          platform: 'prolific',
          title: raw.title,
          description: null,
          payAmount: raw.pay,
          payCurrency: 'USD',
          durationMinutes: raw.duration,
          studyType: 'academic',
          url: raw.link || `${PROLIFIC_BASE}/studies`,
          requirements: null,
          spotsRemaining: raw.spots,
          rawData: raw,
        });
      }

      console.log(`[prolific] Found ${studies.length} studies`);
    } catch (err) {
      console.error(`[prolific] Scrape error: ${err.message}`);
      await this.screenshot('error');
    } finally {
      await this.close();
    }

    return studies;
  }
}
