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

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  getDb, upsertStudy, addApplication, updateApplicationStatus,
  getApplications, addEarning, getEarningsStats, getNewStudies,
} from './src/db.js';
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

app.listen(PORT, () => {
  console.log(`\n  StudyFlow running → http://localhost:${PORT}`);
  console.log('  Compliant mode: no platform automation. Your data, your machine.\n');
});
