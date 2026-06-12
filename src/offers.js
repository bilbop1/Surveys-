/**
 * Offer parsing & scoring — shared by the API (pasted emails) and the
 * Gmail sync worker. Heuristics only; everything parsed here arrived
 * in an email the platforms sent TO the participant.
 */

import { randomBytes } from 'crypto';

const TIER = { respondent: 50, userinterviews: 50, dscout: 30, usertesting: 30, prolific: 30 };

export function detectPlatform(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('respondent.io') || t.includes('respondent')) return 'respondent';
  if (t.includes('userinterviews')) return 'userinterviews';
  if (t.includes('prolific')) return 'prolific';
  if (t.includes('usertesting')) return 'usertesting';
  if (t.includes('dscout')) return 'dscout';
  return 'unknown';
}

export function detectOffer(raw, { id, source } = {}) {
  const text = (raw || '').trim();
  const platform = detectPlatform(text);

  const payM = text.match(/[$£€]\s?(\d+(?:\.\d{1,2})?)/);
  const payAmount = payM ? Math.round(parseFloat(payM[1])) : null;

  let durationMinutes = null;
  const hr = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  const mn = text.match(/(\d+)\s*(?:minutes?|mins?)\b/i);
  if (hr) durationMinutes = Math.round(parseFloat(hr[1]) * 60);
  else if (mn) durationMinutes = parseInt(mn[1]);

  const urlM = text.match(/https?:\/\/[^\s)>'"]+/);
  const url = urlM ? urlM[0].replace(/[.,;:!?]+$/, '') : null;

  // Title: quoted phrase preferred; single quotes need a leading boundary
  // so contractions ("You're") aren't mistaken for an opening quote.
  let title = null;
  let quoted = text.match(/["“”]([^"“”]{4,80})["“”]/);
  if (!quoted) quoted = text.match(/(?:^|\s)'([^']{4,80})'/);
  if (quoted) title = quoted[1].trim();
  if (!title) { const subj = text.match(/subject:\s*(.+)/i); if (subj) title = subj[1].trim().slice(0, 80); }
  if (!title) title = text.split('\n').map((l) => l.trim()).filter(Boolean)[0]?.slice(0, 80) || 'Untitled offer';

  const offer = {
    id: id || 'o' + randomBytes(5).toString('hex'),
    platform, title,
    pay_amount: payAmount,
    duration_minutes: durationMinutes,
    url, raw: text,
    source: source || 'paste',
  };
  offer.score = scoreOffer(offer);
  return offer;
}

export function scoreOffer(o) {
  let s = 0;
  if (o.pay_amount && o.duration_minutes) s += (o.pay_amount / o.duration_minutes) * 60 * 2;
  if (o.pay_amount) s += o.pay_amount;
  s += TIER[o.platform] || 0;
  if (o.duration_minutes && o.duration_minutes <= 30) s += 20;
  return Math.round(s);
}
