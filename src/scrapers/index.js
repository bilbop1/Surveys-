/**
 * Scraper registry. Import all platform scrapers and expose
 * a unified interface for the monitor.
 */

import { RespondentScraper } from './respondent.js';
import { UserInterviewsScraper } from './userinterviews.js';
import { UserTestingScraper } from './usertesting.js';
import { ProlificScraper } from './prolific.js';
import { DscoutScraper } from './dscout.js';

export const PLATFORMS = {
  respondent: {
    name: 'Respondent.io',
    Scraper: RespondentScraper,
    tier: 'S',
    avgPay: '$100-750/study',
    payRange: [100, 750],
    bestFor: '1-on-1 interviews, highest pay',
    url: 'https://app.respondent.io',
    tips: [
      'Complete LinkedIn profile = higher acceptance rate',
      'Max 3 applications/day — choose wisely',
      'Tech/finance professionals get 2-3x more invites',
      'Never ghost after acceptance (instant blacklist)',
    ],
  },
  userinterviews: {
    name: 'User Interviews',
    Scraper: UserInterviewsScraper,
    tier: 'S',
    avgPay: '$60-200/study',
    payRange: [60, 200],
    bestFor: 'Volume + variety, fastest growing',
    url: 'https://www.userinterviews.com',
    tips: [
      '3,500+ studies/month = most opportunities',
      'Apply within first hour for best odds',
      'Professional segments (tech, finance, healthcare) pay 2x+',
      'Diary studies = recurring pay over multiple days',
    ],
  },
  usertesting: {
    name: 'UserTesting',
    Scraper: UserTestingScraper,
    tier: 'A',
    avgPay: '$4-60/test',
    payRange: [4, 60],
    bestFor: 'Consistent volume, steady baseline income',
    url: 'https://app.usertesting.com',
    tips: [
      'Standard tests: $10/20min = $30/hr effective',
      'Live conversations pay significantly more',
      'Quality ratings affect future invitations',
      'Keep practice test rating high',
    ],
  },
  prolific: {
    name: 'Prolific',
    Scraper: ProlificScraper,
    tier: 'A',
    avgPay: '$8-15/hr',
    payRange: [8, 15],
    bestFor: 'Academic studies, enforced ethical minimums',
    url: 'https://app.prolific.com',
    tips: [
      'Minimum $8/hr enforced — no garbage pay',
      'Studies fill in seconds — speed is everything',
      'Prolific Assistant browser extension helps',
      'Waitlist-based — apply early',
    ],
  },
  dscout: {
    name: 'dscout',
    Scraper: DscoutScraper,
    tier: 'A',
    avgPay: '$25-200/mission',
    payRange: [25, 200],
    bestFor: 'Diary studies, video feedback, multi-day missions',
    url: 'https://dscout.com',
    tips: [
      'Diary studies = $50-200 over multiple days',
      'Express missions auto-pay on acceptance',
      'Video quality matters — good lighting + clear audio',
      'Mostly US-based missions',
    ],
  },
};

export function getScraper(platformKey, options = {}) {
  const platform = PLATFORMS[platformKey];
  if (!platform) throw new Error(`Unknown platform: ${platformKey}`);
  return new platform.Scraper(options);
}

export function getAllScraperKeys() {
  return Object.keys(PLATFORMS);
}

export function getPlatformInfo(key) {
  return PLATFORMS[key];
}
