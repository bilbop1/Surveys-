/**
 * Gmail ingest — reads study-invite emails from YOUR OWN inbox and turns
 * them into offers. This is the compliant automation surface: platforms
 * send these emails to you; we only read what you already received.
 *
 * Two connection modes, picked automatically:
 *
 *  1. IMAP + App Password (recommended, simplest)
 *     .env → GMAIL_USER=you@gmail.com  GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
 *     Requires 2-Step Verification on the Google account, then create an
 *     app password at https://myaccount.google.com/apppasswords
 *
 *  2. Gmail REST API + OAuth (no extra deps, but needs a Google Cloud project)
 *     .env → GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET
 *     Tokens cached in data/gmail-tokens.json after one browser consent.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { detectOffer, detectPlatform } from './offers.js';
import { insertOffer, offerExistsByUrl, putSetting, getSetting } from './db.js';

const TOKEN_PATH = process.env.GMAIL_TOKEN_PATH || './data/gmail-tokens.json';

// Notification senders for the five platforms. Matching is by domain, so
// subdomain senders (e.g. notifications@mail.userinterviews.com) also hit.
export const STUDY_SENDER_DOMAINS = [
  'respondent.io',
  'userinterviews.com',
  'usertesting.com',
  'prolific.com',
  'prolific.co',
  'dscout.com',
];

export function gmailMode() {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'imap';
  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET) return 'oauth';
  return null;
}

export function gmailStatus() {
  const mode = gmailMode();
  const lastSync = getSetting('gmail.lastSync');
  const status = { mode, configured: !!mode, connected: false, lastSync };
  if (mode === 'imap') status.connected = true; // verified on first sync
  if (mode === 'oauth') status.connected = existsSync(TOKEN_PATH);
  return status;
}

/* ---------------- IMAP mode ---------------- */

async function syncViaImap() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, ''),
    },
    logger: false,
  });

  const since = new Date(Date.now() - 7 * 86400000);
  const found = [];

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      for (const domain of STUDY_SENDER_DOMAINS) {
        const uids = await client.search({ from: domain, since });
        if (!uids || !uids.length) continue;
        for await (const msg of client.fetch(uids, { uid: true, source: true })) {
          const parsed = await simpleParser(msg.source);
          found.push({
            id: `gmail-${msg.uid}-${domain}`,
            subject: parsed.subject || '',
            from: parsed.from?.text || domain,
            date: parsed.date?.toISOString() || '',
            text: parsed.text || parsed.html?.replace(/<[^>]+>/g, ' ') || '',
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return found;
}

/* ---------------- OAuth mode (Gmail REST, no deps) ---------------- */

export function oauthUrl(redirectUri) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', process.env.GMAIL_CLIENT_ID);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.readonly');
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  return u.toString();
}

export async function exchangeCode(code, redirectUri) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await res.json();
  if (tokens.error) throw new Error(tokens.error_description || tokens.error);
  saveTokens({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  });
  return tokens;
}

function saveTokens(t) {
  const dir = dirname(TOKEN_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TOKEN_PATH, JSON.stringify(t, null, 2));
}

async function accessToken() {
  if (!existsSync(TOKEN_PATH)) throw new Error('Gmail not authorized yet — visit /api/gmail/auth');
  const t = JSON.parse(readFileSync(TOKEN_PATH, 'utf8'));
  if (t.access_token && t.expires_at > Date.now() + 60000) return t.access_token;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: t.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const next = await res.json();
  if (next.error) throw new Error(`Token refresh failed: ${next.error_description || next.error}`);
  saveTokens({ ...t, access_token: next.access_token, expires_at: Date.now() + next.expires_in * 1000 });
  return next.access_token;
}

async function syncViaRest() {
  const token = await accessToken();
  const fromQ = STUDY_SENDER_DOMAINS.map((d) => `from:${d}`).join(' OR ');
  const q = `(${fromQ}) newer_than:7d`;

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=25`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const list = await listRes.json();
  if (list.error) throw new Error(`Gmail API: ${list.error.message}`);
  if (!list.messages?.length) return [];

  return Promise.all(list.messages.map(async (m) => {
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const msg = await r.json();
    const headers = msg.payload?.headers || [];
    const h = (n) => headers.find((x) => x.name.toLowerCase() === n)?.value || '';
    let text = '';
    (function walk(p) {
      if (!p) return;
      if (p.body?.data) text += Buffer.from(p.body.data, 'base64').toString('utf8');
      (p.parts || []).forEach(walk);
    })(msg.payload);
    return { id: `gmail-${m.id}`, subject: h('subject'), from: h('from'), date: h('date'), text };
  }));
}

/* ---------------- shared sync entry point ---------------- */

export async function syncGmail() {
  const mode = gmailMode();
  if (!mode) throw new Error('Gmail not configured. Set GMAIL_USER + GMAIL_APP_PASSWORD (or OAuth vars) in .env');

  const emails = mode === 'imap' ? await syncViaImap() : await syncViaRest();

  let added = 0;
  for (const e of emails) {
    const offer = detectOffer(`${e.subject}\n${e.text}`, { id: e.id, source: 'gmail' });
    if (offer.platform === 'unknown') offer.platform = detectPlatform(e.from);
    if (offer.platform === 'unknown' && !offer.pay_amount) continue; // not a study invite
    if (offer.url && offerExistsByUrl(offer.url)) continue;
    const res = insertOffer(offer);
    if (res.changes > 0) added++;
  }

  putSetting('gmail.lastSync', { at: new Date().toISOString(), scanned: emails.length, added });
  return { scanned: emails.length, added, mode };
}
