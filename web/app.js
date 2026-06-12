/* StudyFlow frontend — vanilla JS. Talks only to the local API. */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
// Routes to the client-side store (store.js) — fully static, no backend.
const api = (p, opts) => window.StudyFlowAPI(p, opts);
const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const PLAT_COLOR = { respondent: '#7c8bff', userinterviews: '#5ee6a8', usertesting: '#ffd166', prolific: '#ff7a8a', dscout: '#c779ff' };
const STATUSES = ['invited', 'applied', 'scheduled', 'completed', 'paid'];
const STATUS_LABEL = { invited: 'Invited', applied: 'Applied', scheduled: 'Scheduled', completed: 'Completed', paid: 'Paid' };

let prepData = null, prepCat = 0, practiceQueue = [], practiceIdx = 0;

/* ---------- navigation ---------- */
function showView(name) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.nav-btn[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'pipeline') loadPipeline();
  if (name === 'prep') loadPrep();
  if (name === 'offers') loadOffers();
}
$$('.nav-btn[data-view]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

/* ---------- dashboard ---------- */
async function loadSummary() {
  const s = await api('/api/summary');
  const e = s.earnings || {};
  const thisMonth = (s.monthly && s.monthly[0]) || { earned: 0, studies: 0 };

  $('#statCards').innerHTML = `
    <div class="card glass"><div class="label">Total earned</div>
      <div class="big good">${money(e.totalEarned)}</div>
      <div class="sub">${e.totalStudies || 0} studies · ${(e.totalMinutes/60||0).toFixed(1)} hrs</div></div>
    <div class="card glass"><div class="label">Effective rate</div>
      <div class="big accentText">$${e.hourlyRate || 0}<span style="font-size:18px">/hr</span></div>
      <div class="sub">across all platforms</div></div>
    <div class="card glass"><div class="label">This month</div>
      <div class="big">${money(thisMonth.earned)}</div>
      <div class="sub">${thisMonth.studies || 0} studies completed</div></div>
    <div class="card glass"><div class="label">Pipeline value</div>
      <div class="big">${money(s.pipelineValue)}</div>
      <div class="sub">${s.followups.upcoming} upcoming · ${s.followups.stale} to follow up</div></div>
  `;

  // monthly bars
  const months = (s.monthly || []).slice().reverse();
  const max = Math.max(1, ...months.map((m) => m.earned));
  $('#bars').innerHTML = months.map((m) => `
    <div class="bar-col">
      <span class="v">${money(m.earned)}</span>
      <div class="bar" style="height:${(m.earned / max) * 100}%"></div>
      <span class="m">${m.month.slice(5)}</span>
    </div>`).join('') || '<p class="prep-blurb">No earnings logged yet.</p>';

  // platforms
  $('#platforms').innerHTML = (s.byPlatform || []).map((p) => {
    const rate = p.minutes > 0 ? (p.earned / (p.minutes / 60)).toFixed(0) : '–';
    return `<div class="plat-row">
      <span class="dot" style="background:${PLAT_COLOR[p.platform] || '#999'}"></span>
      <span class="name">${p.platform}</span>
      <span class="rate">$${rate}/hr</span>
      <span class="amt">${money(p.earned)}</span>
    </div>`;
  }).join('') || '<div class="plat-row"><span class="name">No data yet</span></div>';

  return s;
}

/* ---------- pipeline ---------- */
async function loadPipeline() {
  const items = await api('/api/pipeline');
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, []]));
  items.forEach((it) => (byStatus[it.status] || (byStatus[it.status] = [])).push(it));

  $('#kanban').innerHTML = STATUSES.map((st) => `
    <div class="col">
      <div class="col-head">${STATUS_LABEL[st]} <span class="count">${byStatus[st].length}</span></div>
      ${byStatus[st].map((it) => leadCard(it)).join('')}
    </div>`).join('');

  $$('.lead').forEach((el) => el.addEventListener('click', () => advanceLead(el.dataset.id, el.dataset.status, el.dataset.title, el.dataset.pay)));
}

function leadCard(it) {
  const rate = it.pay_amount && it.duration_minutes ? `$${((it.pay_amount / it.duration_minutes) * 60).toFixed(0)}/hr` : '';
  return `<div class="lead" data-id="${it.id}" data-status="${it.status}" data-title="${it.title || ''}" data-pay="${it.pay_amount || 0}">
    <div class="t">${it.title || 'Untitled'}</div>
    <div class="meta">
      <span class="pill pay">${it.pay_amount ? money(it.pay_amount) : '—'}</span>
      <span class="pill plat">${it.platform}</span>
      ${rate ? `<span class="rate">${rate}</span>` : ''}
    </div>
  </div>`;
}

async function advanceLead(id, status, title, pay) {
  const idx = STATUSES.indexOf(status);
  const next = STATUSES[Math.min(idx + 1, STATUSES.length - 1)];
  if (next === status) { toast('Already paid 🎉'); return; }

  if (next === 'paid') {
    // log the earning when moving to paid
    await api('/api/earnings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: $(`[data-id="${id}"]`)?.querySelector('.plat')?.textContent || 'manual', amount: Number(pay) || 0, applicationId: Number(id) }) });
    toast(`Logged ${money(pay)} — nice work 💸`, true);
  } else {
    await api(`/api/applications/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
    toast(`"${title}" → ${STATUS_LABEL[next]}`);
  }
  loadPipeline();
}

/* ---------- offers (compliant finder) ---------- */
const SAMPLE_OFFER = "New project match! 'Fitness app habit interview' pays $120 for a 1 hour session. Apply here: https://app.respondent.io/projects/demo123";

async function checkGmailStatus() {
  // Server mode: ask the Node server. Static mode: ask the Netlify function.
  const serverMode = await window.StudyFlowDetectServer();
  try {
    if (serverMode) {
      const data = await api('/api/gmail/status');
      updateGmailUI({
        connected: data.connected,
        mode: data.mode,
        lastSync: data.lastSync?.at || null,
        lastSyncCount: data.lastSync?.added || 0,
        serverMode: true,
      });
    } else {
      const res = await fetch('/.netlify/functions/gmail-status');
      const data = await res.json();
      updateGmailUI({ ...data, serverMode: false });
    }
  } catch (e) {
    updateGmailUI({ connected: false, serverMode });
  }
}

function updateGmailUI(data) {
  const el = $('#gmailStatus');
  if (!el) return;
  if (data.connected) {
    const syncTime = data.lastSync ? new Date(data.lastSync).toLocaleTimeString() : 'never';
    const modeTag = data.mode === 'imap' ? 'IMAP · polls every 5 min' : data.mode === 'oauth' ? 'OAuth' : '';
    el.innerHTML = `
      <span class="gmail-dot connected"></span>
      <span>Gmail connected</span>
      <span class="gmail-sub">${modeTag ? modeTag + ' · ' : ''}Last sync: ${syncTime}${data.lastSyncCount ? ` (+${data.lastSyncCount})` : ''}</span>
      <button class="btn" id="gmailSync">Sync now</button>
    `;
    $('#gmailSync')?.addEventListener('click', syncGmail);
  } else if (data.serverMode) {
    el.innerHTML = `
      <span class="gmail-dot"></span>
      <span>Auto-ingest from email</span>
      <span class="gmail-sub">Set GMAIL_USER + GMAIL_APP_PASSWORD in .env (see setup guide), or</span>
      <a class="btn primary" href="/api/gmail/auth">Connect via OAuth</a>
    `;
  } else {
    el.innerHTML = `
      <span class="gmail-dot"></span>
      <span>Auto-ingest from email</span>
      <a class="btn primary" href="/.netlify/functions/gmail-auth">Connect Gmail</a>
    `;
  }
}

async function syncGmail() {
  const btn = $('#gmailSync');
  if (btn) { btn.textContent = 'Syncing…'; btn.disabled = true; }
  try {
    if (await window.StudyFlowDetectServer()) {
      // Server inserts straight into SQLite — one call does it all.
      const r = await api('/api/gmail/sync', { method: 'POST' });
      toast(r.added ? `Synced +${r.added} new offer(s) from ${r.scanned} emails` : `Scanned ${r.scanned} emails — nothing new`, !!r.added);
    } else {
      const res = await fetch('/.netlify/functions/gmail-sync');
      const data = await res.json();
      if (data.needsAuth) { toast('Gmail needs re-authorization'); updateGmailUI({ connected: false, serverMode: false }); return; }
      if (data.error) { toast(data.error); return; }
      if (data.offers?.length) {
        for (const o of data.offers) {
          await api('/api/offers/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
        }
        toast(`Synced ${data.offers.length} offers from Gmail`, true);
      } else {
        toast('No new study emails found');
      }
    }
    await loadOffers();
  } catch (e) {
    toast('Sync failed: ' + e.message);
  } finally {
    if (btn) { btn.textContent = 'Sync now'; btn.disabled = false; }
  }
}

async function loadOffers() {
  await checkGmailStatus();
  const offers = await api('/api/offers');
  $('#offerList').innerHTML = offers.length ? offers.map(offerCard).join('')
    : '<p class="prep-blurb">No offers staged. Paste a study-invite email above, or connect Gmail to auto-sync.</p>';
  $$('#offerList .accept').forEach((b) => b.addEventListener('click', () => acceptOffer(b.dataset.id, b.dataset.title)));
  $$('#offerList .dismiss').forEach((b) => b.addEventListener('click', () => dismissOffer(b.dataset.id)));
  loadLocker();
}

function offerCard(o) {
  const hourly = o.pay_amount && o.duration_minutes ? `$${((o.pay_amount / o.duration_minutes) * 60).toFixed(0)}/hr` : '';
  const plat = o.platform === 'unknown' ? 'unknown' : o.platform;
  return `<div class="card glass offer">
    <div class="offer-top">
      <span class="dot" style="background:${PLAT_COLOR[plat] || '#888'}"></span>
      <span class="pill plat">${plat}</span>
      <span class="offer-score" title="value score">${o.score}</span>
    </div>
    <div class="offer-title">${o.title}</div>
    <div class="meta">
      <span class="pill pay">${o.pay_amount ? money(o.pay_amount) : '— pay'}</span>
      <span class="pill">${o.duration_minutes ? o.duration_minutes + ' min' : '— length'}</span>
      ${hourly ? `<span class="rate">${hourly}</span>` : ''}
    </div>
    <div class="btn-row" style="margin-top:14px;justify-content:flex-start">
      ${o.url ? `<a class="btn" href="${o.url}" target="_blank" rel="noopener">Open to apply ↗</a>` : ''}
      <button class="btn primary accept" data-id="${o.id}" data-title="${o.title}">Track as applied</button>
      <button class="btn dismiss" data-id="${o.id}" title="Dismiss">✕</button>
    </div>
  </div>`;
}

async function acceptOffer(id, title) {
  await api(`/api/offers/${id}/accept`, { method: 'POST' });
  toast(`"${title}" → pipeline (Applied)`, true);
  loadOffers();
  loadSummary();
}
async function dismissOffer(id) { await api(`/api/offers/${id}`, { method: 'DELETE' }); loadOffers(); }

async function parseOffer(raw) {
  if (!raw.trim()) { toast('Paste an email or link first'); return; }
  const o = await api('/api/offers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
  $('#offerInput').value = '';
  const got = [o.pay_amount ? money(o.pay_amount) : null, o.duration_minutes ? o.duration_minutes + 'min' : null].filter(Boolean).join(' · ');
  toast(`Parsed ${o.platform}${got ? ' — ' + got : ''}`, true);
  loadOffers();
}
$('#offerParse').addEventListener('click', () => parseOffer($('#offerInput').value));
$('#offerSample').addEventListener('click', () => { $('#offerInput').value = SAMPLE_OFFER; });

/* ---------- application locker ---------- */
const LOCKER_FIELDS = [
  ['name', 'Name', false], ['location', 'Location (city, country)', false],
  ['age', 'Age', false], ['occupation', 'Occupation / title', false],
  ['industry', 'Industry', false], ['companySize', 'Company size', false],
  ['devices', 'Devices / tools you use', true], ['intro', '20-second intro blurb', true],
  ['notes', 'Common screener answers', true],
];
let lockerData = null;

async function loadLocker() {
  lockerData = await api('/api/locker');
  $('#locker').innerHTML = LOCKER_FIELDS.map(([k, label, big]) => `
    <div class="locker-field">
      <label>${label}</label>
      <div class="locker-row">
        ${big ? `<textarea data-k="${k}" rows="2">${lockerData[k] || ''}</textarea>`
              : `<input data-k="${k}" value="${(lockerData[k] || '').replace(/"/g, '&quot;')}" />`}
        <button class="copy" data-k="${k}" title="Copy">⧉</button>
      </div>
    </div>`).join('') + `<div class="btn-row" style="justify-content:flex-end"><button class="btn primary" id="lockerSave">Save locker</button></div>`;

  $$('#locker [data-k]').forEach((el) => { if (el.tagName !== 'BUTTON') el.addEventListener('input', () => (lockerData[el.dataset.k] = el.value)); });
  $$('#locker .copy').forEach((b) => b.addEventListener('click', async () => {
    const v = lockerData[b.dataset.k] || '';
    try { await navigator.clipboard.writeText(v); toast('Copied'); } catch { toast('Copy failed'); }
  }));
  $('#lockerSave').addEventListener('click', async () => {
    await api('/api/locker', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lockerData) });
    toast('Locker saved', true);
  });
}

/* ---------- prep ---------- */
async function loadPrep() {
  if (!prepData) prepData = await api('/api/prep');
  $('#prepTabs').innerHTML = prepData.categories.map((c, i) =>
    `<div class="tab ${i === prepCat ? 'active' : ''}" data-i="${i}">${c.name}</div>`).join('');
  $$('#prepTabs .tab').forEach((t) => t.addEventListener('click', () => { prepCat = +t.dataset.i; renderPrep(); }));
  renderPrep();
}

function renderPrep() {
  const c = prepData.categories[prepCat];
  $$('#prepTabs .tab').forEach((t, i) => t.classList.toggle('active', i === prepCat));
  $('#prepBlurb').textContent = c.blurb;
  $('#prepQuestions').innerHTML = c.questions.map((q) => `
    <div class="q-item glass">
      <div class="qtext">${q}</div>
      <button class="play" data-q="${encodeURIComponent(q)}">▶</button>
    </div>`).join('');
  $$('#prepQuestions .play').forEach((b) => b.addEventListener('click', () => speak(decodeURIComponent(b.dataset.q))));
  $('#prepTips').innerHTML = `<h4>Tips</h4><ul>${c.tips.map((t) => `<li>${t}</li>`).join('')}</ul>`;
}

/* ---------- voice practice loop ---------- */
$('#startPractice').addEventListener('click', () => {
  const c = prepData.categories[prepCat];
  practiceQueue = c.questions.slice();
  practiceIdx = 0;
  $('#practice').style.display = 'block';
  $('#practice').scrollIntoView({ behavior: 'smooth' });
  loadPracticeQ();
});
$('#practiceNext').addEventListener('click', () => { practiceIdx = (practiceIdx + 1) % practiceQueue.length; loadPracticeQ(); });
$('#practiceStart').addEventListener('click', startAnswer);

function loadPracticeQ() {
  $('#practiceQ').textContent = practiceQueue[practiceIdx];
  $('#practiceTranscript').textContent = 'Your spoken answer will appear here…';
  $('#timer').textContent = '0:00';
  speak(practiceQueue[practiceIdx]);
}

let practiceTimer = null, practiceSeconds = 0;
function startAnswer() {
  if (!SR) { toast('Voice not supported in this browser'); return; }
  practiceSeconds = 0;
  $('#timer').textContent = '0:00';
  practiceTimer = setInterval(() => {
    practiceSeconds++;
    const m = Math.floor(practiceSeconds / 60), s = practiceSeconds % 60;
    $('#timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
  }, 1000);

  const rec = makeRecognizer();
  rec.continuous = true; rec.interimResults = true;
  let finalText = '';
  $('#practiceStart').textContent = 'Listening… tap to stop';
  $('#practiceStart').onclick = () => { rec.stop(); };
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t + ' '; else interim += t;
    }
    $('#practiceTranscript').textContent = (finalText + interim) || 'Listening…';
  };
  rec.onend = () => {
    clearInterval(practiceTimer);
    $('#practiceStart').textContent = 'Speak my answer';
    $('#practiceStart').onclick = startAnswer;
    const words = finalText.trim().split(/\s+/).filter(Boolean).length;
    if (words) toast(`${words} words in ${$('#timer').textContent} — good rep ✦`, true);
  };
  rec.start();
}

/* ---------- speech synthesis ---------- */
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02; u.pitch = 1.0;
  speechSynthesis.speak(u);
}

/* ---------- voice command control ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let listening = false;

// Amplitude-reactive orb: drive --amp on the mic button from the live input.
let ampCtx = null, ampStream = null, ampRaf = null;
async function startAmpMeter() {
  try {
    ampStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    ampCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ampCtx.createMediaStreamSource(ampStream);
    const analyser = ampCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
      const rms = Math.sqrt(sum / buf.length);
      $('#mic').style.setProperty('--amp', Math.min(1, rms * 4).toFixed(3));
      ampRaf = requestAnimationFrame(tick);
    };
    tick();
  } catch { /* meter is decorative — recognition still works without it */ }
}
function stopAmpMeter() {
  cancelAnimationFrame(ampRaf);
  ampStream?.getTracks().forEach((t) => t.stop());
  ampCtx?.close().catch(() => {});
  ampCtx = ampStream = null;
  $('#mic').style.removeProperty('--amp');
}

function makeRecognizer() {
  const rec = new SR();
  rec.lang = 'en-US';
  // Chrome 139+: on-device recognition — audio never leaves the machine.
  // Older browsers ignore the property and use their default engine.
  try { rec.processLocally = true; } catch { /* not supported */ }
  return rec;
}

function startVoiceCommand() {
  if (!SR) { toast('Voice commands need Chrome/Edge/Safari'); return; }
  const rec = makeRecognizer();
  rec.interimResults = false; rec.maxAlternatives = 1;
  listening = true;
  $('#mic').classList.add('listening');
  startAmpMeter();
  showVoiceLog('Listening…', '');
  rec.onresult = (e) => {
    const said = e.results[0][0].transcript.toLowerCase();
    showVoiceLog(`"${said}"`, '');
    handleCommand(said);
  };
  rec.onerror = () => toast('Didn\'t catch that');
  rec.onend = () => { listening = false; $('#mic').classList.remove('listening'); stopAmpMeter(); };
  rec.start();
}
$('#mic').addEventListener('click', startVoiceCommand);
$('#micRail').addEventListener('click', startVoiceCommand);
document.addEventListener('keydown', (e) => { if (e.code === 'Space' && e.metaKey) { e.preventDefault(); startVoiceCommand(); } });

async function handleCommand(said) {
  const reply = (txt) => { showVoiceLog(`"${said}"`, txt); speak(txt); };

  if (/dashboard|home|overview|earnings overview/.test(said)) { showView('dashboard'); return reply('Here\'s your dashboard.'); }
  if (/offer|what should i apply|recommend|find.* stud|available/.test(said)) {
    showView('offers');
    const offers = await api('/api/offers');
    if (offers.length) { const top = offers[0]; const hr = top.pay_amount && top.duration_minutes ? `, about ${((top.pay_amount/top.duration_minutes)*60).toFixed(0)} dollars an hour` : ''; return reply(`Top offer: ${top.title} on ${top.platform}, ${top.pay_amount ? money(top.pay_amount) : 'unknown pay'}${hr}.`); }
    return reply('No offers staged yet. Paste a study invite to add one.');
  }
  if (/pipeline|leads|kanban|studies/.test(said)) { showView('pipeline'); return reply('Opening your pipeline.'); }
  if (/prep|practice|interview/.test(said)) { showView('prep'); return reply('Let\'s prep.'); }
  if (/add (a )?lead|new lead|add study/.test(said)) { openModal(); return reply('Add a new lead.'); }

  if (/how much|made|earned|total/.test(said)) {
    const s = await api('/api/summary');
    return reply(`You've earned ${money(s.earnings.totalEarned)} across ${s.earnings.totalStudies} studies, at ${s.earnings.hourlyRate} dollars an hour effective.`);
  }
  if (/what.?s next|upcoming|follow up|followup|to do/.test(said)) {
    const f = await api('/api/followups');
    if (f.upcoming.length) { showView('pipeline'); return reply(`You have ${f.upcoming.length} scheduled. Next: ${f.upcoming[0].title}, paying ${money(f.upcoming[0].pay_amount)}.`); }
    if (f.stale.length) { showView('pipeline'); return reply(`Nothing scheduled, but ${f.stale.length} applications are over three days old — consider following up.`); }
    return reply('You\'re all caught up. Nothing needs attention.');
  }
  if (/start (voice )?practice|practice mode/.test(said)) { showView('prep'); setTimeout(() => $('#startPractice').click(), 400); return reply('Starting voice practice.'); }

  reply('Try: show pipeline, how much have I made, what\'s next, or add a lead.');
}

let voiceLogTimer = null;
function showVoiceLog(heard, said) {
  $('#voiceHeard').textContent = heard;
  $('#voiceSaid').textContent = said;
  $('#voiceLog').classList.add('show');
  clearTimeout(voiceLogTimer);
  voiceLogTimer = setTimeout(() => $('#voiceLog').classList.remove('show'), 5000);
}

/* ---------- add lead modal ---------- */
function openModal() { $('#modalBg').classList.add('open'); $('#f-title').focus(); }
function closeModal() { $('#modalBg').classList.remove('open'); }
$('#fab').addEventListener('click', openModal);
$('#modalCancel').addEventListener('click', closeModal);
$('#modalBg').addEventListener('click', (e) => { if (e.target.id === 'modalBg') closeModal(); });
$('#modalSave').addEventListener('click', async () => {
  const title = $('#f-title').value.trim();
  if (!title) { toast('Give it a title'); return; }
  await api('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title, platform: $('#f-platform').value, status: $('#f-status').value,
      payAmount: $('#f-pay').value || null, durationMinutes: $('#f-dur').value || null,
    }) });
  $('#f-title').value = ''; $('#f-pay').value = ''; $('#f-dur').value = '';
  closeModal();
  toast('Lead added to pipeline', true);
  showView('pipeline');
  loadSummary();
});

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg, good = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (good ? ' good' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 3000);
}

/* ---------- boot ---------- */
(async function boot() {
  const hour = new Date().getHours();
  $('#hello').textContent = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  await loadSummary();
})();
