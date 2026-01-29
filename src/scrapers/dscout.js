/**
 * dscout scraper (dscout.com)
 *
 * Diary studies, live interviews, video-based feedback.
 * Pay: $25-200/mission. Diary studies $50-200.
 * Payment: PayPal, 7-10 business days.
 *
 * Strategy: Diary studies are the hidden gem. Multi-day
 * missions = recurring pay. Express missions auto-pay
 * on acceptance. Good for stacking income.
 */

import { BaseScraper } from './base.js';

const DSCOUT_BASE = 'https://dscout.com';

export class DscoutScraper extends BaseScraper {
  constructor(options = {}) {
    super('dscout', options);
    this.email = options.email || process.env.DSCOUT_EMAIL;
    this.password = options.password || process.env.DSCOUT_PASSWORD;
  }

  async login() {
    if (!this.email || !this.password) {
      console.warn('[dscout] No credentials configured.');
      return false;
    }

    await this.page.goto(`${DSCOUT_BASE}/login`, { waitUntil: 'networkidle' });
    await this.humanDelay();

    await this.page.fill('input[type="email"], input[name*="email"]', this.email);
    await this.humanDelay(300, 800);
    await this.page.fill('input[type="password"], input[name*="password"]', this.password);
    await this.humanDelay(400, 900);

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
        console.warn('[dscout] Cannot scrape without login.');
        return studies;
      }

      // Navigate to available missions
      await this.page.goto(`${DSCOUT_BASE}/scouts/missions`, { waitUntil: 'networkidle' });
      await this.humanDelay(1000, 3000);
      await this.screenshot('missions');

      const rawStudies = await this.page.evaluate(() => {
        const results = [];

        const selectors = [
          '[class*="mission"]',
          '[class*="Mission"]',
          '[data-testid*="mission"]',
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

          const payMatch = text.match(/\$(\d+(?:\.\d{2})?)/);
          const pay = payMatch ? parseFloat(payMatch[1]) : null;

          const durMatch = text.match(/(\d+)\s*(?:min|minute|day)/i);
          let duration = durMatch ? parseInt(durMatch[1]) : null;
          // Convert days to minutes for diary studies
          if (text.match(/day/i) && durMatch) duration = null; // diary studies don't have fixed duration

          let studyType = 'diary';
          if (text.match(/live|interview/i)) studyType = 'interview';
          if (text.match(/express/i)) studyType = 'express';
          if (text.match(/usability/i)) studyType = 'usability';

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
          id: `dscout-${raw.title.replace(/\s+/g, '-').toLowerCase().slice(0, 60)}-${raw.pay || 0}`,
          platform: 'dscout',
          title: raw.title,
          description: null,
          payAmount: raw.pay,
          payCurrency: 'USD',
          durationMinutes: raw.duration,
          studyType: raw.studyType,
          url: raw.link || `${DSCOUT_BASE}/scouts/missions`,
          requirements: null,
          spotsRemaining: null,
          rawData: raw,
        });
      }

      console.log(`[dscout] Found ${studies.length} studies`);
    } catch (err) {
      console.error(`[dscout] Scrape error: ${err.message}`);
      await this.screenshot('error');
    } finally {
      await this.close();
    }

    return studies;
  }
}
