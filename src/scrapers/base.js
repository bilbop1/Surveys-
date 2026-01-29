/**
 * Base scraper class with shared browser automation logic.
 * All platform scrapers extend this.
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';

export class BaseScraper {
  constructor(platformName, options = {}) {
    this.platform = platformName;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.headless = options.headless ?? (process.env.HEADLESS !== 'false');
    this.dataDir = options.dataDir || process.env.BROWSER_DATA_DIR || './data/browser-profile';
    this.screenshotDir = './data/screenshots';
  }

  async launch() {
    if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
    if (!existsSync(this.screenshotDir)) mkdirSync(this.screenshotDir, { recursive: true });

    this.browser = await chromium.launch({
      headless: this.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
    });

    // Remove automation indicators
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    this.page = await this.context.newPage();
    return this.page;
  }

  async screenshot(name) {
    if (!this.page) return;
    const path = `${this.screenshotDir}/${this.platform}-${name}-${Date.now()}.png`;
    await this.page.screenshot({ path, fullPage: false });
    return path;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  async withRetry(fn, maxRetries = 3, delayMs = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt === maxRetries) throw err;
        console.warn(`[${this.platform}] Attempt ${attempt} failed: ${err.message}. Retrying in ${delayMs}ms...`);
        await this.sleep(delayMs * attempt);
      }
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Human-like delays between actions
  async humanDelay(min = 500, max = 2000) {
    const ms = Math.floor(Math.random() * (max - min) + min);
    await this.sleep(ms);
  }

  /**
   * Override in subclasses. Should return an array of study objects:
   * {
   *   id: string,          // unique identifier
   *   platform: string,    // platform name
   *   title: string,       // study title
   *   payAmount: number,   // pay in USD
   *   durationMinutes: number,
   *   studyType: string,   // 'interview', 'survey', 'usability', etc.
   *   url: string,         // direct link
   *   description: string,
   *   requirements: string,
   *   spotsRemaining: number,
   * }
   */
  async scrapeStudies() {
    throw new Error(`${this.platform}: scrapeStudies() not implemented`);
  }
}
