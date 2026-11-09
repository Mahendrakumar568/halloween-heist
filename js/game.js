/* Operation: Best Human — a Halloween Heist detective game */
(() => {
'use strict';

/* =========================================================
   Basics
   ========================================================= */
const $ = id => document.getElementById(id);
const Audio = window.HeistAudio;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ABORT = Symbol('abort');
const MIDNIGHT = Symbol('midnight');
const DEADLINE = 60;           // minutes from 11:00 PM to midnight
const SAVE_KEY = 'obh_save_v1', SET_KEY = 'obh_settings_v1', ACH_KEY = 'obh_achievements_v1';
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage is optional */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

const stage = $('stage');
let RUN = 0;            // bumps on every new run so stale scripts stop
let S = null;           // current game state
let busy = false;       // a script is running (hotspots disabled)
let roamCtx = null;     // free-roam context {done, resolve}
let advanceResolve = null, typing = null, choiceResolve = null;
let modalCtx = null;

const settings = Object.assign({ music: 0.55, sfx: 0.8, speed: 'normal', reduce: false }, store.get(SET_KEY, {}));
const achieved = store.get(ACH_KEY, {});
const SPEEDS = { slow: 42, normal: 22, fast: 9, instant: 0 };
function applySettings() {
  Audio.setVolume('music', settings.music);
  Audio.setVolume('sfx', settings.sfx);
  document.body.classList.toggle('reduce-motion', !!settings.reduce);
  store.set(SET_KEY, settings);
}

/* =========================================================
   Data: cast, scenes, evidence, achievements
   ========================================================= */
const CAST = {
  amy:       { name: 'Amy Santiago',   pitch: 560, faces: ['neutral', 'happy', 'excited', 'determined', 'skeptical', 'annoyed', 'surprised'] },
  holt:      { name: 'Captain Holt',   pitch: 150, faces: ['neutral', 'serious', 'disapproving', 'amused', 'eyebrow', 'surprised', 'annoyed', 'deadpan'] },
  boyle:     { name: 'Charles Boyle',  pitch: 430, faces: ['neutral', 'happy', 'excited', 'proud', 'awkward', 'confused', 'worried', 'shocked', 'loving'] },
  gina:      { name: 'Gina Linetti',   pitch: 500, faces: ['neutral', 'happy', 'sarcastic', 'confident', 'judging', 'shocked', 'annoyed', 'playful'] },
  rosa:      { name: 'Rosa Diaz',      pitch: 300, faces: ['neutral', 'serious', 'annoyed', 'skeptical', 'angry', 'intimidating', 'sarcastic', 'smile'] },
  terry:     { name: 'Terry Jeffords', pitch: 190, faces: ['neutral', 'happy', 'laughing', 'supportive', 'proud', 'concerned', 'serious', 'surprised', 'determined'] },
  hitchcock: { name: 'Hitchcock',      pitch: 230, faces: ['neutral', 'smug', 'laughing', 'suspicious', 'tired', 'thinking', 'surprised', 'annoyed', 'unbothered'] },
  scully:    { name: 'Scully',         pitch: 260, faces: ['neutral', 'happy', 'excited', 'confused', 'concerned', 'proud', 'surprised', 'thoughtful', 'content'] },
  jake:      { name: 'Jake Peralta',   pitch: 380, faces: ['neutral'] },
};
const portrait = (who, face) => who === 'jake' ? 'Images/Portraits/jake-neutral.webp'
  : `Images/Portraits/${who}-${CAST[who].faces.includes(face) ? face : 'neutral'}.webp`;

const IMG = n => `Images/web/${n}.webp`;
const SCENES = {
  podium:        { img: 'podium',        name: 'Briefing Room' },
  reveal:        { img: 'reveal',        name: 'Bullpen' },
  smoke:         { img: 'smoke',         name: 'Bullpen' },
  empty:         { img: 'empty',         name: 'Bullpen' },
  bullpen:       { img: 'bullpen',       name: 'Bullpen',               travel: true },
  desk:          { img: 'desk',          name: 'Charles’s Desk',         travel: true },
  holt:          { img: 'holt',          name: 'Captain Holt’s Office',  travel: true },
  rooftop:       { img: 'rooftop',       name: 'Rooftop',               travel: true },
  lockers:       { img: 'lockers',       name: 'Locker Room',           travel: true },
  briefing:      { img: 'briefing',      name: 'Briefing Room',         travel: true },
  interrogation: { img: 'interrogation', name: 'Interrogation Room' },
};

const ICONS = {
  fog: '<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z"/><path d="M4 21h8M14 21h6"/>',
  camera: '<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13.5" r="3.5"/>',
  receipt: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  microwave: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><rect x="6" y="8" width="9" height="8"/><path d="M18 9v.01M18 12v.01M18 15v.01"/>',
  speech: '<path d="M4 5h16v11H10l-5 4v-4H4z"/><path d="M8 9h8M8 12h5"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 10h16M8 3v4M16 3v4M8 14h3"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  radio: '<rect x="7" y="8" width="10" height="13" rx="1.5"/><path d="M9 8V2M10 12h4M10 15h4M10 18h4"/>',
  note: '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
};
const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

const EVIDENCE = {
  residue:   { title: 'Fog Residue',          icon: 'fog',       where: 'Display stand, bullpen',  desc: 'Oily residue on the empty stand that smells like cotton candy. That is not smoke from a fire. It is theatrical fog fluid. Someone brought a fog machine.' },
  cctv:      { title: 'CCTV Still, 11:00:42', icon: 'camera',    where: 'Bullpen security camera', desc: 'Through a gap in the smoke: a figure in a beige shirt and patterned tie, crouched by Charles’s desk, holding a covered dish.' },
  receipt:   { title: 'Fog Machine Receipt',  icon: 'receipt',   where: 'Charles’s desk',          desc: '“FOG-MASTER 3000, party rental.” Paid by C. Boyle. Picked up today at 6:12 PM.' },
  microwave: { title: 'Microwave Log',        icon: 'microwave', where: 'Break room',              desc: 'Lasagna started 10:58 PM. Door opened 11:01 PM. Ice cream truck leaves at 11:04. Hitchcock and Scully’s ridiculous alibi actually works.' },
  statement: { title: 'Charles’s Confession', icon: 'speech',    where: 'Interrogation room',      desc: '“Captain Holt told me to take it. He planned the whole thing. It’s hidden in his office.”' },
  schedule:  { title: 'Holt’s Schedule',      icon: 'calendar',  where: 'Captain Holt’s desk',     desc: '10:50 to 11:15 PM: video call with Kevin about the opera. “Do NOT be late. Kevin will notice.” Holt was on camera when the cummerbund vanished.' },
  texts:     { title: 'Jake’s Texts',         icon: 'phone',     where: 'Charles’s phone',         desc: '“phase 2 is a GO 🐍 grabbing supplies from the roof. DO NOT tell Ames. delete this. wait did u delete it”' },
  walkie:    { title: 'Jake’s Walkie-Talkie', icon: 'radio',     where: 'Rooftop',                 desc: 'Dropped on the roof. It crackles: “…Charles, change of plans. Locker room. Now. Is this thing on? Over? OVER?”' },
  note:      { title: 'Charles’s Note',       icon: 'note',      where: 'Charles’s locker',        desc: '“For Amy. I’m sorry. The code is where we all work, followed by how many seconds the Captain made us wait.”' },
  key:       { title: 'Shield Key',           icon: 'key',       where: 'Safe in Charles’s locker', desc: 'A brass key with no number. Its tag is stamped with a shield, and under the shield is a tiny engraved podium.' },
};
const EV_ORDER = Object.keys(EVIDENCE);

const ACHIEVEMENTS = {
  case_closed: { m: '🎃', t: 'Case Closed',          d: 'Solve the Halloween Heist.' },
  best_human:  { m: '🏆', t: 'Best Human',           d: 'Earn the top rank.' },
  flawless:    { m: '🎯', t: 'Flawless',             d: 'Solve the case without a single mistake.' },
  speed:       { m: '💨', t: 'Ahead of Schedule',    d: 'Finish with 20 or more minutes to spare.' },
  thorough:    { m: '📂', t: 'Binder Energy',        d: 'Collect every piece of evidence.' },
  no_hints:    { m: '🧠', t: 'No Help Needed',       d: 'Solve the case without using a hint.' },
  full_squad:  { m: '👥', t: 'Full Squad',           d: 'Interview every member of the squad.' },
  first_try:   { m: '🔐', t: 'Safecracker',          d: 'Open Charles’s safe on the first try.' },
  good_boy:    { m: '🐶', t: 'Good Boy',             d: 'Find Cheddar’s leash.' },
  noice:       { m: '🦖', t: 'Noice',                d: 'Admire the figurine on Charles’s desk.' },
  bit:         { m: '🎭', t: 'Commitment to the Bit', d: 'Try every other character before choosing Amy.' },
  midnight:    { m: '🕛', t: 'Cinderella',           d: 'Let the clock strike midnight.' },
};

const SQUAD = ['terry', 'gina', 'rosa', 'hitchcock', 'boyle'];
const SQUAD_NAMES = { terry: 'Terry', gina: 'Gina', rosa: 'Rosa', hitchcock: 'Hitchcock & Scully', boyle: 'Charles' };
const STATUS_LABEL = { unknown: 'Not questioned', cleared: 'Cleared', suspect: 'Suspect', lying: 'Lied to you', mastermind: 'Mastermind' };

function freshState() {
  return {
    chapter: 1, scene: 'podium', time: 0, mistakes: 0, hints: 0,
    evidence: [], fresh: [], flags: {}, seen: {}, unlocked: ['bullpen', 'desk'],
    sus: { terry: 'unknown', gina: 'unknown', rosa: 'unknown', hitchcock: 'unknown', boyle: 'unknown' },
    log: [], objective: '', safeFails: 0, warned: {},
  };
}

/* =========================================================
   Achievements & toasts
   ========================================================= */
function toast(label, text, { icon: ic = '✔', kind = '' } = {}) {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.innerHTML = `<div class="ti">${ic}</div><div><small>${esc(label)}</small>${esc(text)}</div>`;
  $('toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, 2900);
}
function unlock(id) {
  if (achieved[id]) return;
  achieved[id] = Date.now();
  store.set(ACH_KEY, achieved);
  const a = ACHIEVEMENTS[id];
  setTimeout(() => { toast('Achievement unlocked', a.t, { icon: a.m, kind: 'ach' }); Audio.sfx('unlock'); }, 300);
}

/* =========================================================
   Clock
   ========================================================= */
function clockText(min) {
  const total = 23 * 60 + Math.min(min, DEADLINE);
  let h = Math.floor(total / 60) % 24, m = total % 60;
  const ap = h >= 12 && h < 24 && total < 24 * 60 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return { t: `${h}:${String(m).padStart(2, '0')}`, ap };
}
function updateClock(bump) {
  if (!S) return;
  const { t, ap } = clockText(S.time);
  $('clockTime').textContent = t;
  $('clock').querySelector('small').textContent = ap;
  const left = DEADLINE - S.time;
  $('clockFill').style.width = `${Math.max(0, left / DEADLINE * 100)}%`;
  $('clockLabel').textContent = left > 0 ? `${left} min to midnight` : 'Midnight';
  const c = $('clock');
  c.classList.toggle('warn', left <= 20 && left > 10);
  c.classList.toggle('danger', left <= 10);
  if (bump) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
}
function spend(min) {
  if (!min || !S || S.chapter < 2 || S.chapter > 7) return;
  S.time += min;
  updateClock(true);
  Audio.sfx('tock');
  const left = DEADLINE - S.time;
  for (const w of [30, 15, 5]) {
    if (left <= w && left > 0 && !S.warned[w]) { S.warned[w] = true; toast('The clock is ticking', `${left} minutes until midnight`, { icon: '🕚', kind: 'bad' }); }
  }
  if (S.time >= DEADLINE) { S.time = DEADLINE; updateClock(); throw MIDNIGHT; }
}
function mistake(min, why) {
  S.mistakes++;
  Audio.sfx('wrong');
  stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
  toast(`Mistake · −${min} min`, why, { icon: '✕', kind: 'bad' });
  spend(min);
}

/* =========================================================
   Scenes & backgrounds
   ========================================================= */
let bgFront = $('bgA'), bgBack = $('bgB');
function setBg(name, { kb = true } = {}) {
  bgBack.style.backgroundImage = `url("${IMG(name)}")`;
  bgBack.classList.toggle('kenburns', kb && !settings.reduce);
  bgBack.classList.add('on');
  bgFront.classList.remove('on');
  [bgFront, bgBack] = [bgBack, bgFront];
}
function setScene(id, opts) {
  if (!['smoke', 'empty'].includes(id)) FX.stop(true);
  S.scene = id;
  setBg(SCENES[id].img, opts);
  $('hudLocation').textContent = SCENES[id].name;
  renderHotspots();
  renderSquad();
}
async function fade(fn, ms = 450) {
  const tok = RUN;
  $('fade').classList.add('on');
  await sleep(ms);
  if (tok !== RUN) throw ABORT;
  await fn();
  await sleep(80);
  $('fade').classList.remove('on');
  await sleep(250);
}
async function go(id, opts) { await fade(() => setScene(id, opts)); }
function showHud(on) {
  $('hud').hidden = !on;
  $('revealBtn').hidden = !on;
  if (!on) $('objective').hidden = true;
}
function setChapterLabel() { $('hudChapter').textContent = CHAPTER_NAMES[S.chapter] ? `Chapter ${S.chapter} · ${CHAPTER_NAMES[S.chapter]}` : 'Epilogue'; }

/* =========================================================
   Dialogue
   ========================================================= */
function parse(raw) {
  if (raw.startsWith('> ')) return { who: null, text: raw.slice(2) };
  const m = raw.match(/^([a-z]+)(?:\.([a-z]+))?:\s*([\s\S]*)$/);
  if (m && CAST[m[1]]) {
    let text = m[3], fx = null;
    if (text.startsWith('!')) { fx = 'shake'; text = text.slice(1).trim(); }
    return { who: m[1], face: m[2] || 'neutral', text, fx };
  }
  return { who: null, text: raw };
}
let lastPortrait = '';
function showLine(p) {
  const d = $('dialogue');
  d.hidden = false;
  document.body.classList.add('talking');
  d.classList.toggle('narration', !p.who);
  const np = $('nameplate');
  np.textContent = p.who ? CAST[p.who].name : '';
  np.className = 'nameplate' + (p.who ? ' c-' + p.who : '');
  if (p.who) {
    const src = portrait(p.who, p.face);
    const box = $('portrait');
    box.classList.toggle('jake', p.who === 'jake');
    if (src !== lastPortrait) {
      $('portraitImg').src = src;
      $('portraitImg').alt = `${CAST[p.who].name}, ${p.face}`;
      box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
      lastPortrait = src;
    }
    if (p.fx === 'shake') { box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); Audio.sfx('deny'); }
  }
  $('choices').innerHTML = '';
}
function hideDialogue() {
  $('dialogue').hidden = true;
  document.body.classList.remove('talking');
  $('choices').innerHTML = '';
  lastPortrait = '';
}
function typeText(text, who) {
  const el = $('dlgText');
  el.className = 'dlg-text' + (who ? '' : ' narr');
  // build spans, *word* becomes highlighted
  let em = false, html = '';
  const chars = [];
  for (const ch of text) {
    if (ch === '*') { em = !em; continue; }
    chars.push(ch);
    html += `<span style="opacity:0"${em ? ' class="e"' : ''}>${esc(ch)}</span>`;
  }
  el.innerHTML = html.replace(/<span style="opacity:0" class="e">([^<]*)<\/span>/g, '<em><span style="opacity:0">$1</span></em>');
  const spans = el.querySelectorAll('span');
  const delay = SPEEDS[settings.speed] ?? 22;
  if (!delay) { spans.forEach(s => s.style.opacity = 1); return Promise.resolve(); }
  return new Promise(resolve => {
    let i = 0;
    const pitch = who ? CAST[who].pitch : 0;
    const finish = () => { clearInterval(iv); spans.forEach(s => s.style.opacity = 1); typing = null; resolve(); };
    const iv = setInterval(() => {
      if (i >= spans.length) return finish();
      spans[i].style.opacity = 1;
      const c = chars[i];
      if (c && c.trim() && i % 3 === 0) { if (who) Audio.sfx('blip', pitch); else Audio.sfx('key'); }
      i++;
    }, delay);
    typing = { finish };
  });
}
async function line(raw, keep = false) {
  const tok = RUN;
  const p = parse(raw);
  showLine(p);
  await typeText(p.text, p.who);
  if (tok !== RUN) throw ABORT;
  if (keep) return;
  $('advance').classList.add('on');
  await new Promise(r => { advanceResolve = r; });
  $('advance').classList.remove('on');
  if (tok !== RUN) throw ABORT;
}
async function say(...lines) { for (const l of lines.flat()) if (l) await line(l); }
function advance() {
  if (typing) { typing.finish(); return; }
  if (advanceResolve) { const r = advanceResolve; advanceResolve = null; Audio.sfx('click'); r(); }
}
async function choose(options, { q = '', ask = '' } = {}) {
  const tok = RUN;
  if (ask) await line(ask, true);
  else if ($('dialogue').hidden) { showLine({ who: null, text: '' }); $('dlgText').innerHTML = ''; }
  const box = $('choices');
  box.innerHTML = q ? `<div class="q">${esc(q)}</div>` : '';
  const shown = options.filter(o => !o.hidden);
  const value = await new Promise(resolve => {
    choiceResolve = resolve;
    shown.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'choice ' + (o.cls || '');
      b.innerHTML = `${esc(o.label)}${shown.length > 1 && i < 9 ? ` <kbd>${i + 1}</kbd>` : ''}`;
      b.style.animationDelay = `${i * 50}ms`;
      b.onclick = e => { e.stopPropagation(); Audio.sfx('click'); choiceResolve = null; resolve(o.value); };
      b.onmouseenter = () => Audio.sfx('hover');
      box.append(b);
    });
  });
  box.innerHTML = '';
  if (tok !== RUN) throw ABORT;
  return value;
}

/* =========================================================
   Evidence, objectives, suspects
   ========================================================= */
function has(id) { return S.evidence.includes(id); }
function gain(id) {
  if (has(id)) return false;
  S.evidence.push(id); S.fresh.push(id);
  const e = EVIDENCE[id];
  Audio.sfx('clue');
  toast('Evidence added to case file', e.title, { icon: '📁' });
  updateBadge();
  if (EV_ORDER.every(has)) unlock('thorough');
  return true;
}
function updateBadge() {
  const b = $('caseBadge');
  b.hidden = !S.fresh.length;
  b.textContent = S.fresh.length;
}
function objective(text) {
  if (S.objective === text) return;
  if (S.objective) { const last = S.log.find(l => l.text === S.objective); if (last) last.done = true; }
  S.objective = text;
  if (text) S.log.push({ text, done: false });
  showObjective();
}
function showObjective() {
  const o = $('objective');
  if (!S || !S.objective || $('hud').hidden) { o.hidden = true; return; }
  $('objectiveText').textContent = S.objective;
  o.hidden = false;
  o.classList.remove('new'); void o.offsetWidth; o.classList.add('new');
}
function setSus(who, st) { S.sus[who] = st; renderSquad(); }

/* =========================================================
   Free roam: hotspots, squad, travel
   ========================================================= */
function roam(text, done) {
  objective(text);
  if (done()) return Promise.resolve();
  const tok = RUN;
  hideDialogue();
  showObjective();
  return new Promise((resolve, reject) => { roamCtx = { done, resolve, reject, tok }; setBusy(false); renderHotspots(); renderSquad(); });
}
function setBusy(b) {
  busy = b;
  stage.classList.toggle('busy', b);
  $('btnMap').classList.toggle('disabled', b || !roamCtx);
  $('btnHint').classList.toggle('disabled', b || !roamCtx);
}
async function act(fn) {
  if (busy || !roamCtx) return;
  const ctx = roamCtx;
  setBusy(true);
  try {
    await fn();
  } catch (e) {
    if (e === ABORT) return;
    if (e === MIDNIGHT) { roamCtx = null; setBusy(false); timeUp(); return; }
    console.error(e);
  }
  if (ctx.tok !== RUN) return;
  hideDialogue();
  setBusy(false);
  showObjective();
  renderHotspots(); renderSquad();
  if (roamCtx === ctx && ctx.done()) { roamCtx = null; setBusy(true); ctx.resolve(); }
}
function renderHotspots() {
  const box = $('hotspots');
  box.innerHTML = '';
  if (!S || !roamCtx) return;
  (HOTSPOTS[S.scene] || []).forEach(h => {
    if (h.show && !h.show()) return;
    const b = document.createElement('button');
    b.className = 'hs' + (h.door ? ' door' : '') + (S.seen[S.scene + ':' + h.id] && !h.door ? ' seen' : '') + (h.y < 18 ? ' tip-below' : '');
    b.style.cssText = `left:${h.x}%;top:${h.y}%;width:${h.w}%;height:${h.h}%`;
    b.setAttribute('aria-label', h.label);
    b.innerHTML = `<span class="dot"></span><span class="tip">${esc(h.label)}</span>`;
    b.onmouseenter = () => Audio.sfx('hover');
    b.onclick = () => act(async () => { Audio.sfx('click'); S.seen[S.scene + ':' + h.id] = true; await h.run(); });
    box.append(b);
  });
}
function renderSquad() {
  const box = $('squad');
  const show = S && roamCtx && S.scene === 'bullpen' && S.chapter === 2;
  box.hidden = !show;
  if (!show) return;
  box.innerHTML = '';
  SQUAD.forEach(id => {
    const st = S.sus[id];
    const b = document.createElement('button');
    b.className = `mate ${st}`;
    b.innerHTML = `<img src="${portrait(id, 'neutral')}" alt=""><span class="dot2"></span><span class="who"><span class="nm">${SQUAD_NAMES[id]}</span><span class="st">${STATUS_LABEL[st]}</span></span>`;
    b.onmouseenter = () => Audio.sfx('hover');
    b.onclick = () => act(() => interview(id));
    box.append(b);
  });
}
async function travel(id) {
  if (id === S.scene) return;
  spend(1);
  Audio.sfx('door');
  await go(id);
  const enter = ON_ENTER[id];
  if (enter) await enter();
}

/* =========================================================
   Cinematic helpers
   ========================================================= */
function cinema(html, cls) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.innerHTML = html;
  $('cinema').append(d);
  return d;
}
function flash() { const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
function shakeStage() { stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake'); }
async function chapterCard(n, name, sub) {
  const tok = RUN;
  hideDialogue();
  Audio.sfx('sting');
  const c = cinema(`<div><div class="num">${n ? 'Chapter ' + n : 'Epilogue'}</div><div class="name">${esc(name)}</div><div class="line"></div><div class="sub">${esc(sub)}</div></div>`, 'chapter-card');
  await Promise.race([sleep(3000), new Promise(r => c.addEventListener('click', r, { once: true }))]);
  c.classList.add('out');
  await sleep(550);
  c.remove();
  if (tok !== RUN) throw ABORT;
}
async function bigText(text, ms = 1500) {
  const c = cinema(`<span>${esc(text)}</span>`, 'big-text');
  await sleep(ms);
  c.remove();
}
async function itemReveal({ label, img, engraving, sub = 'Click to continue' }) {
  const tok = RUN;
  hideDialogue();
  Audio.sfx('reveal');
  const c = cinema(`<div class="rays"></div><div class="inner"><div class="label">${esc(label)}</div>${img ? `<img src="${img}" alt="">` : ''}${engraving ? `<div class="engraving">${engraving}</div>` : ''}<div class="tap">${esc(sub)}</div></div>`, 'item-reveal');
  await sleep(900);
  await new Promise(r => { c.addEventListener('click', r, { once: true }); window.__revealSkip = r; });
  window.__revealSkip = null;
  Audio.sfx('click');
  c.style.animation = 'fadeOut .4s ease forwards';
  await sleep(400);
  c.remove();
  if (tok !== RUN) throw ABORT;
}
function contradiction() {
  Audio.sfx('objection');
  flash(); shakeStage();
  return bigText('CONTRADICTION!', 1300);
}

/* ---------- canvas effects: smoke, confetti, fog ---------- */
const FX = (() => {
  const cv = $('fx'), g = cv.getContext('2d');
  let parts = [], mode = null, raf = 0, W = 0, H = 0, dens = 0, fadeK = 1, fading = 0;
  function size() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = cv.width = Math.max(1, r.width * dpr); H = cv.height = Math.max(1, r.height * dpr);
  }
  function spawnSmoke() {
    parts.push({ x: Math.random() * W, y: H * (0.4 + Math.random() * 0.7), r: (0.12 + Math.random() * 0.2) * W, vx: (Math.random() - 0.5) * 0.6, vy: -0.2 - Math.random() * 0.5, a: 0, life: 0, max: 400 + Math.random() * 300, c: 200 + Math.random() * 40 });
  }
  function spawnConfetti(burst) {
    const cols = ['#f2c46d', '#ff8a3d', '#e0483f', '#62d39a', '#6fa8ff', '#fff3c9', '#d58bff'];
    for (let i = 0; i < burst; i++) parts.push({ conf: true, x: W * (0.2 + Math.random() * 0.6), y: H * 0.55, vx: (Math.random() - 0.5) * W * 0.02, vy: -H * (0.012 + Math.random() * 0.02), r: 4 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: cols[i % cols.length], life: 0, max: 260 + Math.random() * 120 });
  }
  function tick() {
    g.clearRect(0, 0, W, H);
    if (fading) { fadeK -= fading; if (fadeK <= 0) { fadeK = 1; fading = 0; parts = parts.filter(p => p.conf); } }
    g.globalAlpha = 1;
    if (mode === 'smoke' && parts.filter(p => !p.conf).length < 70 * dens) for (let i = 0; i < 3; i++) spawnSmoke();
    if (mode === 'fog' && parts.length < 14) spawnSmoke();
    parts = parts.filter(p => p.life < p.max);
    for (const p of parts) {
      p.life++;
      if (p.conf) {
        p.vy += H * 0.0004; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.min(1, (p.max - p.life) / 60);
        g.fillStyle = p.c; g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); g.restore();
      } else {
        p.x += p.vx; p.y += p.vy; p.r *= 1.002;
        const k = p.life / p.max, base = mode === 'fog' ? 0.07 : 0.32 * dens;
        p.a = (k < 0.2 ? k / 0.2 : k > 0.75 ? (1 - k) / 0.25 : 1) * base;
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        gr.addColorStop(0, `rgba(${p.c},${p.c},${p.c + 5},${p.a * fadeK})`); gr.addColorStop(1, `rgba(${p.c},${p.c},${p.c},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
      }
    }
    if (mode || parts.length) raf = requestAnimationFrame(tick); else raf = 0;
  }
  return {
    smoke(d = 1) { size(); mode = 'smoke'; dens = d; if (!raf) tick(); },
    fog() { size(); mode = 'fog'; if (!raf) tick(); },
    confetti(n = 160) { if (settings.reduce) return; size(); spawnConfetti(n); if (!raf) tick(); },
    stop(clear) { mode = null; fading = 0; fadeK = 1; if (clear) { parts = []; g.clearRect(0, 0, W, H); } },
    fadeOut(ms = 1500) { mode = null; fading = 1 / (ms / 16.7); if (!raf && parts.length) tick(); },
    density(d) { dens = d; },
  };
})();

/* =========================================================
   Modals: case file, map, settings, menu, help, achievements
   ========================================================= */
function openModal(title, html, { narrow = false, cls = '', onClose = null } = {}) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = html;
  $('modalCard').className = 'modal-card' + (narrow ? ' narrow' : '') + (cls ? ' ' + cls : '');
  $('modal').hidden = false;
  modalCtx = { onClose };
  Audio.sfx('page');
  setTimeout(() => $('modalClose').focus(), 50);
}
function closeModal(silent) {
  if ($('modal').hidden) return;
  $('modal').hidden = true;
  const ctx = modalCtx; modalCtx = null;
  if (!silent && ctx && ctx.onClose) ctx.onClose();
}

function evidenceCard(id, selectable) {
  const e = EVIDENCE[id];
  return `<button class="ev ${S.fresh.includes(id) ? 'new' : ''}" data-ev="${id}" ${selectable ? '' : 'tabindex="-1"'}><div class="ic">${icon(e.icon)}</div><h5>${esc(e.title)}</h5><div>${esc(e.desc)}</div><div class="src">Found: ${esc(e.where)}</div></button>`;
}
function openCase(tab = 'evidence', present = null) {
  if (!S) return;
  if (!present) unlockBinder();
  const tabs = present ? ['evidence'] : ['evidence', 'suspects', 'objectives'];
  const render = t => {
    let body = '';
    if (t === 'evidence') {
      const got = EV_ORDER.filter(has);
      body += present ? `<div class="present-banner"><b>Present evidence</b>${esc(present.prompt)}</div>` : '';
      body += `<div class="ev-grid ${present ? 'selectable' : ''}">`;
      body += got.map(id => evidenceCard(id, !!present)).join('');
      if (!present) body += EV_ORDER.filter(id => !has(id)).map(() => '<div class="ev missing">? ? ?</div>').join('');
      body += '</div>';
      if (!got.length) body = '<p>No evidence yet. Investigate the glowing spots in each room.</p>';
    } else if (t === 'suspects') {
      const people = [...SQUAD];
      if (S.flags.holtMet) people.push('holt');
      if (S.flags.jakeRevealed) people.push('jake');
      body = '<div class="sus-grid">' + people.map(id => {
        const st = id === 'holt' ? (S.flags.holtCleared ? 'cleared' : 'suspect') : id === 'jake' ? 'mastermind' : S.sus[id];
        const nm = id === 'hitchcock' ? 'Hitchcock & Scully' : CAST[id].name;
        const label = id === 'jake' ? 'Mastermind' : STATUS_LABEL[st];
        return `<div class="sus"><img src="${portrait(id, 'neutral')}" alt=""><div><h5>${esc(nm)}</h5><span class="stamp ${st}">${esc(label)}</span><p>${esc(NOTES[id]())}</p></div></div>`;
      }).join('') + '</div>';
    } else {
      const left = DEADLINE - S.time;
      body = `<div class="stats"><div class="stat"><b>${clockText(S.time).t} ${clockText(S.time).ap}</b><span>Current time</span></div><div class="stat"><b>${Math.max(0, left)} min</b><span>Until midnight</span></div><div class="stat"><b>${S.evidence.length}/${EV_ORDER.length}</b><span>Evidence</span></div><div class="stat"><b>${S.mistakes}</b><span>Mistakes</span></div></div>`;
      body += '<ul class="obj-list">' + [...S.log].reverse().map(l => `<li class="${l.done ? 'done' : ''}"><span class="ck">${l.done ? '✓' : ''}</span><span>${esc(l.text)}</span></li>`).join('') + '</ul>';
    }
    const tabHtml = tabs.length > 1 ? `<div class="tabs">${tabs.map(x => `<button class="tab ${x === t ? 'on' : ''}" data-tab="${x}">${{ evidence: 'Evidence', suspects: 'Suspects', objectives: 'Case log' }[x]}</button>`).join('')}</div>` : '';
    openModal(present ? 'Present evidence' : 'Case file', tabHtml + `<div class="cf-body">${body}</div>`, { cls: 'casefile', onClose: present ? present.cancel : null });
    // Move tabs above the scrolling body
    $('modalBody').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { Audio.sfx('page'); render(b.dataset.tab); });
    if (present) $('modalBody').querySelectorAll('[data-ev]').forEach(b => b.onclick = () => { Audio.sfx('click'); closeModal(true); present.pick(b.dataset.ev); });
    if (t === 'evidence' && !present) { S.fresh = []; updateBadge(); }
  };
  render(tab);
}
function unlockBinder() { S.caseOpens = (S.caseOpens || 0) + 1; }
function present(prompt) {
  const tok = RUN;
  return new Promise((resolve, reject) => {
    openCase('evidence', { prompt, pick: id => resolve(id), cancel: () => resolve(null) });
  }).then(v => { if (tok !== RUN) throw ABORT; return v; });
}

const NOTES = {
  terry: () => S.sus.terry === 'cleared' ? 'Wants nothing to do with the heist. Hates paperwork, hates chaos. His story checks out.' : 'Has not been questioned yet.',
  gina: () => S.sus.gina === 'cleared' ? 'Roasted my binders. Was live-streaming the smoke to thousands of followers. Annoyingly airtight.' : 'Has not been questioned yet.',
  rosa: () => S.sus.rosa === 'cleared' ? 'Did not take it. Does not care. Told me to check the surveillance footage, then left. Suspiciously unhelpful, but not the thief.' : 'Has not been questioned yet.',
  hitchcock: () => S.sus.hitchcock === 'cleared' ? `Second lunch, lasagna, ice cream truck. A completely stupid alibi, but the timing works.${has('microwave') ? ' The microwave log confirms it.' : ''}` : 'Has not been questioned yet.',
  boyle: () => ({ unknown: 'Has not been questioned yet.', suspect: 'Defensive. Avoids eye contact. Said “lasagna” before I asked anything.', lying: S.flags.jakeRevealed ? 'Lied for Jake, then felt guilty. He knows more than he is saying.' : 'Claimed Captain Holt ordered the theft. His story keeps changing.', cleared: '' }[S.sus.boyle] || ''),
  holt: () => S.flags.holtCleared ? 'Was on a video call with Kevin when the cummerbund vanished. Extremely offended. Prefers Cheddar as a partner.' : 'Charles says Holt planned the whole thing. Holt says that is absurd.',
  jake: () => 'Planned the smoke, Charles’s fake confession and the Holt distraction. Then someone stole the cummerbund from him.',
};

function openMap() {
  if (!S || busy || !roamCtx) return;
  const places = Object.entries(SCENES).filter(([, v]) => v.travel);
  const html = '<div class="map-grid">' + places.map(([id, v]) => {
    const open = S.unlocked.includes(id), here = S.scene === id;
    return `<button class="place ${open ? '' : 'locked'} ${here ? 'here' : ''}" data-go="${id}" style="background-image:url('${IMG(v.img)}')" ${open ? '' : 'aria-disabled="true"'}><span>${esc(v.name)}</span><small>${here ? 'You are here' : open ? '1 min' : 'Locked'}</small></button>`;
  }).join('') + '</div><p style="margin-top:14px;color:var(--muted);font-size:13px">Travelling between rooms takes 1 minute. New rooms open as the case develops.</p>';
  openModal('Travel', html);
  $('modalBody').querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
    const id = b.dataset.go;
    if (!S.unlocked.includes(id)) { Audio.sfx('deny'); return; }
    closeModal(true);
    if (id !== S.scene) act(() => travel(id));
  });
}

function openSettings(back) {
  const seg = Object.keys(SPEEDS).map(k => `<button data-speed="${k}" class="${settings.speed === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('');
  openModal('Settings', `
    <div class="set-row"><label for="sMusic">Music</label><input id="sMusic" type="range" min="0" max="1" step="0.05" value="${settings.music}"></div>
    <div class="set-row"><label for="sSfx">Sound effects</label><input id="sSfx" type="range" min="0" max="1" step="0.05" value="${settings.sfx}"></div>
    <div class="set-row"><label>Text speed</label><div class="seg">${seg}</div></div>
    <div class="set-row"><label for="sReduce">Reduce motion</label><input id="sReduce" type="checkbox" ${settings.reduce ? 'checked' : ''}></div>
    ${back ? '<div style="margin-top:16px"><button class="btn" id="setBack">Back</button></div>' : ''}`, { narrow: true });
  $('sMusic').oninput = e => { settings.music = +e.target.value; applySettings(); };
  $('sSfx').oninput = e => { settings.sfx = +e.target.value; applySettings(); Audio.sfx('click'); };
  $('sReduce').onchange = e => { settings.reduce = e.target.checked; applySettings(); };
  $('modalBody').querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { settings.speed = b.dataset.speed; applySettings(); openSettings(back); });
  if (back) $('setBack').onclick = back;
}
function openHelp() {
  openModal('How to play', `
    <p>It’s Halloween at the Nine-Nine. The Championship Cummerbund has been stolen, and you are Amy Santiago. Find it before <b>midnight</b>.</p>
    <h4>Investigate</h4><p>Click the glowing spots in each room. Press <kbd>Tab</kbd> or the magnifier to show every clickable spot. Blue spots are exits.</p>
    <h4>Question the squad</h4><p>Click a squad member to interview them, then decide: clear them, or mark them as a suspect.</p>
    <h4>Catch the lies</h4><p>During interrogations, pick the statement that doesn’t hold up and <b>present the evidence</b> that contradicts it.</p>
    <h4>Watch the clock</h4><p>Everything takes time: travelling, questioning, searching. Mistakes cost extra minutes. Hints cost two. If the clock hits midnight, nobody wins.</p>
    <h4>Controls</h4><p><kbd>Space</kbd> or click: continue · <kbd>1</kbd>–<kbd>9</kbd>: pick an answer · <kbd>C</kbd>: case file · <kbd>M</kbd>: travel · <kbd>Esc</kbd>: menu</p>
    <p>Your progress saves automatically at the start of every chapter.</p>`, { narrow: true });
}
function openAchievements() {
  const got = Object.keys(ACHIEVEMENTS).filter(k => achieved[k]).length;
  openModal(`Achievements · ${got}/${Object.keys(ACHIEVEMENTS).length}`, '<div class="ach-grid">' + Object.entries(ACHIEVEMENTS).map(([k, a]) =>
    `<div class="ach ${achieved[k] ? 'got' : ''}"><div class="medal">${a.m}</div><div><b>${esc(a.t)}</b><span>${esc(a.d)}</span></div></div>`).join('') + '</div>');
}
function openMenu() {
  if (!S) return;
  openModal('Paused', `<div class="menu-list">
    <button class="btn primary" data-m="resume">Resume</button>
    <button class="btn" data-m="case">Case file</button>
    <button class="btn" data-m="settings">Settings</button>
    <button class="btn" data-m="help">How to play</button>
    <button class="btn" data-m="ach">Achievements</button>
    <button class="btn" data-m="retry">Restart this chapter</button>
    <button class="btn" data-m="quit">Save and quit to title</button></div>`, { narrow: true });
  $('modalBody').querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    const m = b.dataset.m;
    if (m === 'resume') closeModal();
    if (m === 'case') openCase();
    if (m === 'settings') openSettings(openMenu);
    if (m === 'help') openHelp();
    if (m === 'ach') openAchievements();
    if (m === 'retry') { closeModal(true); continueGame(); }
    if (m === 'quit') { closeModal(true); toTitle(); }
  });
}

/* =========================================================
   Hints
   ========================================================= */
function hintText() {
  const c = S.chapter;
  if (c === 2) {
    if (S.sus.rosa === 'unknown') return 'Rosa seems like she knows something about the security system. Talk to her.';
    if (S.sus.boyle === 'unknown') return 'Charles has been acting weird all night. Question him.';
    if (S.sus.boyle !== 'suspect') return 'Decide what you think about Charles.';
    if (!has('cctv')) return 'Review the bullpen security monitor. Scrub through the footage and capture the frame where the smoke thins.';
    if (!has('receipt')) return 'Search Charles’s desk. Use Travel or click his desk in the bullpen. That paperwork looks interesting.';
  }
  if (c === 3) return 'Pick a statement, then present the evidence that proves it false. The CCTV still and the receipt are your best weapons.';
  if (c === 4) {
    if (S.scene !== 'holt') return 'Go to Captain Holt’s office using Travel.';
    if (!has('schedule')) return 'Holt is a creature of schedule. Check the planner on his desk.';
  }
  if (c === 5) {
    if (!has('texts')) return 'Charles said Jake texted him. His phone is on his desk.';
    if (!has('walkie')) return 'Jake mentioned the roof. Travel to the rooftop and look around the planter.';
    return 'The walkie said “locker room.” Travel there.';
  }
  if (c === 6) {
    if (!has('note')) return 'Charles’s locker door has a note taped to it.';
    if (!has('key')) return 'Where do we all work? The 99th precinct. How long did the Captain make everyone wait? Ten seconds. 9 9 1 0.';
  }
  if (c === 7) {
    if (S.scene !== 'briefing') return 'The key points to where the heist began. Travel to the briefing room.';
    return 'Examine the podium. Something about the shield on the front looks off.';
  }
  return 'Keep exploring. Glowing spots show what you can investigate.';
}
async function useHint() {
  if (!roamCtx || busy) return;
  act(async () => {
    S.hints++;
    spend(2);
    toast('Hint · −2 min', 'Amy consults her binder', { icon: '💡' });
    await say(`amy.skeptical: (Let me check my binder…) ${hintText()}`);
  });
}

/* =========================================================
   Interviews (chapter 2)
   ========================================================= */
const INTERVIEWS = {
  terry: {
    intro: ['terry.serious: Santiago. Before you even start: I want *nothing* to do with this heist.',
      'terry.concerned: Heists mean chaos. Chaos means incidents. Incidents mean paperwork. And Terry already has a mountain of paperwork.'],
    qs: [
      { q: 'Where were you during the smoke?', a: ['terry.determined: In the break room doorway, guarding the squad snacks so they didn’t become a workplace incident.', 'terry.neutral: Ask anyone. I was *very* loud about it.'] },
      { q: 'You seem tense.', a: ['terry.concerned: Terry is always tense on Halloween. Last year somebody put a skeleton in my yogurt fridge.', 'terry.serious: The yogurt was fine. Terry was not.'] },
    ],
    verdict: 'cleared',
    right: ['amy.neutral: His story checks out. Not Terry.'],
    wrong: ['terry.surprised: !Me? I literally just said I want NOTHING to do with this!', 'amy.skeptical: …Right. He really, truly hates this. Not Terry.'],
    again: ['terry.supportive: Terry believes in you, Santiago. Terry also believes in not being involved.'],
  },
  gina: {
    intro: ['gina.judging: Ugh, Amy. Your interrogation face is giving “binder with legs.”',
      'gina.sarcastic: Let me guess. You’ve already made three binders about this heist.',
      'amy.annoyed: I have made *one* binder.', 'gina.judging: And?', 'amy.skeptical: …And two supplemental binders. They’re color-coded. It’s different.'],
    qs: [
      { q: 'Did you take the cummerbund?', a: ['gina.confident: If I stole it, you would never find it. Also, I would have bedazzled it.', 'gina.judging: Look at the photos. Not bedazzled. Not me.'] },
      { q: 'Where were you during the smoke?', a: ['gina.playful: At my desk, live-streaming the smoke to my followers. Nine thousand people can confirm my alibi.', 'gina.confident: Eleven thousand if you count the bots. Which I do.'] },
    ],
    verdict: 'cleared',
    right: ['amy.annoyed: Annoyingly airtight. Not Gina.'],
    wrong: ['gina.shocked: !Excuse me? I have *nine thousand* witnesses. You have a binder.', 'amy.skeptical: …Fine. The livestream is a solid alibi. Not Gina.'],
    again: ['gina.sarcastic: Amy, if you want an autograph, just ask.'],
  },
  rosa: {
    intro: ['rosa.annoyed: No.', 'amy.neutral: I haven’t asked you anything yet.',
      'rosa.serious: Didn’t take it. Don’t care. Check the surveillance footage. The bullpen camera sees everything.',
      '> Rosa turns and walks away without another word.',
      'amy.skeptical: Suspiciously unhelpful… but honestly, that’s just Rosa being Rosa.'],
    qs: [],
    after: () => { S.flags.rosaTip = true; },
    verdict: 'cleared',
    right: ['amy.neutral: She pointed me straight at the evidence. The thief wouldn’t do that. Not Rosa.'],
    wrong: ['rosa.intimidating: !Say that again. I dare you.', 'amy.surprised: Nope! Not Rosa. Definitely not Rosa.'],
    again: ['rosa.annoyed: I said check the camera. The monitor. In the bullpen. Go.'],
  },
  hitchcock: {
    intro: ['hitchcock.neutral: We didn’t take nothin’.', 'scully.content: We were busy with lunch.',
      'amy.skeptical: It’s eleven PM.', 'hitchcock.smug: Second lunch.',
      'scully.excited: Our lasagna was in the microwave, and then we had exactly three minutes to catch the ice cream truck before it left!',
      'hitchcock.unbothered: Very strict schedule. Dairy waits for no man.'],
    qs: [
      { q: 'Which microwave?', a: ['scully.happy: The break room one, by Charles’s desk. It keeps a log of everything. It’s very fancy.', 'hitchcock.thinking: We named it Kevin. Not that Kevin.'], after: () => { S.flags.microwaveTip = true; } },
      { q: 'Did you see anything?', a: ['scully.thoughtful: I saw smoke. And then I saw ice cream.', 'hitchcock.tired: Best night of my life, honestly.'] },
    ],
    verdict: 'cleared',
    right: ['amy.neutral: Their story sounds completely stupid… but the timing actually works. Probably not them.'],
    wrong: ['hitchcock.annoyed: !Nobody has ever accused us of being *fast* enough to steal something.', 'scully.concerned: That’s actually kind of flattering.', 'amy.annoyed: …They’re right. They couldn’t have pulled this off. Not them.'],
    again: ['scully.content: The ice cream was worth it, by the way.'],
  },
  boyle: {
    intro: ['boyle.awkward: Amy! Hi! Hello. Happy Halloween. I know nothing.', 'amy.skeptical: I haven’t asked you anything.', 'boyle.worried: And I know nothing *about* it!'],
    qs: [
      { q: 'Where were you during the smoke?', a: ['boyle.awkward: Kitchen! Lasagna! My grandmother’s mother’s lasagna. Very time-sensitive.', 'boyle.worried: I was nowhere near my desk. Or the cummerbund. Or my desk.'] },
      { q: 'Why won’t you look at me?', a: ['boyle.awkward: I’m looking at you! I’m looking right at your… general area. Your aura. It’s lovely tonight.'] },
      { q: 'Did you know about the smoke?', a: ['boyle.shocked: Smoke? What smoke? Oh, *that* smoke. Huge surprise. Total surprise.', 'boyle.worried: Who would ever rent a — I mean, who would ever *do* that?'] },
    ],
    verdict: 'suspect',
    right: ['amy.determined: He’s hiding something. But suspicion isn’t evidence. I need proof before I bring him in.'],
    wrong: ['amy.skeptical: …No. He said “lasagna” before I even asked. Charles is definitely hiding something.'],
    again: ['boyle.worried: Amy, I already told you everything I know, which is nothing, which is a normal amount.'],
  },
};
async function interview(who) {
  const I = INTERVIEWS[who];
  if (S.sus[who] !== 'unknown') { await say(...I.again); return; }
  if (!S.flags['met_' + who]) {
    S.flags['met_' + who] = true;
    spend(2);
    await say(...I.intro);
    if (I.after) I.after();
  }
  const asked = new Set();
  const clearLabel = who === 'hitchcock' ? 'Clear them' : `Clear ${SQUAD_NAMES[who]}`;
  for (;;) {
    const opts = I.qs.map((q, i) => ({ label: q.q, value: 'q' + i, cls: asked.has(i) ? 'used' : '' }));
    opts.push({ label: `✓ ${clearLabel}`, value: 'cleared', cls: 'good' });
    opts.push({ label: '⚠ Mark as suspicious', value: 'suspect', cls: 'danger' });
    opts.push({ label: 'Come back later', value: 'later' });
    const v = await choose(opts, { q: `Questioning ${who === 'hitchcock' ? 'Hitchcock & Scully' : SQUAD_NAMES[who]}` });
    if (v === 'later') return;
    if (v.startsWith('q')) {
      const i = +v.slice(1), q = I.qs[i];
      await say(...q.a);
      if (q.after) q.after();
      asked.add(i);
      continue;
    }
    if (v === I.verdict) { await say(...I.right); }
    else { await say(I.wrong[0]); mistake(3, `Wrong call on ${who === 'hitchcock' ? 'Hitchcock & Scully' : SQUAD_NAMES[who]}`); await say(...I.wrong.slice(1)); }
    setSus(who, I.verdict);
    if (SQUAD.every(s => S.sus[s] !== 'unknown')) { S.flags.fullSquad = true; }
    return;
  }
}

/* =========================================================
   Testimony & deduction systems
   ========================================================= */
async function testimony(who, title, statements) {
  const solved = new Set();
  for (;;) {
    const open = statements.filter(s => s.answer && !solved.has(s));
    if (!open.length) return;
    const i = await choose(statements.map((s, k) => ({ label: `${solved.has(s) ? "✓ " : ""}“${s.text}”`, value: k, cls: solved.has(s) ? "used good" : "" })),
      { q: `${title} · ${open.length} lie${open.length > 1 ? 's' : ''} left to break`, ask: 'amy.determined: (Which part of his story doesn’t hold up?)' });
    const s = statements[i];
    if (solved.has(s)) { await say('amy.neutral: (I’ve already broken that one.)'); continue; }
    await say(`${who}.${s.face}: ${s.text}`);
    const move = await choose([
      { label: 'Present evidence', value: 'present', cls: 'primary' },
      { label: 'Press for details', value: 'press' },
      { label: 'Back', value: 'back' },
    ], { q: 'Your move' });
    if (move === 'back') continue;
    if (move === 'press') { spend(1); await say(...s.press); continue; }
    const ev = await present(`Which evidence contradicts this? “${s.text}”`);
    if (!ev) continue;
    if (ev === s.answer) {
      spend(1);
      await contradiction();
      solved.add(s);
      await say(...s.hit);
    } else {
      await say(`amy.determined: Then explain *this*. (${EVIDENCE[ev].title})`);
      await say(s.miss || `${who}.confused: I… don’t see what that has to do with anything.`);
      mistake(3, 'That evidence doesn’t contradict the statement');
    }
  }
}
async function deduce(question, options) {
  for (;;) {
    const v = await choose(options.map((o, i) => ({ label: o.label, value: i })), { q: 'Deduction', ask: `amy.skeptical: (${question})` });
    const o = options[v];
    if (o.correct) { Audio.sfx('clue'); flash(); await say(...o.why); return; }
    await say(...o.why);
    mistake(3, 'Faulty deduction');
  }
}

/* =========================================================
   Mini-games
   ========================================================= */
function cctvGame() {
  const tok = RUN;
  hideDialogue();
  return new Promise(resolve => {
    const mg = cinema(`<div class="mg-card">
      <div class="mg-head"><div><h3>Bullpen Camera 02</h3><p>Scrub through the footage. Capture the frame that shows the thief.</p></div><button class="choice" data-x="close">Close</button></div>
      <div class="cctv-screen" style="background-image:url('${IMG('bullpen')}')">
        <div class="figure"><i></i><b></b><u></u><s></s></div>
        <div class="smoke-layer"></div><div class="scan"></div><div class="noise"></div>
        <div class="cctv-osd"><span class="rec">REC · CAM 02 · BULLPEN</span><span class="ts">10:59:50 PM</span></div>
        <div class="cctv-flash"></div>
      </div>
      <div class="cctv-controls">
        <button class="choice" data-x="play">▶ Play</button>
        <input type="range" min="0" max="100" value="0" step="1" aria-label="Footage timeline">
        <button class="choice primary" data-x="snap">📸 Capture frame</button>
      </div></div>`, 'mg');
    const range = mg.querySelector('input'), smoke = mg.querySelector('.smoke-layer'), fig = mg.querySelector('.figure'), ts = mg.querySelector('.ts');
    let playing = null;
    const fmt = s => { const t = 59 * 60 + 50 + s; const m = Math.floor(t / 60), sec = t % 60; return m >= 60 ? `11:${String(m - 60).padStart(2, '0')}:${String(sec).padStart(2, '0')} PM` : `10:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')} PM`; };
    const smokeAt = s => s < 10 ? 0 : s < 22 ? (s - 10) / 12 * 0.92 : (s >= 48 && s <= 57) ? 0.45 : s > 85 ? Math.max(0.2, 0.92 - (s - 85) / 15 * 0.7) : 0.92;
    const figAt = s => s >= 49 && s <= 56;
    const draw = () => { const s = +range.value; ts.textContent = fmt(s); smoke.style.opacity = smokeAt(s); fig.style.opacity = figAt(s) ? 0.9 : 0; };
    range.oninput = () => { draw(); if (+range.value % 4 === 0) Audio.sfx('key'); };
    draw();
    const stop = () => { clearInterval(playing); playing = null; mg.querySelector('[data-x=play]').textContent = '▶ Play'; };
    const end = v => { stop(); mg.remove(); resolve(tok === RUN ? v : null); };
    mg.querySelectorAll('[data-x]').forEach(b => b.onclick = () => {
      const x = b.dataset.x;
      if (x === 'close') end(false);
      if (x === 'play') {
        if (playing) return stop();
        b.textContent = '❚❚ Pause';
        playing = setInterval(() => { range.value = (+range.value + 1) % 101; draw(); }, 140);
      }
      if (x === 'snap') {
        stop();
        Audio.sfx('shutter');
        const f = mg.querySelector('.cctv-flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
        setTimeout(() => end(figAt(+range.value) ? 'hit' : 'miss'), 450);
      }
    });
  });
}

function keypadGame() {
  const tok = RUN;
  hideDialogue();
  return new Promise(resolve => {
    const mg = cinema(`<div class="mg-card">
      <div class="mg-head"><div><h3>Charles’s Safe</h3><p>A four-digit keypad. Wrong codes cost a minute.</p></div><button class="choice" data-x="close">Step back</button></div>
      <div class="keypad">
        <div class="safe"><div class="display">_ _ _ _</div><div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}<button class="clr" data-k="C">C</button><button data-k="0">0</button><button class="ok" data-k="OK">✓</button></div></div>
        <div class="notes"><h4>Charles’s Note</h4>${has('note') ? '“For Amy. I’m sorry.<br>The code is <b>where we all work</b>,<br>followed by <b>how many seconds the Captain made us wait</b>.”' : 'You haven’t read the note on the locker door yet. Maybe it explains the code.'}</div>
      </div></div>`, 'mg');
    const disp = mg.querySelector('.display');
    let code = '';
    const show = () => { disp.classList.remove('err'); disp.textContent = (code + '____').slice(0, 4).split('').join(' '); };
    const end = v => { document.removeEventListener('keydown', onKey, true); mg.remove(); resolve(tok === RUN ? v : null); };
    const press = k => {
      if (k === 'C') { code = ''; Audio.sfx('key'); return show(); }
      if (k === 'OK') {
        if (code.length < 4) { Audio.sfx('deny'); return; }
        if (code === '9910') { Audio.sfx('unlock'); disp.textContent = 'OPEN'; setTimeout(() => end(true), 700); return; }
        S.safeFails++;
        Audio.sfx('deny'); disp.textContent = 'E R R'; disp.classList.add('err'); code = '';
        try { spend(1); } catch (e) { if (e === MIDNIGHT) { end(null); timeUp(); return; } }
        toast('Wrong code · −1 min', 'The safe beeps angrily', { icon: '✕', kind: 'bad' });
        return;
      }
      if (code.length < 4) { code += k; Audio.sfx('key'); show(); }
    };
    const onKey = e => {
      if (/^[0-9]$/.test(e.key)) { press(e.key); e.stopPropagation(); e.preventDefault(); }
      else if (e.key === 'Enter') { press('OK'); e.stopPropagation(); e.preventDefault(); }
      else if (e.key === 'Backspace') { code = code.slice(0, -1); show(); e.stopPropagation(); e.preventDefault(); }
      else if (e.key === 'Escape') { end(false); e.stopPropagation(); e.preventDefault(); }
    };
    document.addEventListener('keydown', onKey, true);
    mg.querySelectorAll('[data-k]').forEach(b => b.onclick = () => press(b.dataset.k));
    mg.querySelector('[data-x=close]').onclick = () => end(false);
  });
}

function podiumGame() {
  const tok = RUN;
  hideDialogue();
  return new Promise(resolve => {
    const mg = cinema(`<div class="mg-card" style="width:min(92%,640px)">
      <div class="mg-head"><div><h3>The Podium</h3><p class="pmsg">Something about this podium feels wrong. The shield on the front sits slightly crooked.</p></div><button class="choice" data-x="close">Step back</button></div>
      <div class="podium-wrap">
        <svg viewBox="0 0 400 420" role="img" aria-label="Close-up of the briefing room podium">
          <defs>
            <linearGradient id="wood" x1="0" x2="1"><stop offset="0" stop-color="#1b1712"/><stop offset=".5" stop-color="#2e261e"/><stop offset="1" stop-color="#16120e"/></linearGradient>
            <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0c0"/><stop offset=".5" stop-color="#e0a94a"/><stop offset="1" stop-color="#8a5a18"/></linearGradient>
            <clipPath id="opening"><rect x="120" y="110" width="160" height="210" rx="6"/></clipPath>
          </defs>
          <rect x="0" y="0" width="400" height="420" fill="#0f1220"/>
          <path d="M40 40h320l-20 330H60z" fill="url(#wood)" stroke="#000" stroke-width="3"/>
          <rect x="20" y="22" width="360" height="30" rx="4" fill="#3a3027" stroke="#000" stroke-width="3"/>
          <rect x="50" y="370" width="300" height="34" rx="3" fill="#12100d" stroke="#000" stroke-width="3"/>
          <g clip-path="url(#opening)">
            <image href="${IMG('compartment')}" x="80" y="110" width="240" height="210" preserveAspectRatio="xMidYMid slice"/>
            <g class="panel-door"><rect x="120" y="110" width="160" height="210" fill="#241d16" stroke="#0b0907" stroke-width="2"/>
              <path d="M130 120h140M130 310h140" stroke="#ffffff10"/>
              <g class="keyhole" opacity="0"><circle cx="200" cy="200" r="11" fill="#0a0806" stroke="url(#gold)" stroke-width="3"/><rect x="196" y="204" width="8" height="22" rx="2" fill="#0a0806"/></g>
            </g>
          </g>
          <rect x="120" y="110" width="160" height="210" rx="6" fill="none" stroke="#000" stroke-width="2" opacity=".6"/>
          <g class="emblem" style="transform-origin:200px 200px">
            <path d="M200 150c22 10 38 10 52 6v40c0 34-24 54-52 66-28-12-52-32-52-66v-40c14 4 30 4 52-6z" fill="#13213f" stroke="url(#gold)" stroke-width="5" transform="rotate(4 200 200)"/>
            <text x="200" y="214" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="44" fill="url(#gold)" transform="rotate(4 200 200)">99</text>
          </g>
        </svg>
        <button class="podium-hit" style="left:35%;top:33%;width:30%;height:32%" aria-label="Examine the shield"></button>
      </div></div>`, 'mg');
    const msg = mg.querySelector('.pmsg'), hit = mg.querySelector('.podium-hit');
    const emblem = mg.querySelector('.emblem'), keyhole = mg.querySelector('.keyhole'), door = mg.querySelector('.panel-door');
    let step = 0;
    const end = v => { mg.remove(); resolve(tok === RUN ? v : null); };
    mg.querySelector('[data-x=close]').onclick = () => end(false);
    hit.onclick = () => {
      if (step === 0) {
        step = 1; Audio.sfx('creak');
        emblem.classList.add('slid'); keyhole.setAttribute('opacity', '1');
        msg.textContent = 'The shield slides up on a hidden track. Behind it: a keyhole.';
        hit.setAttribute('aria-label', 'Use the Shield Key');
      } else if (step === 1) {
        step = 2; Audio.sfx('unlock');
        msg.textContent = 'The Shield Key fits perfectly. Click. The panel slides open…';
        setTimeout(() => { Audio.sfx('whoosh'); door.classList.add('open'); }, 500);
        setTimeout(() => { msg.textContent = 'There it is. Click to take it.'; hit.setAttribute('aria-label', 'Take the cummerbund'); step = 3; }, 1900);
      } else if (step === 3) {
        end(true);
      }
    };
  });
}

/* =========================================================
   Hotspots per scene
   ========================================================= */
const HOTSPOTS = {
  bullpen: [
    { id: 'stand', label: 'Where the cummerbund stood', x: 39, y: 30, w: 13, h: 15, run: async () => {
      if (has('residue')) return say('amy.neutral: The stand is still empty. Still sticky. Still smells like cotton candy.');
      spend(1);
      await say('> The display stand is empty. No broken glass. No struggle. Just a thin, oily film on the velvet.', 'amy.skeptical: It smells… like cotton candy? That’s not smoke from a fire. That’s *theatrical fog fluid*.', 'amy.determined: Someone brought a fog machine. This was planned.');
      gain('residue');
    } },
    { id: 'monitor', label: 'Security monitor', x: 32.5, y: 40, w: 8, h: 10, run: async () => {
      if (has('cctv')) return say('amy.neutral: I already have the frame I need from this footage.');
      if (!S.flags.rosaTip) return say('amy.neutral: The bullpen security feed. Rosa set up this system. I should ask her about it first.');
      spend(3);
      await say('amy.determined: Okay. Camera two covers the whole bullpen. Let’s see what it caught when the smoke went off.');
      hideDialogue();
      for (;;) {
        const r = await cctvGame();
        if (r === 'hit') {
          await say('amy.excited: There! When the smoke thins for a second.', 'amy.determined: Beige shirt. Patterned tie. Crouching by *Charles’s desk*, holding a covered dish.');
          gain('cctv');
          return;
        }
        if (r === 'miss') {
          spend(1);
          const again = await choose([{ label: 'Keep looking', value: 1, cls: 'primary' }, { label: 'Stop for now', value: 0 }], { ask: 'amy.annoyed: Just smoke. I need a frame where I can actually see something. Maybe where the smoke is thinner?' });
          if (again) continue;
        }
        return;
      }
    } },
    { id: 'toDesk', label: 'Charles’s desk', door: true, x: 52, y: 52, w: 18, h: 18, run: () => travel('desk') },
    { id: 'holtDoor', label: 'Captain’s office', door: true, x: 5, y: 15, w: 11, h: 26, run: async () => {
      if (S.unlocked.includes('holt')) return travel('holt');
      await say('> A sign hangs on the Captain’s door: “DO NOT DISTURB. HEIST IN PROGRESS. THIS MEANS YOU, PERALTA.”', 'amy.neutral: No reason to bother the Captain. Yet.');
    } },
    { id: 'stairs', label: 'Stairs to the roof', door: true, x: 27, y: 13, w: 11, h: 18, show: () => S.unlocked.includes('rooftop'), run: () => travel('rooftop') },
    { id: 'lockers', label: 'Locker room', door: true, x: 80, y: 18, w: 10, h: 28, show: () => S.unlocked.includes('lockers'), run: () => travel('lockers') },
    { id: 'brief', label: 'Briefing room', door: true, x: 92, y: 22, w: 8, h: 26, show: () => S.unlocked.includes('briefing'), run: () => travel('briefing') },
  ],
  desk: [
    { id: 'papers', label: 'Paperwork', x: 31, y: 56, w: 17, h: 14, run: async () => {
      if (has('receipt')) return say('amy.neutral: Recipes, case files, and a recipe *for* case files. Charles, what?');
      if (S.sus.boyle === 'unknown') return say('amy.neutral: Charles’s desk. Recipes, case files… I don’t have a reason to dig through his stuff. Yet.');
      spend(1);
      await say('> Under a recipe for “Sexy Soup” and three takeout menus, there’s a crumpled receipt.', 'amy.surprised: “FOG-MASTER 3000, party rental. Paid by C. Boyle. Picked up today, 6:12 PM.”', 'amy.determined: Charles rented a fog machine. On the day of the heist.');
      gain('receipt');
    } },
    { id: 'phone', label: 'Charles’s phone', x: 49, y: 74, w: 10, h: 7, run: async () => {
      if (S.chapter === 5 && !has('texts')) {
        spend(1);
        await say('> The phone is unlocked. The passcode is 1-2-3-4. Of course it is.', '> A new message from “JAKE 🐍”:', '> “phase 2 is a GO 🐍 grabbing supplies from the roof. DO NOT tell Ames. delete this. wait did u delete it”', 'amy.determined: The roof. Got you.');
        gain('texts');
        if (!S.unlocked.includes('rooftop')) S.unlocked.push('rooftop');
        toast('New location', 'Rooftop unlocked', { icon: '🗺️' });
        return;
      }
      await say('> The lock screen is a photo of Charles and Nikolaj in matching Halloween sweaters.', 'amy.happy: …Okay, that’s adorable.');
    } },
    { id: 'dog', label: 'Green dog figurine', x: 38, y: 70, w: 8, h: 18, run: async () => {
      await say('> A small green dog figurine, lovingly dusted. It bobbles slightly.', 'amy.happy: Noice.');
      unlock('noice');
    } },
    { id: 'microwave', label: 'Break room microwave', x: 60, y: 15, w: 15, h: 9, run: async () => {
      if (has('microwave')) return say('amy.neutral: The microwave log. Hitchcock and Scully’s alibi holds.');
      if (!S.flags.microwaveTip && S.sus.hitchcock === 'unknown') return say('amy.neutral: The break room microwave. It has a little screen. Fancy.');
      spend(1);
      await say('> The microwave has a built-in log. Somebody programmed it. Probably Gina.', '> “Lasagna, high power. Started 10:58 PM. Door opened 11:01 PM.”', 'amy.skeptical: So they really did run out of here for ice cream right when the smoke hit. Unbelievable. And true.');
      gain('microwave');
    } },
    { id: 'nameplate', label: 'Nameplate', x: 58, y: 83, w: 24, h: 10, run: () => say('> DET. CHARLES BOYLE. Someone has added a tiny sticker of a heart next to it.') },
    { id: 'back', label: 'Back to the bullpen', door: true, x: 1, y: 28, w: 8, h: 40, run: () => travel('bullpen') },
  ],
  holt: [
    { id: 'holtTalk', label: 'Captain Holt', x: 27, y: 44, w: 18, h: 26, run: async () => {
      if (S.flags.holtCleared) return say('holt.amused: Detective. Kevin sends his regards. He says your deduction was “acceptable.” That is his highest praise.');
      await say('holt.deadpan: I have nothing further to say. Cheddar also has nothing to say. We are united.');
    } },
    { id: 'planner', label: 'Desk planner', x: 51, y: 61, w: 10, h: 9, run: async () => {
      if (has('schedule')) return say('amy.neutral: “Video call with Kevin. Do NOT be late.” Underlined twice.');
      spend(1);
      await say('> Captain Holt’s planner is organized to the minute. Of course it is.', '> “10:50 to 11:15 PM: Video call with Kevin. Re: the opera. Do NOT be late. Kevin will notice.”', 'amy.surprised: The cummerbund vanished at 11:00. Holt was on a video call the entire time.');
      gain('schedule');
    } },
    { id: 'leash', label: 'Coat stand', x: 73, y: 20, w: 10, h: 36, run: async () => {
      await say('> Captain Holt’s dress uniform. Hanging next to it: a small, perfectly coiled leash with a tag that reads “CHEDDAR. GOOD BOY. (VERIFIED.)”', 'amy.happy: Even Cheddar’s leash is more organized than most people.');
      unlock('good_boy');
    } },
    { id: 'trophy', label: '“99” trophy', x: 14, y: 8, w: 8, h: 8, run: () => say('> A wooden “99” plaque. Spotless. Dusted daily, probably by Holt himself, probably at 6:00 AM.') },
    { id: 'flag', label: 'Desk flag', x: 64, y: 59, w: 6, h: 12, run: () => say('holt.neutral: That flag stays where it is, Detective. As do I.') },
  ],
  rooftop: [
    { id: 'walkie', label: 'Something on the planter', x: 44, y: 50, w: 17, h: 11, run: async () => {
      if (has('walkie')) return say('amy.neutral: Jake’s walkie. Still crackling.');
      spend(1);
      await say('> Wedged between the plants: a walkie-talkie with a sticker that says “PROPERTY OF DETECTIVE JAKE PERALTA. HEIST DIVISION.”');
      Audio.sfx('crackle');
      await say('jake: *(over the walkie)* …Charles, it’s me. Change of plans. Locker room. Now. Is this thing on? Over? …OVER?', 'amy.determined: The locker room. He’s still in the building.');
      gain('walkie');
      if (!S.unlocked.includes('lockers')) S.unlocked.push('lockers');
      toast('New location', 'Locker room unlocked', { icon: '🗺️' });
    } },
    { id: 'vent', label: 'Steaming vent', x: 37, y: 14, w: 8, h: 40, run: () => say('amy.skeptical: Just a vent. For a second I thought Jake had rented a *second* fog machine.') },
    { id: 'door', label: 'Back inside', door: true, x: 67, y: 12, w: 12, h: 60, run: () => travel('bullpen') },
  ],
  lockers: [
    { id: 'jakeLocker', label: 'Jake’s locker', x: 29, y: 11, w: 10, h: 73, show: () => S.flags.jakeRevealed, run: () => say('> Jake’s locker. Still empty. Still deeply embarrassing for Jake.') },
    { id: 'note', label: 'Note on the door', x: 71, y: 31, w: 9, h: 20, show: () => S.chapter >= 6, run: async () => {
      if (has('note')) return say('> “The code is where we all work, followed by how many seconds the Captain made us wait.”');
      spend(1);
      await say('> A note taped to the inside of the locker door, in Charles’s loopy handwriting:', '> “For Amy. I’m sorry. The code is *where we all work*, followed by *how many seconds the Captain made us wait*.”', 'amy.skeptical: Where we all work… and the countdown. Okay, Charles. Okay.');
      gain('note');
    } },
    { id: 'safe', label: 'Small safe', x: 53, y: 30, w: 16, h: 33, show: () => S.chapter >= 6, run: async () => {
      if (has('key')) return say('amy.neutral: The safe is open. Empty now.');
      hideDialogue();
      const fails = S.safeFails;
      const ok = await keypadGame();
      if (!ok) return;
      await say('> The safe swings open. Inside, on a folded napkin, is a brass key.', '> It has no number. Instead, the tag is stamped with a *shield*, and under the shield is a tiny engraved *podium*.');
      gain('key');
      if (fails === 0 && S.safeFails === 0) unlock('first_try');
    } },
    { id: 'mug', label: 'Mug', x: 55, y: 17, w: 6, h: 8, show: () => S.chapter >= 6, run: () => say('> A mug that says “WORLD’S OKAYEST DETECTIVE.” A gift from Jake. Charles uses it every day.') },
    { id: 'candy', label: 'Candy corn', x: 60, y: 75, w: 8, h: 9, show: () => S.chapter >= 6, run: () => say('amy.skeptical: Candy corn. In a labeled container. Charles, I’m proud of you.') },
    { id: 'out', label: 'Back to the bullpen', door: true, x: 1, y: 30, w: 10, h: 45, run: () => travel('bullpen') },
  ],
  briefing: [
    { id: 'podium', label: 'The podium', x: 46, y: 41, w: 11, h: 34, run: async () => {
      if (S.chapter !== 7) return say('amy.neutral: The podium where Holt presented the cummerbund.');
      if (!S.flags.podiumLooked) { S.flags.podiumLooked = true; spend(2); }
      await say('amy.determined: Where the heist began. Holt presented the cummerbund right here.');
      hideDialogue();
      const ok = await podiumGame();
      if (ok) S.flags.found = true;
    } },
    { id: 'tv', label: 'Briefing screen', x: 20, y: 24, w: 18, h: 18, run: () => say('> The screen shows the precinct seal on a loop. Someone has added a tiny pumpkin to it.') },
    { id: 'board', label: 'Whiteboard', x: 82, y: 20, w: 15, h: 33, run: () => say('> A diagram titled “HEIST PLAN. DO NOT READ, AMY.” It is just a drawing of a cummerbund wearing sunglasses.', 'amy.annoyed: Classic Jake.') },
    { id: 'out', label: 'Back to the bullpen', door: true, x: 45, y: 16, w: 22, h: 22, show: () => S.chapter !== 7, run: () => travel('bullpen') },
  ],
  interrogation: [
    { id: 'out', label: 'Back to the bullpen', door: true, x: 9, y: 16, w: 16, h: 52, run: () => travel('bullpen') },
  ],
};

const ON_ENTER = {
  holt: async () => {
    if (S.chapter !== 4 || S.flags.holtMet) return;
    S.flags.holtMet = true;
    Audio.music('tension');
    spend(2);
    await say(
      'holt.neutral: Detective Santiago. You have entered my office without knocking. Bold.',
      'amy.determined: Sir, with respect: where is the cummerbund? Charles told me everything. You planned the theft.',
      'holt.disapproving: How dare you.',
      'holt.annoyed: You would accuse me, your commanding officer, on the word of *Charles Boyle*?',
      'holt.serious: Why would I ever team up with Boyle? I already have a partner. *Cheddar.*',
      'holt.deadpan: Cheddar is loyal, discreet, and has never once described a soup as “sexy.” He is a far more competent partner.',
      'amy.skeptical: (He’s offended. Genuinely offended. That’s his most sincere face… which looks exactly like all his other faces.)',
      'amy.neutral: (Something about Charles’s story doesn’t add up. If I can prove Holt couldn’t have been involved…)',
    );
    Audio.music('mystery');
  },
  lockers: async () => {
    if (S.chapter !== 5 || S.flags.jakeRevealed) return;
    await jakeReveal();
  },
};

/* =========================================================
   Story
   ========================================================= */
const CHAPTER_NAMES = { 1: 'The Heist', 2: 'The Investigation', 3: 'Charles Cracks', 4: 'The Captain', 5: 'The Mastermind', 6: 'The Real Clue', 7: 'Back to the Beginning' };

async function characterSelect() {
  const picks = [
    { id: 'terry', name: 'Terry Jeffords', face: 'happy', remark: 'amy.skeptical: Too many muscles. This ain’t you.' },
    { id: 'boyle', name: 'Charles Boyle', face: 'happy', remark: 'amy.skeptical: You’re not as sassy as him, so no.' },
    { id: 'gina', name: 'Gina Linetti', face: 'confident', remark: 'gina.judging: No one can be Gina. Not even Gina, some days.' },
    { id: 'rosa', name: 'Rosa Diaz', face: 'neutral', remark: 'rosa.skeptical: You’re too sweet and innocent to be me.' },
    { id: 'hitchcock', name: 'Hitchcock & Scully', face: 'smug', remark: 'amy.annoyed: Duhhh? Seriously?' },
    { id: 'amy', name: 'Amy Santiago', face: 'determined' },
  ];
  const tried = new Set();
  for (;;) {
    await line('holt.amused: Before you begin, Detective… who exactly are you planning to be tonight?', true);
    const grid = cinema(picks.map((p, i) => `<button class="pick ${tried.has(p.id) ? 'nope' : ''}" data-p="${p.id}" style="animation-delay:${i * 70}ms"><img src="${portrait(p.id, p.face)}" alt=""><span>${esc(p.name)}</span></button>`).join(''), 'select-grid');
    const id = await new Promise(r => grid.querySelectorAll('[data-p]').forEach(b => { b.onclick = () => { Audio.sfx('click'); r(b.dataset.p); }; b.onmouseenter = () => Audio.sfx('hover'); }));
    grid.remove();
    if (id === 'amy') {
      if (['terry', 'boyle', 'gina', 'rosa', 'hitchcock'].every(x => tried.has(x))) unlock('bit');
      await say('amy.excited: That’s my girl. Now win it.');
      return;
    }
    tried.add(id);
    await say(picks.find(p => p.id === id).remark);
  }
}

async function ch1() {
  showHud(false);
  setScene('podium');
  FX.stop(true);
  Audio.music('title');
  await chapterCard(1, 'The Heist', 'It’s Halloween at the 99th Precinct.');
  await say(
    '> 10:52 PM. The annual Halloween Heist is about to begin.',
    'holt.serious: Detectives. Tonight is the annual Halloween Heist.',
    'holt.deadpan: I will now present the prize. Please contain your excitement. I certainly will.',
  );
  await go('reveal');
  await itemReveal({ label: 'The prize', engraving: 'BEST HUMAN<small>/ DETECTIVE /</small>', sub: 'The Championship Cummerbund · click to continue' });
  await say(
    'holt.neutral: The Championship Cummerbund. Engraved, at considerable expense: “Best Human slash Detective.”',
    'holt.serious: Whoever possesses it at the end of the night, *midnight* precisely, earns the title of Best Detective.',
    'amy.determined: (Best Detective. That’s me. That has always been me. I’ve been training for this since the fourth grade.)',
    '> Amy scans the room. Terry. Gina. Rosa. Charles. Hitchcock and Scully. Everyone is here…',
    'amy.skeptical: …except Jake. Where is Jake?',
    'holt.neutral: The cummerbund stays here in the bullpen. The heist begins in exactly one minute.',
    'holt.serious: I will count down the final ten seconds. Personally. With feeling.',
  );
  hideDialogue();
  Audio.music(null);
  // countdown
  const shouts = { 7: ['terry', 'Nobody move!', 22, 30, -4], 5: ['gina', 'I’m filming this.', 66, 24, 3], 3: ['boyle', 'Wow, it’s so warm in here, haha!', 30, 62, -2] };
  for (let n = 10; n >= 1; n--) {
    const c = cinema(`<span>${n}</span>`, 'countdown');
    Audio.sfx(n % 2 ? 'tick' : 'tock');
    if (shouts[n]) { const [, t, x, y, r] = shouts[n]; const s = cinema(esc(t), 'shout'); s.style.cssText = `left:${x}%;top:${y}%;--r:${r}deg`; setTimeout(() => s.remove(), 1600); }
    await sleep(settings.reduce ? 500 : 900);
    c.remove();
  }
  stage.classList.add('flicker');
  Audio.sfx('boom');
  await sleep(1300);
  setScene('smoke', { kb: false });
  stage.classList.remove('flicker');
  Audio.sfx('hiss'); Audio.sfx('whoosh');
  FX.smoke(1.2);
  shakeStage();
  const yells = [['MY EYES!', 14, 22, -6], ['WHO BROUGHT A FOG MACHINE?!', 52, 16, 4], ['TERRY HATES FOG!', 20, 58, 3], ['Is that… cotton candy?', 60, 60, -3]];
  for (const [t, x, y, r] of yells) { const s = cinema(esc(t), 'shout'); s.style.cssText = `left:${x}%;top:${y}%;--r:${r}deg`; setTimeout(() => s.remove(), 1600); await sleep(650); }
  await sleep(900);
  FX.density(0.5);
  setScene('empty', { kb: false });
  await sleep(900);
  FX.fadeOut(2500);
  Audio.sfx('sting');
  shakeStage();
  await bigText('THE CUMMERBUND IS GONE.', 2200);
  Audio.music('mystery');
  await say(
    'holt.annoyed: Hm. Well. That was fast.',
    'holt.serious: Someone in this room has the cummerbund. Everyone is a suspect.',
    'amy.determined: Not for long. Nobody leave! I’m taking charge of this investigation.',
  );
  await characterSelect();
}

async function ch2() {
  Audio.music('mystery');
  await chapterCard(2, 'The Investigation', 'Sixty minutes until midnight.');
  setScene('bullpen');
  showHud(true); setChapterLabel(); updateClock();
  if (!S.flags.tutorial) {
    S.flags.tutorial = true;
    await say(
      'amy.determined: Okay. Timeline, alibis, evidence. I have until midnight. Sixty minutes. Plenty of time. Unless it isn’t.',
      '> Question the squad on the left. Click glowing spots to investigate, and press Tab to show them all. Use Travel to move between rooms.',
      '> Everything takes time. Mistakes cost extra. If the clock strikes midnight, nobody wins.',
    );
  }
  await roam('Question the squad and find evidence that points to the thief.', () => S.sus.boyle === 'suspect' && has('cctv') && has('receipt'));
  await say('amy.determined: A CCTV still of him at his desk and a fog machine receipt with his name on it.', 'amy.determined: Charles, you have some explaining to do.');
}

async function ch3() {
  await chapterCard(3, 'Charles Cracks', 'Interrogation Room B. The good one.');
  setScene('interrogation');
  showHud(true); setChapterLabel();
  Audio.music('tension');
  spend(1);
  await say(
    'boyle.worried: Amy, this room has a very accusatory energy.',
    'amy.determined: Sit down, Charles. Tell me again where you were when the cummerbund disappeared.',
    'boyle.awkward: Easy. Simple. Here is my completely true story.',
  );
  await testimony('boyle', 'Charles’s testimony', [
    { text: 'I was in the kitchen the whole time, checking on my lasagna.', face: 'awkward', answer: 'cctv',
      press: ['amy.skeptical: The *whole* time?', 'boyle.worried: The whole time! Lasagna requires constant emotional support.'],
      hit: ['amy.determined: The bullpen camera caught someone in a beige shirt and patterned tie crouched by *your desk* during the smoke.', 'boyle.shocked: !That could be anyone who dresses exactly like me and owns my exact tie!'] },
    { text: 'And I had no idea there would be smoke! I was as surprised as everyone!', face: 'worried', answer: 'receipt',
      press: ['amy.skeptical: Totally surprised?', 'boyle.awkward: Shocked. Gobsmacked. My gob has never been more smacked.'],
      hit: ['amy.determined: “FOG-MASTER 3000. Paid by C. Boyle. Picked up today at 6:12 PM.”', 'boyle.shocked: !You went through my receipts?! Those are very personal receipts!'] },
    { text: 'Honestly, the cummerbund is probably out of the building by now.', face: 'neutral', answer: null,
      press: ['amy.skeptical: Why are you so sure?', 'boyle.awkward: It’s… a feeling? I have a lot of feelings. You know that about me.', 'amy.neutral: (That one’s just Charles being Charles. The lies are elsewhere.)'] },
  ]);
  Audio.music('mystery');
  await say(
    'boyle.shocked: !Okay! OKAY! I took it! I’m sorry!',
    'boyle.worried: But it wasn’t my idea. *Captain Holt* told me to take it. He planned the whole thing!',
    'amy.surprised: Captain Holt?!',
    'boyle.loving: He said, and I quote, “Charles, you are the only one I trust.” It was beautiful. I cried a little.',
    'boyle.neutral: The cummerbund is hidden in his office.',
    'amy.determined: Then that’s exactly where I’m going.',
  );
  gain('statement');
  setSus('boyle', 'lying');
  if (!S.unlocked.includes('holt')) S.unlocked.push('holt');
  toast('New location', 'Captain Holt’s office unlocked', { icon: '🗺️' });
}

async function ch4() {
  await chapterCard(4, 'The Captain', 'Never accuse a captain without evidence.');
  setScene('bullpen');
  showHud(true); setChapterLabel();
  Audio.music('mystery');
  await roam('Confront Captain Holt in his office.', () => S.flags.holtMet);
  await roam('Find proof that Holt wasn’t involved.', () => has('schedule'));
  await deduce('What does Holt’s schedule prove?', [
    { label: 'Holt was on a video call with Kevin when the cummerbund vanished. He couldn’t have been giving Charles orders.', correct: true,
      why: ['amy.excited: Holt was on camera with Kevin from 10:50 to 11:15. He couldn’t have been running a heist.', 'holt.amused: Kevin will be pleased to learn that his opera lecture is admissible evidence.', 'amy.neutral: I’m sorry, sir. Charles lied to me. And I’m going to find out why.', 'holt.deadpan: See that you do. And Detective… well reasoned.'] },
    { label: 'Holt loves the opera, so he’s too cultured to steal.', why: ['amy.skeptical: (No. That’s not evidence, that’s a compliment.)'] },
    { label: 'Kevin stole the cummerbund over video chat.', why: ['amy.annoyed: (That’s… physically impossible. Focus, Santiago.)'] },
  ]);
  S.flags.holtCleared = true;
}

async function ch5() {
  await chapterCard(5, 'The Mastermind', 'Charles’s story doesn’t add up.');
  setScene('interrogation');
  showHud(true); setChapterLabel();
  Audio.music('tension');
  spend(1);
  await say('> Back in the interrogation room. Charles is sweating through his cardigan.', 'amy.determined: Charles. I just came from the Captain’s office. Try again.');
  await testimony('boyle', 'Charles’s second story', [
    { text: 'Captain Holt planned the whole thing! He gave me direct orders!', face: 'worried', answer: 'schedule',
      press: ['amy.skeptical: Direct orders? When?', 'boyle.awkward: Right at eleven! On the dot! Very captain-y of him.'],
      hit: ['amy.determined: At eleven on the dot, Captain Holt was on a video call with Kevin about the opera. *He couldn’t have been giving you orders.*', 'boyle.shocked: !The opera?! Who schedules opera calls during a heist?!'] },
    { text: 'And you know I’m a terrible liar, so I must be telling the truth!', face: 'proud', answer: null,
      press: ['amy.skeptical: That’s… not how logic works, Charles.', 'boyle.confused: It’s not?'] },
  ]);
  Audio.music('mystery');
  await say(
    'boyle.worried: …Fine. Holt had nothing to do with it.',
    'boyle.awkward: *Jake* asked me to lie. He’s been planning this for months. The smoke, the fake confession, sending you after the Captain. It was all Jake.',
    'amy.annoyed: !JAKE.',
    'boyle.worried: I was supposed to keep you busy while he handled the real heist. I’m so sorry, Amy. He made me pinky swear. You know what a pinky swear means to me.',
    'amy.determined: Where is he?',
    'boyle.confused: He already left! He texted me something about “phase two”… on my phone. Which is on my desk. Which I am now realizing was a bad place to leave it.',
  );
  await roam('Find out where Jake went. Check Charles’s phone on his desk.', () => S.flags.jakeRevealed);
}

async function jakeReveal() {
  Audio.music('jake');
  spend(2);
  await say('> The locker room is quiet. Then a familiar voice echoes off the metal.');
  const sp = cinema(`<img src="${IMG('jake')}" alt="Jake Peralta">`, 'spotlight');
  await sleep(700);
  await say(
    'jake: Well, well, well. If it isn’t Amy Santiago. Took you long enough.',
    'amy.annoyed: Jake.',
    'jake: That’s right. It was me. *Me.* I planned everything. The smoke. Charles’s fake confession. The Holt distraction. All of it.',
    'jake: Months of planning. I’m a genius. A heist genius. A *heinius*.',
    'amy.skeptical: That is not a word.',
    'jake: And you’re too late, Santiago. Because the cummerbund is right… in… HERE!',
  );
  hideDialogue();
  const door = cinema('', 'locker-door');
  Audio.sfx('creak');
  door.classList.add('open');
  await sleep(1100);
  Audio.music(null);
  await say('> …', '> The locker is empty.', 'jake: …', 'amy.surprised: …');
  Audio.sfx('sad');
  await say(
    'jake: !Okay. So. That’s — no. No no no no no. It was RIGHT HERE. I put it right here!',
    'jake: Someone stole it from *me*? That’s MY move! That is literally the entire heist!',
    'jake: Okay. Cool. Cool cool cool cool cool. No doubt no doubt no doubt. I’m gonna find it before you do. Peralta out!',
  );
  sp.classList.add('out');
  Audio.sfx('whoosh');
  await sleep(600);
  sp.remove(); door.remove();
  S.flags.jakeRevealed = true;
  Audio.music('mystery');
  await say('amy.neutral: (If Jake didn’t have the cummerbund… then someone moved it after the original theft.)');
  await deduce('Who could have moved the cummerbund out of Jake’s locker?', [
    { label: 'Captain Holt', why: ['amy.skeptical: (Holt was on a call with Kevin. And he would never touch a locker this sticky.)'] },
    { label: 'Charles Boyle', correct: true, why: ['amy.determined: Charles. He helped Jake hide it. He was the only other person who knew which locker it was in.', 'amy.neutral: And he felt guilty the entire night. I need to talk to him one more time.'] },
    { label: 'Gina Linetti', why: ['amy.annoyed: (Gina was live-streaming the whole night. Nine thousand witnesses. Eleven if you count the bots.)'] },
    { label: 'Jake did it himself, as a double bluff', why: ['amy.skeptical: (No. Jake looked genuinely devastated. That wasn’t acting. Jake can’t act.)'] },
  ]);
}

async function ch6() {
  await chapterCard(6, 'The Real Clue', 'Something Jake never knew about.');
  setScene('bullpen');
  showHud(true); setChapterLabel();
  Audio.music('mystery');
  spend(1);
  await say(
    '> Charles is waiting at his desk, holding a lasagna like a security blanket.',
    'boyle.worried: Amy… I feel terrible. Jake’s my best friend. But you’re my *other* best friend. My best friend-in-law.',
    'amy.neutral: Charles. Did you move the cummerbund?',
    'boyle.awkward: I… might have. After Jake hid it, I felt so guilty that I moved it somewhere he would never think to look.',
    'boyle.proud: Somewhere only a *real* detective would figure out.',
    'boyle.loving: I left you one last clue. Something Jake never knew about. Check my locker. You’ll figure out the rest. You always do.',
  );
  await roam('Search Charles’s locker in the locker room.', () => has('key'));
  await deduce('The key has a shield and a tiny podium on its tag. Where does it point?', [
    { label: 'The bullpen', why: ['amy.skeptical: (The bullpen has no shield like that. And no podium.)'] },
    { label: 'Captain Holt’s office', why: ['amy.skeptical: (Holt’s office has plenty of shields, but no podium. And Charles isn’t brave enough to hide anything in there.)'] },
    { label: 'The briefing room', correct: true, why: ['amy.excited: The briefing room! Where the heist began. Holt presented the cummerbund at that podium, and the podium has a shield on the front!'] },
    { label: 'The rooftop', why: ['amy.annoyed: (That’s where Jake went. Charles would hide it somewhere Jake would never look.)'] },
  ]);
  if (!S.unlocked.includes('briefing')) S.unlocked.push('briefing');
  toast('New location', 'Briefing room unlocked', { icon: '🗺️' });
}

async function ch7() {
  await chapterCard(7, 'Back to the Beginning', 'Where it all started.');
  setScene(S.scene && SCENES[S.scene].travel ? S.scene : 'lockers');
  showHud(true); setChapterLabel();
  Audio.music('mystery');
  await roam('Return to the briefing room and examine the podium.', () => S.flags.found);
  Audio.music(null);
  await itemReveal({ label: 'Found it', img: IMG('compartment'), engraving: 'BEST HUMAN<small>/ DETECTIVE /</small>', sub: 'The exact same cummerbund Holt placed in front of everyone · click to continue' });
  S.endTime = S.time;
  await say(
    '> The exact same cummerbund Holt placed in front of everyone at the beginning of the night.',
    '> Amy turns it over. The engraving catches the light.',
    'amy.excited: I found it. I actually found it!',
  );
}

async function ch8() {
  showHud(false);
  $('squad').hidden = true;
  await chapterCard(0, 'Best Human', 'Case closed.');
  setScene('bullpen');
  Audio.music('victory');
  const { t, ap } = clockText(S.endTime ?? S.time);
  await say(
    '> Amy returns to the bullpen with the cummerbund. Everyone is there.',
    'terry.happy: Santiago! You actually did it!',
    'gina.playful: Okay, I’m posting this. Caption: “Binder queen wins again.” You’re welcome.',
    'rosa.smile: …Nice.',
    'scully.happy: We made it to the ice cream truck, by the way.',
    'hitchcock.smug: Thanks for asking.',
    `holt.neutral: Detective Santiago is in possession of the cummerbund at ${t} ${ap}. I hereby confirm the result.`,
    'holt.amused: Amy Santiago is the winner of this year’s Halloween Heist. Congratulations. I am smiling on the inside.',
    '> Then the bullpen door swings open.',
  );
  const sp = cinema(`<img src="${IMG('jake')}" alt="Jake Peralta">`, 'spotlight');
  await sleep(600);
  await say(
    'jake: Okay. I’ve accepted it. I have completely accepted defeat. I’m at peace. Mostly. Ninety percent.',
    '> Jake raises his glass.',
    'jake: Amy. You didn’t just find the cummerbund. You figured out the *entire heist*.',
    'jake: You saw through Charles.',
    'jake: You stood up to Holt.',
    'jake: You exposed me. Which, rude. But very impressive.',
    'jake: And you solved the final clue. A clue *I* didn’t even know existed.',
    'jake: So. To Amy Santiago. Best Detective. And… *Best Human*.',
  );
  Audio.sfx('clink');
  setTimeout(() => Audio.sfx('cheer'), 300);
  FX.confetti(220);
  await say('boyle.loving: BEST HUMAN! BEST HUMAN! BEST HUMAN!', 'amy.happy: Thanks, Jake. Thanks, everyone.', 'amy.excited: And for the record? I’m making a binder about this.');
  sp.remove();
  hideDialogue();
  FX.confetti(160);
  await itemReveal({ label: 'Case closed', engraving: 'BEST HUMAN<small>/ DETECTIVE /</small>', sub: 'Click to see your results' });
  await results();
}

const CHAPTERS = { 1: ch1, 2: ch2, 3: ch3, 4: ch4, 5: ch5, 6: ch6, 7: ch7, 8: ch8 };

/* =========================================================
   Endings & results
   ========================================================= */
function rankFor() {
  const left = DEADLINE - (S.endTime ?? S.time);
  if (S.mistakes === 0 && left >= 15) return ['S', 'Best Human', 'Flawless detective work. Jake is still writing you a speech.'];
  if (S.mistakes <= 1 && left >= 8) return ['A', 'Best Detective', 'Sharp, fast and nearly perfect. The binder is proud of you.'];
  if (S.mistakes <= 3) return ['B', 'Solid Detective', 'You got there. Holt would call it “acceptable,” which from him is high praise.'];
  return ['C', 'Lucky Detective', 'Case closed, but it was close. Maybe a fourth supplemental binder?'];
}
async function results() {
  store.del(SAVE_KEY);
  const left = DEADLINE - (S.endTime ?? S.time);
  const [r, name, line2] = rankFor();
  unlock('case_closed');
  if (r === 'S') unlock('best_human');
  if (S.mistakes === 0) unlock('flawless');
  if (left >= 20) unlock('speed');
  if (!S.hints) unlock('no_hints');
  if (S.flags.fullSquad) unlock('full_squad');
  if (EV_ORDER.every(has)) unlock('thorough');
  Audio.sfx('fanfare');
  const { t, ap } = clockText(S.endTime ?? S.time);
  const c = cinema(`<div class="results-card">
    <div class="chapter-card" style="position:static;background:none;animation:none"><div class="num">Detective rank</div></div>
    <div class="rank">${r}</div><div class="rank-name">${esc(name)}</div><p style="color:var(--muted);font:500 15px var(--ui)">${esc(line2)}</p>
    <div class="stats"><div class="stat"><b>${t} ${ap}</b><span>Solved at</span></div><div class="stat"><b>${left} min</b><span>To spare</span></div><div class="stat"><b>${S.mistakes}</b><span>Mistakes</span></div><div class="stat"><b>${S.evidence.length}/${EV_ORDER.length}</b><span>Evidence</span></div><div class="stat"><b>${S.hints}</b><span>Hints used</span></div></div>
    <div class="btns"><button class="btn primary" data-r="credits">Roll credits</button><button class="btn" data-r="again">Play again</button><button class="btn" data-r="ach">Achievements</button><button class="btn" data-r="title">Title screen</button></div></div>`, 'results');
  c.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
    const x = b.dataset.r;
    if (x === 'credits') credits();
    if (x === 'again') { c.remove(); newGame(); }
    if (x === 'ach') openAchievements();
    if (x === 'title') { c.remove(); toTitle(); }
  });
}
function credits() {
  const c = cinema(`<div class="roll">
    <h3>Operation: Best Human</h3><p>A Halloween Heist</p>
    <img src="${IMG('lineup')}" alt="The squad">
    <h3>Story & direction</h3><p>Jose</p>
    <h3>Starring</h3><p>Amy Santiago</p><p>Captain Raymond Holt</p><p>Jake Peralta</p><p>Charles Boyle</p><p>Rosa Diaz</p><p>Terry Jeffords</p><p>Gina Linetti</p><p>Hitchcock & Scully</p><p>Cheddar (as himself)</p>
    <h3>Special thanks</h3><p>Kevin, for the opera call</p><p>The FOG-MASTER 3000</p>
    <h3>A fan game</h3><p style="font-size:16px;font-family:var(--ui)">Made with love for the Nine-Nine. Not affiliated with the show.</p>
    <p style="margin-top:60px">Cool cool cool.</p></div><button class="btn skip">Close</button>`, 'credits');
  c.querySelector('.skip').onclick = () => c.remove();
  c.querySelector('.roll').addEventListener('animationend', () => c.remove());
}
async function timeUp() {
  RUN++;
  const tok = RUN;
  roamCtx = null;
  closeModal(true);
  $('cinema').innerHTML = '';
  hideDialogue();
  setBusy(true);
  unlock('midnight');
  Audio.music(null);
  stage.classList.add('dark');
  Audio.sfx('boom');
  await bigText('MIDNIGHT', 2200);
  if (tok !== RUN) return;
  Audio.music('sad');
  try {
    await say(
      'holt.serious: It is midnight. No detective holds the cummerbund.',
      'holt.deadpan: Therefore, there is no winner. This is the worst possible outcome. I am thrilled.',
      'jake: Wait. If nobody wins… does that mean I didn’t lose? Is that a win? I’m counting it as a win.',
      'amy.annoyed: It is *not* a win.',
    );
  } catch (e) { return; }
  hideDialogue();
  stage.classList.remove('dark');
  const c = cinema(`<div class="results-card"><div class="rank" style="font-size:max(60px,calc(8 * var(--u)))">Case unsolved</div><p style="color:var(--muted);font:500 16px var(--ui)">The clock struck midnight before you found the cummerbund.</p>
    <div class="btns"><button class="btn primary" data-r="retry">Retry this chapter</button><button class="btn" data-r="again">Start over</button><button class="btn" data-r="title">Title screen</button></div></div>`, 'results');
  c.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
    c.remove();
    if (b.dataset.r === 'retry') continueGame(true);
    if (b.dataset.r === 'again') newGame();
    if (b.dataset.r === 'title') toTitle();
  });
}

/* =========================================================
   Game flow
   ========================================================= */
function checkpoint() {
  if (S.chapter < 2 || S.chapter > 7) return;
  store.set(SAVE_KEY, { chapter: S.chapter, state: clone(S), at: Date.now() });
}
function resetStage() {
  RUN++;
  roamCtx = null; advanceResolve = null; choiceResolve = null;
  if (typing) typing.finish();
  closeModal(true);
  $('cinema').innerHTML = '';
  $('hotspots').innerHTML = '';
  $('squad').hidden = true;
  stage.className = '';
  FX.stop(true);
  hideDialogue();
  setBusy(true);
}
async function runFrom(ch) {
  const tok = RUN;
  try {
    for (let c = ch; c <= 8; c++) {
      if (tok !== RUN) return;
      S.chapter = c;
      S.objective = '';
      checkpoint();
      await CHAPTERS[c]();
    }
  } catch (e) {
    if (e === ABORT || tok !== RUN) return;
    if (e === MIDNIGHT) return timeUp();
    console.error(e);
  }
}
function hideTitle() {
  const t = $('title');
  t.classList.add('out');
  setTimeout(() => { t.hidden = true; t.classList.remove('out'); }, 800);
  titleFx.stop();
}
function newGame() {
  Audio.init();
  resetStage();
  S = freshState();
  hideTitle();
  updateBadge();
  runFrom(1);
}
function continueGame(grace) {
  const save = store.get(SAVE_KEY, null);
  if (!save) return newGame();
  Audio.init();
  resetStage();
  S = Object.assign(freshState(), save.state);
  S.objective = '';
  if (grace === true && DEADLINE - S.time < 15) {
    S.time = DEADLINE - 15; S.warned = {};
    setTimeout(() => toast('Extension granted', 'Captain Holt allows 15 more minutes. Do not waste them.', { icon: '🕚' }), 3500);
  }
  hideTitle();
  updateBadge(); updateClock();
  runFrom(save.chapter);
}
function toTitle() {
  if (S) checkpoint();
  resetStage();
  S = null;
  showHud(false);
  $('title').hidden = false;
  $('btnContinue').hidden = !store.get(SAVE_KEY, null);
  Audio.music('title');
  titleFx.start();
  setBg('reveal');
}

/* ---------- title screen embers ---------- */
const titleFx = (() => {
  const cv = $('titleFx'), g = cv.getContext('2d');
  let parts = [], raf = 0, W, H;
  function size() { const d = Math.min(devicePixelRatio || 1, 1.5); W = cv.width = innerWidth * d; H = cv.height = innerHeight * d; }
  function tick() {
    g.clearRect(0, 0, W, H);
    if (fading) { fadeK -= fading; if (fadeK <= 0) { fadeK = 1; fading = 0; parts = parts.filter(p => p.conf); } }
    g.globalAlpha = 1;
    if (parts.length < 70) parts.push({ x: Math.random() * W, y: H + 10, vy: -(0.4 + Math.random() * 1.2), vx: (Math.random() - 0.5) * 0.5, r: 1 + Math.random() * 2.5, a: 0.3 + Math.random() * 0.7, ph: Math.random() * 6 });
    for (const p of parts) {
      p.y += p.vy; p.ph += 0.03; p.x += p.vx + Math.sin(p.ph) * 0.4;
      g.globalAlpha = p.a * Math.min(1, p.y / H * 2);
      g.fillStyle = '#ff9a4d'; g.shadowColor = '#ff8a3d'; g.shadowBlur = 10;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
    }
    parts = parts.filter(p => p.y > -20);
    raf = requestAnimationFrame(tick);
  }
  return { start() { if (settings.reduce) return; size(); if (!raf) tick(); }, stop() { cancelAnimationFrame(raf); raf = 0; parts = []; g && g.clearRect(0, 0, W || 0, H || 0); }, size };
})();

/* =========================================================
   Wiring
   ========================================================= */
$('dialogue').addEventListener('click', e => { if (!e.target.closest('.choice')) advance(); });
$('btnNew').onclick = () => {
  const save = store.get(SAVE_KEY, null);
  if (save) {
    openModal('Start a new case?', '<p>You have a case in progress. Starting over will replace your saved progress.</p><div class="menu-list"><button class="btn primary" id="cNew">Start a new case</button><button class="btn" id="cKeep">Keep my save</button></div>', { narrow: true });
    $('cNew').onclick = () => { closeModal(true); store.del(SAVE_KEY); newGame(); };
    $('cKeep').onclick = () => closeModal();
    return;
  }
  newGame();
};
$('btnContinue').onclick = () => continueGame();
$('btnAch').onclick = openAchievements;
$('btnSettings').onclick = () => openSettings();
$('btnHow').onclick = openHelp;
$('btnCase').onclick = () => openCase();
$('btnMap').onclick = openMap;
$('btnHint').onclick = useHint;
$('btnMenu').onclick = openMenu;
$('modalClose').onclick = () => closeModal();
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
$('revealBtn').onclick = () => { stage.classList.toggle('reveal'); $('revealBtn').classList.toggle('on'); Audio.sfx('click'); };
document.addEventListener('keydown', e => {
  if (e.target.matches('input')) return;
  const modalOpen = !$('modal').hidden;
  if (e.key === 'Escape') { e.preventDefault(); if (modalOpen) closeModal(); else if (S && $('title').hidden) openMenu(); return; }
  if (modalOpen) return;
  if (e.key === ' ' || e.key === 'Enter') {
    if (window.__revealSkip) { e.preventDefault(); window.__revealSkip(); return; }
    if (!$('dialogue').hidden && (typing || advanceResolve)) { e.preventDefault(); advance(); }
    return;
  }
  if (/^[1-9]$/.test(e.key)) {
    const b = $('choices').querySelectorAll('.choice')[+e.key - 1];
    if (b) { e.preventDefault(); b.click(); }
    return;
  }
  if (!S || !$('title').hidden) return;
  const k = e.key.toLowerCase();
  if (k === 'c') openCase();
  if (k === 'm') openMap();
  if (e.key === 'Tab' && !$('hud').hidden) { e.preventDefault(); $('revealBtn').click(); }
});
window.addEventListener('resize', () => titleFx.size());
document.addEventListener('pointerdown', () => Audio.init(), { once: true });

// preload portraits and backgrounds so dialogue never flickers
const preload = [];
Object.entries(CAST).forEach(([who, c]) => c.faces.forEach(f => { const i = new Image(); i.src = portrait(who, f); preload.push(i); }));
Object.values(SCENES).forEach(s => { const i = new Image(); i.src = IMG(s.img); preload.push(i); });
['compartment', 'jake', 'lineup'].forEach(n => { const i = new Image(); i.src = IMG(n); preload.push(i); });

applySettings();
$('btnContinue').hidden = !store.get(SAVE_KEY, null);
titleFx.start();
setBg('reveal');
// Music needs a click first (browser rule); start it on the first interaction with the title screen.
$('title').addEventListener('pointerdown', () => { if ($('title').hidden) return; Audio.init(); Audio.music('title'); }, { once: true });

// Small hook for automated testing
window.__heist = { get state() { return S; }, jump(ch, patch) { Audio.init(); resetStage(); S = Object.assign(freshState(), patch || {}); hideTitle(); updateBadge(); updateClock(); runFrom(ch); } };
})();
