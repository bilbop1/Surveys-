/* StudyFlow frontend — vanilla JS. Talks only to the local API. */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const api = (p, opts) => fetch(p, opts).then((r) => r.json());
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

  const rec = new SR();
  rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
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

function startVoiceCommand() {
  if (!SR) { toast('Voice commands need Chrome/Edge'); return; }
  const rec = new SR();
  rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
  listening = true;
  $('#mic').classList.add('listening');
  showVoiceLog('Listening…', '');
  rec.onresult = (e) => {
    const said = e.results[0][0].transcript.toLowerCase();
    showVoiceLog(`"${said}"`, '');
    handleCommand(said);
  };
  rec.onerror = () => toast('Didn\'t catch that');
  rec.onend = () => { listening = false; $('#mic').classList.remove('listening'); };
  rec.start();
}
$('#mic').addEventListener('click', startVoiceCommand);
$('#micRail').addEventListener('click', startVoiceCommand);
document.addEventListener('keydown', (e) => { if (e.code === 'Space' && e.metaKey) { e.preventDefault(); startVoiceCommand(); } });

async function handleCommand(said) {
  const reply = (txt) => { showVoiceLog(`"${said}"`, txt); speak(txt); };

  if (/dashboard|home|overview|earnings overview/.test(said)) { showView('dashboard'); return reply('Here\'s your dashboard.'); }
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
