/*
 * StudyFlow client store — a fully client-side data layer.
 *
 * This makes the app deployable as pure static hosting (Netlify, etc.)
 * with NO backend. Your data lives in this browser's localStorage and
 * never leaves your machine — which is exactly the compliance posture
 * the whole project is built around.
 *
 * It exposes window.StudyFlowAPI(path, opts) with the SAME routes the
 * Express server used, so the rest of the app is unchanged.
 */
(function () {
  const KEY = 'studyflow.v1';
  const STATUSES = ['invited', 'applied', 'scheduled', 'completed', 'paid'];

  // ----- interview prep bank (static) -----
  const PREP = {
    categories: [
      { id: 'think-aloud', name: 'Think-Aloud Practice',
        blurb: 'Most usability sessions ask you to narrate your thoughts while using a product. Practice talking continuously without going silent.',
        questions: [
          'Open any app on your phone and narrate every thought out loud for 90 seconds as you complete one task.',
          'Walk through signing up for a new service while explaining what you expect each button to do.',
          'Describe a moment a website confused you recently — what did you expect vs. what happened?',
          'Pick a feature you use daily and explain, step by step, why you trust it.',
        ],
        tips: [
          'Narrate expectations BEFORE you click, then react to what actually happens.',
          'Silence is the enemy — "I\'m looking for..." is better than pausing.',
          'Describe feelings, not just actions: "this makes me hesitant because...".',
        ] },
      { id: 'behavioral', name: 'Behavioral / Context',
        blurb: 'Moderated interviews dig into how you actually live and work. Have concrete stories ready.',
        questions: [
          'Walk me through the last time you bought something online that you researched first.',
          'Describe your typical morning routine with your phone, minute by minute.',
          'Tell me about a tool you stopped using — what made you quit?',
          'How do you decide which app to trust with your payment info?',
        ],
        tips: [
          'Use the STAR shape: Situation, Task, Action, Result.',
          'Specifics beat generalities — names, numbers, last-time-this-happened.',
          'It is fine to say "I don\'t do that" — researchers value honest non-users too.',
        ] },
      { id: 'product-feedback', name: 'Product Feedback',
        blurb: 'Concept tests and feedback sessions want sharp, specific reactions — not politeness.',
        questions: [
          'You\'re shown a new feature. What three questions would you ask before trusting it?',
          'Critique an onboarding flow you remember — what was one thing it got right and one it got wrong?',
          'If you could change one thing about your most-used app, what and why?',
          'How would you explain this product to a skeptical friend?',
        ],
        tips: [
          'Be candidly critical — researchers are paying for honesty, not approval.',
          'Tie every reaction to a reason ("confusing because the label said X").',
          'Rank your reactions: lead with the strongest one.',
        ] },
      { id: 'logistics', name: 'Logistics & Professionalism',
        blurb: 'The fastest way to get re-invited is being effortless to work with.',
        questions: [
          'Confirm: is your webcam working, lighting good, background quiet?',
          'Practice a 20-second self-intro: name, role, why this topic is familiar to you.',
          'Rehearse joining a call 5 minutes early and testing audio.',
        ],
        tips: [
          'Never no-show. If you must cancel, do it 24h+ ahead inside the platform.',
          'Good light + clear mic visibly improves your invite rate over time.',
          'Keep answers tight — researchers have a script and limited time.',
        ] },
    ],
  };

  // ----- seed data (mirrors src/seed.js) -----
  const SEED_LEADS = [
    { platform: 'respondent',     title: 'Fintech dashboard concept test',   pay: 175, dur: 60, type: 'interview', status: 'scheduled', daysAgo: 1 },
    { platform: 'userinterviews', title: 'Mobile banking onboarding study',   pay: 90,  dur: 45, type: 'usability',  status: 'applied',   daysAgo: 5 },
    { platform: 'userinterviews', title: 'Grocery app weekly diary (5 days)', pay: 120, dur: 30, type: 'diary',      status: 'invited',   daysAgo: 0 },
    { platform: 'respondent',     title: 'Developer tools feedback session',  pay: 200, dur: 60, type: 'interview', status: 'applied',   daysAgo: 4 },
    { platform: 'dscout',         title: 'Smart-home setup video mission',    pay: 75,  dur: 40, type: 'diary',      status: 'completed', daysAgo: 8 },
    { platform: 'prolific',       title: 'Decision-making survey (academic)', pay: 12,  dur: 25, type: 'survey',     status: 'paid',      daysAgo: 12 },
    { platform: 'usertesting',    title: 'Checkout flow think-aloud',         pay: 15,  dur: 20, type: 'usability',  status: 'paid',      daysAgo: 10 },
    { platform: 'userinterviews', title: 'Healthcare portal interview',       pay: 150, dur: 60, type: 'interview', status: 'completed', daysAgo: 6 },
  ];
  const SEED_EARN = [
    { platform: 'dscout',         amount: 75,  dur: 40, daysAgo: 2,  notes: 'Smart-home mission' },
    { platform: 'prolific',       amount: 12,  dur: 25, daysAgo: 11, notes: 'Academic survey' },
    { platform: 'usertesting',    amount: 15,  dur: 20, daysAgo: 9,  notes: 'Checkout test' },
    { platform: 'userinterviews', amount: 150, dur: 60, daysAgo: 5,  notes: 'Healthcare portal' },
    { platform: 'respondent',     amount: 175, dur: 60, daysAgo: 20, notes: 'Earlier interview' },
    { platform: 'userinterviews', amount: 90,  dur: 45, daysAgo: 35, notes: 'Last month study' },
    { platform: 'respondent',     amount: 200, dur: 60, daysAgo: 42, notes: 'Last month interview' },
  ];

  // ----- helpers -----
  const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);
  const slug = (s) => s.replace(/\s+/g, '-').toLowerCase().slice(0, 40);
  const tsAgo = (days = 0) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const daysSince = (ts) => (Date.now() - new Date(ts.replace(' ', 'T') + 'Z').getTime()) / 86400000;

  const TIER = { respondent: 50, userinterviews: 50, dscout: 30, usertesting: 30, prolific: 30 };

  function defaultLocker() {
    return { name: '', location: '', age: '', occupation: '', industry: '', companySize: '', devices: '', intro: '', notes: '' };
  }

  // Offers you were SENT (notification emails, community links). Compliant:
  // these come to you — we just parse, rank, and stage them. No crawling.
  const SEED_OFFERS = () => ([
    detectOffer("New project match! 'Crypto wallet onboarding interview' pays $150 for a 45 minute session. Apply: https://app.respondent.io/projects/abc123"),
    detectOffer("You're a match for 'Streaming app feedback' — $75 for 30 min. https://www.userinterviews.com/projects/xyz"),
    detectOffer("A new study is available: 'Memory & attention survey' — $12.00, 25 minutes. https://app.prolific.com/studies/p987"),
  ]);

  function detectPlatform(text) {
    const t = text.toLowerCase();
    if (t.includes('respondent.io') || t.includes('respondent')) return 'respondent';
    if (t.includes('userinterviews')) return 'userinterviews';
    if (t.includes('prolific')) return 'prolific';
    if (t.includes('usertesting')) return 'usertesting';
    if (t.includes('dscout')) return 'dscout';
    return 'unknown';
  }

  // Heuristic parser for a pasted notification email / link blurb.
  function detectOffer(raw) {
    const text = (raw || '').trim();
    const platform = detectPlatform(text);

    // pay: first $ / £ / € amount
    const payM = text.match(/[$£€]\s?(\d+(?:\.\d{1,2})?)/);
    const payAmount = payM ? Math.round(parseFloat(payM[1])) : null;

    // duration: minutes, or hours → minutes
    let durationMinutes = null;
    const hr = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
    const mn = text.match(/(\d+)\s*(?:minutes?|mins?)\b/i);
    if (hr) durationMinutes = Math.round(parseFloat(hr[1]) * 60);
    else if (mn) durationMinutes = parseInt(mn[1]);

    const urlM = text.match(/https?:\/\/[^\s)>'"]+/);
    const url = urlM ? urlM[0] : null;

    // title: a quoted phrase if present, else the email subject, else first line.
    // Prefer double/smart quotes; for single quotes require a leading boundary
    // so contractions like "You're" don't get mistaken for an opening quote.
    let title = null;
    let quoted = text.match(/["“”]([^"“”]{4,80})["“”]/);
    if (!quoted) quoted = text.match(/(?:^|\s)'([^']{4,80})'/);
    if (quoted) title = quoted[1].trim();
    if (!title) { const subj = text.match(/subject:\s*(.+)/i); if (subj) title = subj[1].trim().slice(0, 80); }
    if (!title) title = text.split('\n').map((l) => l.trim()).filter(Boolean)[0]?.slice(0, 80) || 'Untitled offer';

    return { id: 'o' + Math.random().toString(36).slice(2, 9), platform, title, pay_amount: payAmount, duration_minutes: durationMinutes, url, raw: text, created_at: tsAgo(0), score: 0 };
  }

  function scoreOffer(o) {
    let s = 0;
    if (o.pay_amount && o.duration_minutes) s += (o.pay_amount / o.duration_minutes) * 60 * 2;
    if (o.pay_amount) s += o.pay_amount;
    s += TIER[o.platform] || 0;
    if (o.duration_minutes && o.duration_minutes <= 30) s += 20;
    return Math.round(s);
  }

  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
  function save(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
  function blank() { return { studies: [], applications: [], earnings: [], offers: [], locker: null, seq: 1 }; }

  function ensure() {
    let d = load();
    if (d && (d.studies.length || d.earnings.length || d.applications.length)) {
      let changed = false;
      if (!d.offers) { d.offers = []; changed = true; }
      if (!d.locker) { d.locker = defaultLocker(); changed = true; }
      if (changed) save(d);
      return d;
    }
    d = blank();
    SEED_LEADS.forEach((l, i) => {
      const sid = `${l.platform}-${slug(l.title)}-${i}`;
      d.studies.push({ id: sid, platform: l.platform, title: l.title, pay_amount: l.pay, duration_minutes: l.dur, study_type: l.type, url: null });
      d.applications.push({ id: d.seq++, study_id: sid, platform: l.platform, status: l.status,
        applied_at: tsAgo(l.daysAgo), scheduled_at: l.status === 'scheduled' ? tsAgo(l.daysAgo) : null,
        completed_at: l.status === 'completed' ? tsAgo(l.daysAgo) : null, notes: null });
    });
    SEED_EARN.forEach((e) => d.earnings.push({ id: d.seq++, study_id: null, platform: e.platform, amount: e.amount, duration_minutes: e.dur, earned_at: tsAgo(e.daysAgo), notes: e.notes }));
    d.offers = SEED_OFFERS().map((o) => ({ ...o, score: scoreOffer(o) }));
    d.locker = defaultLocker();
    save(d);
    return d;
  }

  // ----- computed views -----
  function summary(d) {
    const e = d.earnings;
    const totalEarned = sum(e.map((x) => x.amount));
    const totalMinutes = sum(e.map((x) => x.duration_minutes || 0));
    const totalStudies = e.length;
    const earnings = {
      totalStudies, totalEarned, totalMinutes,
      avgPerStudy: totalStudies ? totalEarned / totalStudies : 0,
      hourlyRate: totalMinutes > 0 ? (totalEarned / (totalMinutes / 60)).toFixed(2) : '0',
    };

    const pm = {};
    e.forEach((x) => { (pm[x.platform] ||= { platform: x.platform, studies: 0, earned: 0, minutes: 0 }); const r = pm[x.platform]; r.studies++; r.earned += x.amount; r.minutes += x.duration_minutes || 0; });
    const byPlatform = Object.values(pm).map((r) => ({ ...r, avgPay: r.earned / r.studies })).sort((a, b) => b.earned - a.earned);

    const mm = {};
    e.forEach((x) => { const m = x.earned_at.slice(0, 7); (mm[m] ||= { month: m, studies: 0, earned: 0, minutes: 0 }); mm[m].studies++; mm[m].earned += x.amount; mm[m].minutes += x.duration_minutes || 0; });
    const monthly = Object.values(mm).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);

    const counts = {};
    d.applications.forEach((a) => (counts[a.status] = (counts[a.status] || 0) + 1));

    const studyById = Object.fromEntries(d.studies.map((s) => [s.id, s]));
    const pipelineValue = sum(d.applications
      .filter((a) => ['invited', 'applied', 'scheduled'].includes(a.status))
      .map((a) => studyById[a.study_id]?.pay_amount || 0));

    const upcoming = d.applications.filter((a) => a.status === 'scheduled').length;
    const stale = d.applications.filter((a) => a.status === 'applied' && daysSince(a.applied_at) >= 3).length;

    return { earnings, byPlatform, monthly, counts, pipelineValue, followups: { upcoming, stale } };
  }

  function pipeline(d) {
    const studyById = Object.fromEntries(d.studies.map((s) => [s.id, s]));
    return d.applications.map((a) => {
      const s = studyById[a.study_id] || {};
      return { id: a.id, study_id: a.study_id, platform: a.platform, status: a.status, applied_at: a.applied_at,
        scheduled_at: a.scheduled_at, completed_at: a.completed_at, notes: a.notes,
        title: s.title, pay_amount: s.pay_amount, duration_minutes: s.duration_minutes, study_type: s.study_type, url: s.url };
    }).sort((x, y) => (STATUSES.indexOf(x.status) - STATUSES.indexOf(y.status)) || y.applied_at.localeCompare(x.applied_at));
  }

  function followups(d) {
    const studyById = Object.fromEntries(d.studies.map((s) => [s.id, s]));
    const upcoming = d.applications.filter((a) => a.status === 'scheduled')
      .map((a) => ({ id: a.id, platform: a.platform, scheduled_at: a.scheduled_at, title: studyById[a.study_id]?.title, pay_amount: studyById[a.study_id]?.pay_amount }))
      .sort((a, b) => (a.scheduled_at || '').localeCompare(b.scheduled_at || ''));
    const stale = d.applications.filter((a) => a.status === 'applied' && daysSince(a.applied_at) >= 3)
      .map((a) => ({ id: a.id, platform: a.platform, applied_at: a.applied_at, title: studyById[a.study_id]?.title, pay_amount: studyById[a.study_id]?.pay_amount }))
      .sort((a, b) => (b.pay_amount || 0) - (a.pay_amount || 0));
    return { upcoming, stale };
  }

  // ----- mutations -----
  function addLead(b) {
    const d = ensure();
    const id = `${b.platform}-${slug(b.title)}-${Date.now().toString(36)}`;
    d.studies.push({ id, platform: b.platform, title: b.title, pay_amount: b.payAmount != null ? Number(b.payAmount) : null, duration_minutes: b.durationMinutes != null ? Number(b.durationMinutes) : null, study_type: b.studyType || 'interview', url: b.url || null });
    const appId = d.seq++;
    const status = b.status || 'applied';
    d.applications.push({ id: appId, study_id: id, platform: b.platform, status, applied_at: tsAgo(0), scheduled_at: status === 'scheduled' ? tsAgo(0) : null, completed_at: null, notes: b.notes || null });
    save(d);
    return { ok: true, applicationId: appId, studyId: id };
  }

  function setStatus(d, id, status) {
    const a = d.applications.find((x) => x.id === Number(id));
    if (!a) return;
    a.status = status;
    if (status === 'scheduled') a.scheduled_at = tsAgo(0);
    if (status === 'completed') a.completed_at = tsAgo(0);
  }

  function patchApp(id, b) { const d = ensure(); setStatus(d, id, b.status); save(d); return { ok: true }; }

  function addEarning(b) {
    const d = ensure();
    d.earnings.push({ id: d.seq++, study_id: b.studyId || null, platform: b.platform, amount: Number(b.amount), duration_minutes: b.durationMinutes != null ? Number(b.durationMinutes) : null, earned_at: tsAgo(0), notes: b.notes || null });
    if (b.applicationId) setStatus(d, b.applicationId, 'paid');
    save(d);
    return { ok: true };
  }

  // ----- offers (the compliant "finder": ingest + rank what you were sent) -----
  function listOffers(d) { return d.offers.slice().sort((a, b) => b.score - a.score); }

  function addOffer(raw) {
    const d = ensure();
    const o = detectOffer(raw);
    o.score = scoreOffer(o);
    d.offers.unshift(o);
    save(d);
    return o;
  }

  function dismissOffer(id) { const d = ensure(); d.offers = d.offers.filter((o) => o.id !== id); save(d); return { ok: true }; }

  // Accept an offer → it becomes a lead in the pipeline (status: applied).
  function acceptOffer(id) {
    const d = ensure();
    const o = d.offers.find((x) => x.id === id);
    if (!o) return { ok: false };
    d.offers = d.offers.filter((x) => x.id !== id);
    save(d);
    return addLead({ platform: o.platform === 'unknown' ? 'respondent' : o.platform, title: o.title, payAmount: o.pay_amount, durationMinutes: o.duration_minutes, url: o.url, status: 'applied' });
  }

  function getLocker(d) { return d.locker || defaultLocker(); }
  function putLocker(b) { const d = ensure(); d.locker = { ...defaultLocker(), ...b }; save(d); return { ok: true }; }

  // ----- router: mimics the old REST API -----
  window.StudyFlowAPI = async function (path, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : {};
    const d = ensure();

    if (path === '/api/summary') return summary(d);
    if (path === '/api/pipeline') return pipeline(d);
    if (path === '/api/followups') return followups(d);
    if (path === '/api/prep') return PREP;
    if (path === '/api/leads' && method === 'POST') return addLead(body);
    if (path === '/api/earnings' && method === 'POST') return addEarning(body);
    if (path === '/api/offers' && method === 'GET') return listOffers(d);
    if (path === '/api/offers' && method === 'POST') return addOffer(body.raw || '');
    if (path === '/api/locker' && method === 'GET') return getLocker(d);
    if (path === '/api/locker' && method === 'PUT') return putLocker(body);
    const m = path.match(/^\/api\/applications\/(\d+)$/);
    if (m && method === 'PATCH') return patchApp(m[1], body);
    const oa = path.match(/^\/api\/offers\/([^/]+)\/accept$/);
    if (oa && method === 'POST') return acceptOffer(oa[1]);
    const od = path.match(/^\/api\/offers\/([^/]+)$/);
    if (od && method === 'DELETE') return dismissOffer(od[1]);

    throw new Error('Unknown route: ' + method + ' ' + path);
  };

  // convenience: wipe local data (e.g. window.StudyFlowReset())
  window.StudyFlowReset = function () { localStorage.removeItem(KEY); location.reload(); };
})();
