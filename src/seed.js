/**
 * Seed realistic mock data so the dashboard looks alive on first run.
 * Run: npm run seed
 *
 * All data here is fictional — it represents the kind of records YOU would
 * enter as you participate. Nothing is fetched from any platform.
 */

import { getDb, upsertStudy, addApplication, updateApplicationStatus, addEarning, closeDb } from './db.js';

const leads = [
  { platform: 'respondent',     title: 'Fintech dashboard concept test',        pay: 175, dur: 60, type: 'interview', status: 'scheduled', daysAgo: 1 },
  { platform: 'userinterviews', title: 'Mobile banking onboarding study',        pay: 90,  dur: 45, type: 'usability',  status: 'applied',   daysAgo: 5 },
  { platform: 'userinterviews', title: 'Grocery app weekly diary (5 days)',      pay: 120, dur: 30, type: 'diary',      status: 'invited',   daysAgo: 0 },
  { platform: 'respondent',     title: 'Developer tools feedback session',       pay: 200, dur: 60, type: 'interview', status: 'applied',   daysAgo: 4 },
  { platform: 'dscout',         title: 'Smart-home setup video mission',         pay: 75,  dur: 40, type: 'diary',      status: 'completed', daysAgo: 8 },
  { platform: 'prolific',       title: 'Decision-making survey (academic)',      pay: 12,  dur: 25, type: 'survey',     status: 'paid',      daysAgo: 12 },
  { platform: 'usertesting',    title: 'Checkout flow think-aloud',              pay: 15,  dur: 20, type: 'usability',  status: 'paid',      daysAgo: 10 },
  { platform: 'userinterviews', title: 'Healthcare portal interview',           pay: 150, dur: 60, type: 'interview', status: 'completed', daysAgo: 6 },
];

const earnings = [
  { platform: 'dscout',         amount: 75,  dur: 40, daysAgo: 2,  notes: 'Smart-home mission' },
  { platform: 'prolific',       amount: 12,  dur: 25, daysAgo: 11, notes: 'Academic survey' },
  { platform: 'usertesting',    amount: 15,  dur: 20, daysAgo: 9,  notes: 'Checkout test' },
  { platform: 'userinterviews', amount: 150, dur: 60, daysAgo: 5,  notes: 'Healthcare portal' },
  { platform: 'respondent',     amount: 175, dur: 60, daysAgo: 20, notes: 'Earlier interview' },
  { platform: 'userinterviews', amount: 90,  dur: 45, daysAgo: 35, notes: 'Last month study' },
  { platform: 'respondent',     amount: 200, dur: 60, daysAgo: 42, notes: 'Last month interview' },
];

function slug(platform, title, i) {
  return `${platform}-${title.replace(/\s+/g, '-').toLowerCase().slice(0, 40)}-${i}`;
}

function run() {
  const db = getDb();
  // clear for a clean seed
  db.exec('DELETE FROM earnings; DELETE FROM applications; DELETE FROM studies;');

  leads.forEach((l, i) => {
    const id = slug(l.platform, l.title, i);
    upsertStudy({
      id, platform: l.platform, title: l.title,
      payAmount: l.pay, durationMinutes: l.dur, studyType: l.type,
      url: null, description: null,
    });
    const r = addApplication(id, l.platform);
    if (l.status !== 'applied') updateApplicationStatus(r.lastInsertRowid, l.status);
  });

  earnings.forEach((e) => {
    addEarning({ platform: e.platform, amount: e.amount, durationMinutes: e.dur, notes: e.notes });
    // backdate the earning
    const db2 = getDb();
    db2.prepare(`
      UPDATE earnings SET earned_at = datetime('now', '-' || ? || ' days')
      WHERE id = (SELECT MAX(id) FROM earnings)
    `).run(e.daysAgo);
  });

  console.log(`Seeded ${leads.length} pipeline items and ${earnings.length} earnings.`);
  closeDb();
}

run();
