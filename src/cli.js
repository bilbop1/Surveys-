#!/usr/bin/env node

/**
 * Zoom Arbitrage CLI
 *
 * Commands:
 *   monitor    - Run a monitoring cycle (or continuous with --watch)
 *   track      - Track applications and earnings
 *   stats      - View earnings stats and ROI
 *   platforms  - List all platforms with info and tips
 *   setup      - Interactive setup wizard
 */

import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { runMonitorCycle, scoreStudy, getMonitorSummary } from './monitor.js';
import {
  addEarning, addApplication, updateApplicationStatus,
  getApplications, getEarningsStats, getNewStudies, closeDb,
} from './db.js';
import { PLATFORMS, getAllScraperKeys } from './scrapers/index.js';

const program = new Command();

program
  .name('zarb')
  .description('Zoom Arbitrage System — monitor and optimize paid UX research studies')
  .version('1.0.0');

// ═══════════════════════════════════════════
// MONITOR COMMAND
// ═══════════════════════════════════════════

program
  .command('monitor')
  .description('Run a monitoring cycle across all platforms')
  .option('-p, --platforms <list>', 'Comma-separated platforms to check', '')
  .option('-m, --min-pay <amount>', 'Minimum pay threshold in USD', '0')
  .option('-w, --watch', 'Run continuously on interval')
  .option('-i, --interval <minutes>', 'Check interval in minutes (with --watch)', '30')
  .option('-v, --verbose', 'Verbose output')
  .option('--no-notify', 'Disable notifications')
  .action(async (opts) => {
    const platforms = opts.platforms
      ? opts.platforms.split(',').map(p => p.trim())
      : getAllScraperKeys();

    console.log(chalk.bold('\n  ZOOM ARBITRAGE MONITOR'));
    console.log(chalk.dim(`  Platforms: ${platforms.join(', ')}`));
    console.log(chalk.dim(`  Min pay: $${opts.minPay}`));
    console.log('');

    const run = async () => {
      const startTime = Date.now();
      console.log(chalk.yellow(`[${new Date().toLocaleTimeString()}] Running scan...`));

      const results = await runMonitorCycle({
        platforms,
        minPay: parseFloat(opts.minPay),
        notify: opts.notify,
        verbose: opts.verbose,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (results.newStudies.length > 0) {
        console.log(chalk.green.bold(`\n  ${results.newStudies.length} NEW STUDIES FOUND!\n`));

        const table = new Table({
          head: ['Score', 'Platform', 'Title', 'Pay', 'Duration', '$/hr'],
          colWidths: [7, 16, 40, 8, 10, 8],
          style: { head: ['cyan'] },
        });

        for (const study of results.newStudies.slice(0, 15)) {
          const score = scoreStudy(study);
          const hourly = study.payAmount && study.durationMinutes
            ? `$${((study.payAmount / study.durationMinutes) * 60).toFixed(0)}`
            : '?';

          table.push([
            score,
            study.platform,
            study.title.slice(0, 38),
            study.payAmount ? `$${study.payAmount}` : '?',
            study.durationMinutes ? `${study.durationMinutes}m` : '?',
            hourly,
          ]);
        }

        console.log(table.toString());
      } else {
        console.log(chalk.dim(`  No new studies found (${results.totalScraped} checked)`));
      }

      if (results.errors.length > 0) {
        console.log(chalk.red(`\n  Errors: ${results.errors.join(', ')}`));
      }

      console.log(chalk.dim(`  Completed in ${elapsed}s\n`));
    };

    await run();

    if (opts.watch) {
      const intervalMs = parseInt(opts.interval) * 60 * 1000;
      console.log(chalk.dim(`  Watching every ${opts.interval} minutes. Ctrl+C to stop.\n`));
      setInterval(run, intervalMs);
    } else {
      closeDb();
    }
  });

// ═══════════════════════════════════════════
// STATS COMMAND
// ═══════════════════════════════════════════

program
  .command('stats')
  .description('View earnings statistics and ROI analysis')
  .action(() => {
    const stats = getEarningsStats();
    const summary = getMonitorSummary();

    console.log(chalk.bold('\n  EARNINGS DASHBOARD\n'));

    // Overall stats
    console.log(chalk.cyan('  All-Time:'));
    console.log(`    Total Earned:    ${chalk.green.bold('$' + stats.total.totalEarned.toFixed(2))}`);
    console.log(`    Total Studies:   ${stats.total.totalStudies}`);
    console.log(`    Avg Per Study:   $${stats.total.avgPerStudy.toFixed(2)}`);
    console.log(`    Total Hours:     ${(stats.total.totalMinutes / 60).toFixed(1)}`);
    console.log(`    Effective Rate:  ${chalk.yellow.bold('$' + stats.total.hourlyRate + '/hr')}`);
    console.log('');

    // By platform
    if (stats.byPlatform.length > 0) {
      console.log(chalk.cyan('  By Platform:'));
      const table = new Table({
        head: ['Platform', 'Studies', 'Earned', 'Avg Pay', 'Hours', '$/hr'],
        style: { head: ['cyan'] },
      });

      for (const p of stats.byPlatform) {
        const hours = (p.minutes / 60).toFixed(1);
        const hourly = p.minutes > 0 ? (p.earned / (p.minutes / 60)).toFixed(2) : '?';
        table.push([
          p.platform,
          p.studies,
          `$${p.earned.toFixed(2)}`,
          `$${p.avgPay.toFixed(2)}`,
          hours,
          `$${hourly}`,
        ]);
      }
      console.log(table.toString());
    }

    // Monthly trend
    if (stats.monthly.length > 0) {
      console.log(chalk.cyan('\n  Monthly Trend:'));
      const monthTable = new Table({
        head: ['Month', 'Studies', 'Earned', 'Hours'],
        style: { head: ['cyan'] },
      });

      for (const m of stats.monthly) {
        monthTable.push([
          m.month,
          m.studies,
          `$${m.earned.toFixed(2)}`,
          `${(m.minutes / 60).toFixed(1)}`,
        ]);
      }
      console.log(monthTable.toString());
    }

    // Recent activity
    console.log(chalk.cyan('\n  Last 24 Hours:'));
    console.log(`    New Studies Found: ${summary.last24h.newStudies}`);
    console.log(`    High Pay (>$50):   ${summary.last24h.highPay}`);
    console.log(`    Avg Pay:           $${summary.last24h.avgPay}`);
    console.log('');

    closeDb();
  });

// ═══════════════════════════════════════════
// TRACK COMMAND
// ═══════════════════════════════════════════

program
  .command('track')
  .description('Track applications and log earnings')
  .option('-a, --add-earning', 'Log a new earning')
  .option('--platform <name>', 'Platform name')
  .option('--amount <usd>', 'Amount earned in USD')
  .option('--duration <minutes>', 'Study duration in minutes')
  .option('--notes <text>', 'Notes about the study')
  .option('-l, --list', 'List recent applications')
  .option('-s, --status <status>', 'Filter by status (applied, scheduled, completed, rejected)')
  .action((opts) => {
    if (opts.addEarning) {
      if (!opts.platform || !opts.amount) {
        console.log(chalk.red('  --platform and --amount are required'));
        process.exit(1);
      }

      addEarning({
        platform: opts.platform,
        amount: parseFloat(opts.amount),
        durationMinutes: opts.duration ? parseInt(opts.duration) : null,
        notes: opts.notes || null,
      });

      const hourly = opts.duration
        ? `$${((parseFloat(opts.amount) / parseInt(opts.duration)) * 60).toFixed(0)}/hr`
        : '';

      console.log(chalk.green(`\n  Logged $${opts.amount} from ${opts.platform} ${hourly}\n`));
    }

    if (opts.list || opts.status) {
      const apps = getApplications(opts.status || null);

      if (apps.length === 0) {
        console.log(chalk.dim('\n  No applications found.\n'));
      } else {
        const table = new Table({
          head: ['ID', 'Platform', 'Study', 'Pay', 'Status', 'Applied'],
          style: { head: ['cyan'] },
        });

        for (const app of apps.slice(0, 20)) {
          table.push([
            app.id,
            app.platform,
            (app.title || 'N/A').slice(0, 30),
            app.pay_amount ? `$${app.pay_amount}` : '?',
            app.status,
            app.applied_at?.slice(0, 10) || '?',
          ]);
        }

        console.log('\n' + table.toString() + '\n');
      }
    }

    closeDb();
  });

// ═══════════════════════════════════════════
// PLATFORMS COMMAND
// ═══════════════════════════════════════════

program
  .command('platforms')
  .description('List all platforms with tier rankings, pay ranges, and tips')
  .action(() => {
    console.log(chalk.bold('\n  PLATFORM RANKINGS\n'));

    const tierColors = {
      S: chalk.yellow.bold,
      A: chalk.green.bold,
      B: chalk.blue.bold,
    };

    for (const [key, info] of Object.entries(PLATFORMS)) {
      const tierFn = tierColors[info.tier] || chalk.white;

      console.log(`  ${tierFn(`[${info.tier}]`)} ${chalk.bold(info.name)}`);
      console.log(chalk.dim(`      ${info.url}`));
      console.log(`      Pay: ${chalk.green(info.avgPay)}`);
      console.log(`      Best for: ${info.bestFor}`);
      console.log(chalk.cyan('      Tips:'));
      for (const tip of info.tips) {
        console.log(`        - ${tip}`);
      }
      console.log('');
    }

    // Strategy summary
    console.log(chalk.bold('  OPTIMAL STRATEGY:\n'));
    console.log('    1. PRIMARY: Respondent + User Interviews (highest pay)');
    console.log('    2. BASELINE: UserTesting (consistent volume)');
    console.log('    3. STACK: Prolific + dscout (fill gaps)');
    console.log('    4. Apply to 10-15 studies/day across platforms');
    console.log('    5. Never ghost after acceptance');
    console.log('    6. Keep all profiles 100% complete');
    console.log(`    7. Target: ${chalk.green.bold('$1,200-2,500/month')} at 8-12 hrs/week\n`);
  });

// ═══════════════════════════════════════════
// RECENT COMMAND
// ═══════════════════════════════════════════

program
  .command('recent')
  .description('Show recently discovered studies')
  .option('-h, --hours <n>', 'Hours to look back', '24')
  .option('-m, --min-pay <amount>', 'Minimum pay filter', '0')
  .action((opts) => {
    const minutes = parseInt(opts.hours) * 60;
    let studies = getNewStudies(minutes);

    const minPay = parseFloat(opts.minPay);
    if (minPay > 0) {
      studies = studies.filter(s => s.pay_amount >= minPay);
    }

    if (studies.length === 0) {
      console.log(chalk.dim(`\n  No studies found in the last ${opts.hours} hours.\n`));
    } else {
      console.log(chalk.bold(`\n  STUDIES (last ${opts.hours}h)\n`));

      const table = new Table({
        head: ['Platform', 'Title', 'Pay', 'Duration', '$/hr', 'URL'],
        colWidths: [15, 35, 8, 10, 8, 40],
        style: { head: ['cyan'] },
      });

      for (const s of studies) {
        const hourly = s.pay_amount && s.duration_minutes
          ? `$${((s.pay_amount / s.duration_minutes) * 60).toFixed(0)}`
          : '?';

        table.push([
          s.platform,
          s.title.slice(0, 33),
          s.pay_amount ? `$${s.pay_amount}` : '?',
          s.duration_minutes ? `${s.duration_minutes}m` : '?',
          hourly,
          (s.url || '').slice(0, 38),
        ]);
      }

      console.log(table.toString() + '\n');
    }

    closeDb();
  });

program.parse();
