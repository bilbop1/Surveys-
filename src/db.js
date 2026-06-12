/**
 * SQLite data store for tracking studies, applications, and earnings.
 * Uses better-sqlite3 for synchronous, fast local storage.
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

const DB_PATH = process.env.DB_PATH || './data/zarb.db';

let _db = null;

export function getDb() {
  if (_db) return _db;

  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS studies (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      pay_amount REAL,
      pay_currency TEXT DEFAULT 'USD',
      duration_minutes INTEGER,
      study_type TEXT,
      url TEXT,
      requirements TEXT,
      spots_remaining INTEGER,
      discovered_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      raw_data TEXT
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      study_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'applied',
      scheduled_at TEXT,
      completed_at TEXT,
      notes TEXT,
      FOREIGN KEY (study_id) REFERENCES studies(id)
    );

    CREATE TABLE IF NOT EXISTS earnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      study_id TEXT,
      platform TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      duration_minutes INTEGER,
      earned_at TEXT DEFAULT (datetime('now')),
      paid_at TEXT,
      payment_method TEXT,
      notes TEXT,
      FOREIGN KEY (study_id) REFERENCES studies(id)
    );

    CREATE TABLE IF NOT EXISTS platform_profiles (
      platform TEXT PRIMARY KEY,
      email TEXT,
      profile_complete INTEGER DEFAULT 0,
      acceptance_rate REAL DEFAULT 0,
      total_studies INTEGER DEFAULT 0,
      total_earned REAL DEFAULT 0,
      last_check TEXT,
      config TEXT
    );

    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      title TEXT,
      pay_amount REAL,
      duration_minutes INTEGER,
      url TEXT,
      raw TEXT,
      source TEXT DEFAULT 'paste',
      score INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_offers_score ON offers(score DESC);
    CREATE INDEX IF NOT EXISTS idx_studies_platform ON studies(platform);
    CREATE INDEX IF NOT EXISTS idx_studies_discovered ON studies(discovered_at);
    CREATE INDEX IF NOT EXISTS idx_studies_pay ON studies(pay_amount DESC);
    CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
    CREATE INDEX IF NOT EXISTS idx_earnings_date ON earnings(earned_at);
  `);
}

// --- Study Operations ---

export function upsertStudy(study) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO studies (id, platform, title, description, pay_amount, pay_currency,
      duration_minutes, study_type, url, requirements, spots_remaining, raw_data)
    VALUES (@id, @platform, @title, @description, @payAmount, @payCurrency,
      @durationMinutes, @studyType, @url, @requirements, @spotsRemaining, @rawData)
    ON CONFLICT(id) DO UPDATE SET
      pay_amount = @payAmount,
      spots_remaining = @spotsRemaining,
      raw_data = @rawData
  `);
  return stmt.run({
    id: study.id,
    platform: study.platform,
    title: study.title,
    description: study.description || null,
    payAmount: study.payAmount || null,
    payCurrency: study.payCurrency || 'USD',
    durationMinutes: study.durationMinutes || null,
    studyType: study.studyType || null,
    url: study.url || null,
    requirements: study.requirements || null,
    spotsRemaining: study.spotsRemaining || null,
    rawData: study.rawData ? JSON.stringify(study.rawData) : null,
  });
}

export function getNewStudies(sinceMinutes = 60) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM studies
    WHERE discovered_at >= datetime('now', '-' || ? || ' minutes')
    ORDER BY pay_amount DESC
  `).all(sinceMinutes);
}

export function getStudiesByPlatform(platform) {
  const db = getDb();
  return db.prepare(`SELECT * FROM studies WHERE platform = ? ORDER BY discovered_at DESC`).all(platform);
}

export function getHighPayStudies(minPay = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM studies WHERE pay_amount >= ? ORDER BY pay_amount DESC
  `).all(minPay);
}

export function studyExists(studyId) {
  const db = getDb();
  return db.prepare(`SELECT 1 FROM studies WHERE id = ?`).get(studyId) != null;
}

// --- Application Operations ---

export function addApplication(studyId, platform) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO applications (study_id, platform) VALUES (?, ?)
  `).run(studyId, platform);
}

export function updateApplicationStatus(id, status, notes = null) {
  const db = getDb();
  const updates = { status };
  if (status === 'completed') updates.completed_at = new Date().toISOString();
  if (status === 'scheduled') updates.scheduled_at = new Date().toISOString();

  return db.prepare(`
    UPDATE applications SET status = @status,
      completed_at = CASE WHEN @status = 'completed' THEN datetime('now') ELSE completed_at END,
      scheduled_at = CASE WHEN @status = 'scheduled' THEN datetime('now') ELSE scheduled_at END,
      notes = COALESCE(@notes, notes)
    WHERE id = @id
  `).run({ id, status, notes });
}

export function getApplications(status = null) {
  const db = getDb();
  if (status) {
    return db.prepare(`
      SELECT a.*, s.title, s.pay_amount, s.duration_minutes
      FROM applications a LEFT JOIN studies s ON a.study_id = s.id
      WHERE a.status = ? ORDER BY a.applied_at DESC
    `).all(status);
  }
  return db.prepare(`
    SELECT a.*, s.title, s.pay_amount, s.duration_minutes
    FROM applications a LEFT JOIN studies s ON a.study_id = s.id
    ORDER BY a.applied_at DESC
  `).all();
}

// --- Earnings Operations ---

export function addEarning(earning) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO earnings (study_id, platform, amount, currency, duration_minutes, payment_method, notes)
    VALUES (@studyId, @platform, @amount, @currency, @durationMinutes, @paymentMethod, @notes)
  `).run({
    studyId: earning.studyId || null,
    platform: earning.platform,
    amount: earning.amount,
    currency: earning.currency || 'USD',
    durationMinutes: earning.durationMinutes || null,
    paymentMethod: earning.paymentMethod || null,
    notes: earning.notes || null,
  });
}

export function getEarningsStats() {
  const db = getDb();

  const total = db.prepare(`
    SELECT
      COUNT(*) as totalStudies,
      COALESCE(SUM(amount), 0) as totalEarned,
      COALESCE(AVG(amount), 0) as avgPerStudy,
      COALESCE(SUM(duration_minutes), 0) as totalMinutes
    FROM earnings
  `).get();

  const byPlatform = db.prepare(`
    SELECT
      platform,
      COUNT(*) as studies,
      SUM(amount) as earned,
      AVG(amount) as avgPay,
      SUM(duration_minutes) as minutes
    FROM earnings
    GROUP BY platform
    ORDER BY earned DESC
  `).all();

  const monthly = db.prepare(`
    SELECT
      strftime('%Y-%m', earned_at) as month,
      COUNT(*) as studies,
      SUM(amount) as earned,
      SUM(duration_minutes) as minutes
    FROM earnings
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all();

  const hourlyRate = total.totalMinutes > 0
    ? (total.totalEarned / (total.totalMinutes / 60)).toFixed(2)
    : 0;

  return { total: { ...total, hourlyRate }, byPlatform, monthly };
}

// --- Platform Profile Operations ---

export function upsertProfile(platform, data) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO platform_profiles (platform, email, profile_complete, config)
    VALUES (@platform, @email, @profileComplete, @config)
    ON CONFLICT(platform) DO UPDATE SET
      email = COALESCE(@email, email),
      profile_complete = COALESCE(@profileComplete, profile_complete),
      config = COALESCE(@config, config),
      last_check = datetime('now')
  `).run({
    platform,
    email: data.email || null,
    profileComplete: data.profileComplete ? 1 : 0,
    config: data.config ? JSON.stringify(data.config) : null,
  });
}

export function getProfiles() {
  const db = getDb();
  return db.prepare(`SELECT * FROM platform_profiles`).all();
}

// --- Offer Operations ---

export function listOffers() {
  const db = getDb();
  return db.prepare(`SELECT * FROM offers ORDER BY score DESC, created_at DESC`).all();
}

export function insertOffer(o) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO offers (id, platform, title, pay_amount, duration_minutes, url, raw, source, score)
    VALUES (@id, @platform, @title, @payAmount, @durationMinutes, @url, @raw, @source, @score)
    ON CONFLICT(id) DO NOTHING
  `).run({
    id: o.id,
    platform: o.platform || 'unknown',
    title: o.title || 'Untitled offer',
    payAmount: o.pay_amount ?? null,
    durationMinutes: o.duration_minutes ?? null,
    url: o.url || null,
    raw: o.raw || null,
    source: o.source || 'paste',
    score: o.score || 0,
  });
}

export function offerExistsByUrl(url) {
  const db = getDb();
  return db.prepare(`SELECT 1 FROM offers WHERE url = ?`).get(url) != null;
}

export function deleteOffer(id) {
  const db = getDb();
  return db.prepare(`DELETE FROM offers WHERE id = ?`).run(id);
}

export function getOffer(id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM offers WHERE id = ?`).get(id);
}

// --- Settings (key-value JSON) ---

export function getSetting(key, fallback = null) {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export function putSetting(key, value) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(value));
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
