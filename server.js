/**
 * StudyFlow server — a COMPLIANT personal control layer.
 *
 * This server does NOT touch any research platform. There is no scraping,
 * no automated login, no headless browser. Everything here is data that
 * YOU (the participant) enter or paste in from the platforms' own
 * notification emails. It is your private dashboard, nothing more.
 *
 * It serves the liquid-glass web app and exposes a small REST API
 * backed by the existing local SQLite store (src/db.js).
 */

import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  getDb, upsertStudy, addApplication, updateApplicationStatus,
  getApplications, addEarning, getEarningsStats, getNewStudies,
  listOffers, insertOffer, deleteOffer, getOffer, offerExistsByUrl,
  getSetting, putSetting,
} from './src/db.js';
import { detectOffer } from './src/offers.js';
import { gmailStatus, gmailMode, syncGmail, oauthUrl, exchangeCode } from './src/gmail.js';
import { PREP_BANK } from './src/prep.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4173;

app.use(express.json());
app.use(express.static(join(__dirname, 'web')));

// --- helpers ---

function slugId(platform, title) {
  return `${platform}-${title.replace(/\s+/g, '-').toLowerCase().slice(0, 50)}-${Date.now().toString(36)}`;
}

function pipeline() {
  const db = getDb();
  return db.prepare(`
    SELECT a.id, a.study_id, a.platform, a.status, a.applied_at,
           a.scheduled_at, a.completed_at, a.notes,
           s.title, s.pay_amount, s.duration_minutes, s.study_type, s.url
    FROM applications a
    LEFT JOIN studies s ON a.study_id = s.id
    ORDER BY
      CASE a.status
        WHEN 'invited' THEN 0 WHEN 'applied' THEN 1 WHEN 'scheduled' THEN 2
        WHEN 'completed' THEN 3 WHEN 'paid' THEN 4 ELSE 5 END,
      a.applied_at DESC
  `).all();
}

function followups() {
  const db = getDb();
  // Things that need YOUR attention: upcoming sessions + stale applications.
  const upcoming = db.prepare(`
    SELECT a.id, a.platform, a.scheduled_at, a.notes, s.title, s.pay_amount
    FROM applications a LEFT JOIN studies s ON a.study_id = s.id
    WHERE a.status = 'scheduled'
    ORDER BY a.scheduled_at ASC
  `).all();

  const stale = db.prepare(`
    SELECT a.id, a.platform, a.applied_at, s.title, s.pay_amount
    FROM applications a LEFT JOIN studies s ON a.study_id = s.id
    WHERE a.status = 'applied'
      AND a.applied_at <= datetime('now', '-3 days')
    ORDER BY s.pay_amount DESC
  `).all();

  return { upcoming, stale };
}

// --- API ---

app.get('/api/summary', (req, res) => {
  const stats = getEarningsStats();
  const fu = followups();
  const pipe = pipeline();
  const counts = pipe.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});
  // projected pipeline value (not yet earned)
  const pipelineValue = pipe
    .filter(p => ['invited', 'applied', 'scheduled'].includes(p.status))
    .reduce((sum, p) => sum + (p.pay_amount || 0), 0);

  res.json({
    earnings: stats.total,
    byPlatform: stats.byPlatform,
    monthly: stats.monthly,
    counts,
    pipelineValue,
    followups: { upcoming: fu.upcoming.length, stale: fu.stale.length },
  });
});

app.get('/api/pipeline', (req, res) => res.json(pipeline()));

app.get('/api/followups', (req, res) => res.json(followups()));

// Add a lead (a study you were invited to or found). Compliant: you enter it.
app.post('/api/leads', (req, res) => {
  const { platform, title, payAmount, durationMinutes, studyType, url, status, notes } = req.body || {};
  if (!platform || !title) return res.status(400).json({ error: 'platform and title required' });

  const id = slugId(platform, title);
  upsertStudy({
    id, platform, title,
    payAmount: payAmount != null ? Number(payAmount) : null,
    durationMinutes: durationMinutes != null ? Number(durationMinutes) : null,
    studyType: studyType || 'interview',
    url: url || null,
    description: notes || null,
  });
  const result = addApplication(id, platform);
  if (status && status !== 'applied') {
    updateApplicationStatus(result.lastInsertRowid, status, notes || null);
  }
  res.json({ ok: true, applicationId: result.lastInsertRowid, studyId: id });
});

app.patch('/api/applications/:id', (req, res) => {
  const { status, notes } = req.body || {};
  if (!status) return res.status(400).json({ error: 'status required' });
  updateApplicationStatus(Number(req.params.id), status, notes || null);
  res.json({ ok: true });
});

// Log an earning. If tied to a completed application, also marks it paid.
app.post('/api/earnings', (req, res) => {
  const { platform, amount, durationMinutes, studyId, applicationId, notes } = req.body || {};
  if (!platform || amount == null) return res.status(400).json({ error: 'platform and amount required' });
  addEarning({
    platform, amount: Number(amount),
    durationMinutes: durationMinutes != null ? Number(durationMinutes) : null,
    studyId: studyId || null, notes: notes || null,
  });
  if (applicationId) updateApplicationStatus(Number(applicationId), 'paid', notes || null);
  res.json({ ok: true });
});

app.get('/api/recent', (req, res) => {
  const hours = Number(req.query.hours || 168);
  res.json(getNewStudies(hours * 60));
});

// Interview prep question bank (static, local).
app.get('/api/prep', (req, res) => res.json(PREP_BANK));

// Frontend probes this to decide server mode vs static localStorage mode.
app.get('/api/health', (req, res) => res.json({ ok: true, mode: 'server' }));

// --- Offers: parse / rank what landed in YOUR inbox ---

app.get('/api/offers', (req, res) => res.json(listOffers()));

app.post('/api/offers', (req, res) => {
  const raw = (req.body?.raw || '').trim();
  if (!raw) return res.status(400).json({ error: 'raw text required' });
  const offer = detectOffer(raw);
  insertOffer(offer);
  res.json(offer);
});

app.post('/api/offers/merge', (req, res) => {
  const o = req.body || {};
  if (o.url && offerExistsByUrl(o.url)) return res.json({ ok: true, skipped: true });
  const offer = detectOffer(o.snippet || o.raw || o.title || '', { id: o.id, source: o.source || 'gmail' });
  if (o.title) offer.title = o.title;
  if (o.pay != null) offer.pay_amount = o.pay;
  if (o.duration != null) offer.duration_minutes = o.duration;
  if (o.url) offer.url = o.url;
  if (o.platform && o.platform !== 'unknown') offer.platform = o.platform;
  const result = insertOffer(offer);
  res.json({ ok: true, added: result.changes > 0, offer });
});

app.delete('/api/offers/:id', (req, res) => { deleteOffer(req.params.id); res.json({ ok: true }); });

// Accept an offer → it becomes a pipeline lead (status: applied).
app.post('/api/offers/:id/accept', (req, res) => {
  const o = getOffer(req.params.id);
  if (!o) return res.status(404).json({ error: 'offer not found' });
  const platform = o.platform === 'unknown' ? 'respondent' : o.platform;
  const id = slugId(platform, o.title || 'untitled');
  upsertStudy({ id, platform, title: o.title, payAmount: o.pay_amount, durationMinutes: o.duration_minutes, url: o.url });
  const result = addApplication(id, platform);
  deleteOffer(o.id);
  res.json({ ok: true, applicationId: result.lastInsertRowid, studyId: id });
});

// --- Application locker: reusable screener answers ---

const LOCKER_DEFAULT = { name: '', location: '', age: '', occupation: '', industry: '', companySize: '', devices: '', intro: '', notes: '' };
app.get('/api/locker', (req, res) => res.json(getSetting('locker', LOCKER_DEFAULT)));
app.put('/api/locker', (req, res) => { putSetting('locker', { ...LOCKER_DEFAULT, ...(req.body || {}) }); res.json({ ok: true }); });

// --- Gmail ingest (reads your own inbox; see src/gmail.js) ---

app.get('/api/gmail/status', (req, res) => res.json(gmailStatus()));

app.get('/api/gmail/auth', (req, res) => {
  if (gmailMode() !== 'oauth') return res.status(400).send('OAuth mode not configured — set GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET in .env (or use the simpler IMAP app-password mode).');
  const redirect = `${req.protocol}://${req.get('host')}/api/gmail/callback`;
  res.redirect(oauthUrl(redirect));
});

app.get('/api/gmail/callback', async (req, res) => {
  try {
    const redirect = `${req.protocol}://${req.get('host')}/api/gmail/callback`;
    await exchangeCode(req.query.code, redirect);
    res.redirect('/?gmail=connected');
  } catch (err) {
    res.status(400).send(`Gmail authorization failed: ${err.message}`);
  }
});

app.post('/api/gmail/sync', async (req, res) => {
  try {
    res.json(await syncGmail());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Background poll: every 5 minutes, if Gmail is configured. Reading your
// own inbox on a schedule is the entire automation surface — nothing here
// ever touches a research platform.
if (gmailMode()) {
  let syncing = false; // overrun guard: never start a poll while one is in flight
  cron.schedule('*/5 * * * *', async () => {
    if (syncing) return;
    syncing = true;
    try {
      const r = await syncGmail();
      if (r.added) console.log(`  [gmail] +${r.added} new offer(s) from ${r.scanned} scanned emails`);
    } catch (err) {
      console.error(`  [gmail] sync failed: ${err.message}`);
    } finally {
      syncing = false;
    }
  });
}

app.listen(PORT, () => {
  console.log(`\n  StudyFlow running → http://localhost:${PORT}`);
  console.log(`  Gmail ingest: ${gmailMode() ? gmailMode() + ' mode, polling every 5 min' : 'not configured (set .env — see .env.example)'}`);
  console.log('  Compliant mode: no platform automation. Your data, your machine.\n');
});
