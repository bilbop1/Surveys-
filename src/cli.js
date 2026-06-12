#!/usr/bin/env node

/**
 * StudyFlow CLI — compliant companion to the web app.
 *
 * No platform automation. These commands operate ONLY on your local
 * tracker database. Use them when you'd rather type than click.
 *
 *   track   - log an earning, or list your applications
 *   stats   - print your earnings dashboard
 *   lead    - add a study lead to your pipeline
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import {
  addEarning, addApplication, updateApplicationStatus, upsertStudy,
  getApplications, getEarningsStats, closeDb,
} from './db.js';

const program = new Command();
program.name('zarb').description('StudyFlow CLI — your local research tracker').version('2.0.0');

program
  .command('stats')
  .description('View earnings statistics')
  .action(() => {
    const stats = getEarningsStats();
    console.log(chalk.bold('\n  EARNINGS\n'));
    console.log(`    Total Earned:    ${chalk.green.bold('$' + stats.total.totalEarned.toFixed(2))}`);
    console.log(`    Total Studies:   ${stats.total.totalStudies}`);
    console.log(`    Avg Per Study:   $${stats.total.avgPerStudy.toFixed(2)}`);
    console.log(`    Total Hours:     ${(stats.total.totalMinutes / 60).toFixed(1)}`);
    console.log(`    Effective Rate:  ${chalk.yellow.bold('$' + stats.total.hourlyRate + '/hr')}\n`);

    if (stats.byPlatform.length) {
      const t = new Table({ head: ['Platform', 'Studies', 'Earned', 'Avg', '$/hr'], style: { head: ['cyan'] } });
      for (const p of stats.byPlatform) {
        const rate = p.minutes > 0 ? (p.earned / (p.minutes / 60)).toFixed(0) : '–';
        t.push([p.platform, p.studies, `$${p.earned.toFixed(2)}`, `$${p.avgPay.toFixed(2)}`, `$${rate}`]);
      }
      console.log(t.toString() + '\n');
    }
    closeDb();
  });

program
  .command('track')
  .description('Log an earning or list applications')
  .option('-a, --add-earning', 'Log a new earning')
  .option('--platform <name>', 'Platform name')
  .option('--amount <usd>', 'Amount earned in USD')
  .option('--duration <minutes>', 'Duration in minutes')
  .option('--notes <text>', 'Notes')
  .option('-l, --list', 'List applications')
  .option('-s, --status <status>', 'Filter by status')
  .action((opts) => {
    if (opts.addEarning) {
      if (!opts.platform || !opts.amount) { console.log(chalk.red('  --platform and --amount required')); process.exit(1); }
      addEarning({ platform: opts.platform, amount: parseFloat(opts.amount), durationMinutes: opts.duration ? parseInt(opts.duration) : null, notes: opts.notes || null });
      console.log(chalk.green(`\n  Logged $${opts.amount} from ${opts.platform}\n`));
    }
    if (opts.list || opts.status) {
      const apps = getApplications(opts.status || null);
      const t = new Table({ head: ['ID', 'Platform', 'Study', 'Pay', 'Status', 'Applied'], style: { head: ['cyan'] } });
      for (const a of apps.slice(0, 25)) {
        t.push([a.id, a.platform, (a.title || 'N/A').slice(0, 30), a.pay_amount ? `$${a.pay_amount}` : '?', a.status, a.applied_at?.slice(0, 10) || '?']);
      }
      console.log('\n' + t.toString() + '\n');
    }
    closeDb();
  });

program
  .command('lead')
  .description('Add a study lead to your pipeline')
  .requiredOption('--platform <name>', 'Platform name')
  .requiredOption('--title <text>', 'Study title')
  .option('--pay <usd>', 'Pay in USD')
  .option('--duration <minutes>', 'Duration in minutes')
  .option('--status <status>', 'invited | applied | scheduled', 'applied')
  .action((opts) => {
    const id = `${opts.platform}-${opts.title.replace(/\s+/g, '-').toLowerCase().slice(0, 50)}-${Date.now().toString(36)}`;
    upsertStudy({ id, platform: opts.platform, title: opts.title, payAmount: opts.pay ? parseFloat(opts.pay) : null, durationMinutes: opts.duration ? parseInt(opts.duration) : null, studyType: 'interview' });
    const r = addApplication(id, opts.platform);
    if (opts.status !== 'applied') updateApplicationStatus(r.lastInsertRowid, opts.status);
    console.log(chalk.green(`\n  Added "${opts.title}" (${opts.status})\n`));
    closeDb();
  });

program.parse();
