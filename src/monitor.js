/**
 * Core monitoring engine.
 * Runs scrapers, diffs against known studies, triggers notifications.
 */

import { getScraper, getAllScraperKeys, PLATFORMS } from './scrapers/index.js';
import { upsertStudy, studyExists, getNewStudies, getEarningsStats } from './db.js';
import { notifyAll } from './notify.js';

/**
 * Run a single monitoring cycle across all (or specified) platforms.
 * Returns { newStudies, totalScraped, errors }
 */
export async function runMonitorCycle(options = {}) {
  const {
    platforms = getAllScraperKeys(),
    minPay = parseFloat(process.env.MIN_PAY_THRESHOLD || '0'),
    maxDuration = parseInt(process.env.MAX_DURATION_MINUTES || '9999'),
    notify = true,
    verbose = false,
  } = options;

  const results = {
    newStudies: [],
    totalScraped: 0,
    errors: [],
    byPlatform: {},
  };

  for (const platformKey of platforms) {
    if (!PLATFORMS[platformKey]) {
      results.errors.push(`Unknown platform: ${platformKey}`);
      continue;
    }

    const platformResult = { scraped: 0, new: 0, errors: [] };

    try {
      if (verbose) console.log(`[monitor] Scraping ${platformKey}...`);

      const scraper = getScraper(platformKey);
      const studies = await scraper.scrapeStudies();
      platformResult.scraped = studies.length;
      results.totalScraped += studies.length;

      for (const study of studies) {
        // Apply filters
        if (minPay > 0 && study.payAmount && study.payAmount < minPay) continue;
        if (maxDuration < 9999 && study.durationMinutes && study.durationMinutes > maxDuration) continue;

        // Check if this is a new study
        const isNew = !studyExists(study.id);

        // Upsert into database
        upsertStudy(study);

        if (isNew) {
          results.newStudies.push(study);
          platformResult.new++;

          if (verbose) {
            const payStr = study.payAmount ? `$${study.payAmount}` : '?';
            const durStr = study.durationMinutes ? `${study.durationMinutes}min` : '?';
            console.log(`  NEW: ${study.title} (${payStr}, ${durStr})`);
          }
        }
      }
    } catch (err) {
      const msg = `[${platformKey}] ${err.message}`;
      results.errors.push(msg);
      platformResult.errors.push(msg);
      if (verbose) console.error(msg);
    }

    results.byPlatform[platformKey] = platformResult;
  }

  // Sort new studies by pay (highest first)
  results.newStudies.sort((a, b) => (b.payAmount || 0) - (a.payAmount || 0));

  // Send notifications for new studies
  if (notify && results.newStudies.length > 0) {
    try {
      // Convert to DB format for notification
      const dbFormat = results.newStudies.map(s => ({
        platform: s.platform,
        title: s.title,
        pay_amount: s.payAmount,
        duration_minutes: s.durationMinutes,
        url: s.url,
        description: s.description,
      }));
      await notifyAll(dbFormat);
    } catch (err) {
      results.errors.push(`Notification error: ${err.message}`);
    }
  }

  return results;
}

/**
 * Calculate effective hourly rate for a study.
 */
export function calcHourlyRate(payAmount, durationMinutes) {
  if (!payAmount || !durationMinutes || durationMinutes === 0) return null;
  return (payAmount / durationMinutes) * 60;
}

/**
 * Score a study for priority ranking.
 * Higher score = better opportunity.
 */
export function scoreStudy(study) {
  let score = 0;

  // Base: hourly rate (most important factor)
  const hourly = calcHourlyRate(study.payAmount, study.durationMinutes);
  if (hourly) {
    score += hourly * 2; // $100/hr = 200 points
  }

  // Absolute pay matters too
  if (study.payAmount) {
    score += study.payAmount; // $100 = 100 points
  }

  // Platform tier bonus
  const platformInfo = PLATFORMS[study.platform];
  if (platformInfo) {
    const tierBonus = { S: 50, A: 30, B: 10 };
    score += tierBonus[platformInfo.tier] || 0;
  }

  // Shorter studies preferred (less time risk)
  if (study.durationMinutes && study.durationMinutes <= 30) {
    score += 20;
  }

  // Interview type pays more consistently
  if (study.studyType === 'interview') score += 15;
  if (study.studyType === 'live_conversation') score += 10;

  return Math.round(score);
}

/**
 * Get a summary of monitoring status.
 */
export function getMonitorSummary() {
  const recentStudies = getNewStudies(60 * 24); // last 24 hours
  const stats = getEarningsStats();

  return {
    last24h: {
      newStudies: recentStudies.length,
      highPay: recentStudies.filter(s => s.pay_amount >= 50).length,
      avgPay: recentStudies.length > 0
        ? (recentStudies.reduce((sum, s) => sum + (s.pay_amount || 0), 0) / recentStudies.length).toFixed(2)
        : 0,
    },
    allTime: stats.total,
    byPlatform: stats.byPlatform,
    monthlyTrend: stats.monthly,
  };
}
