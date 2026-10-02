import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY, APP_VERSION } from './config.js';
import {
  AREAS, AREA_ORDER, CARDS, FIELDS, FIELD, DEFAULT_SETTINGS, targetFor, scoreDay,
  computeCurrentDays, wellbeingReading, isAnswered, visibleFields, fieldPoints,
  EXERCISES, EX_GROUPS, ALL_BOX_BONUS, workoutBreakdown, workoutTarget, workoutAreasFor,
} from './fields.js';
import { SEED_GOALS, CATEGORIES } from './goals-seed.js';
import { createLibrary } from './library.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const $app = document.getElementById('app');

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => isoDay(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000);
const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtLong = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const money = (n) => `£${(Math.round(n * 100) / 100).toFixed(n % 1 ? 2 : 0)}`;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// ---------- state ----------
const S = {
  session: null,
  view: 'today',
  day: todayIso(),
  entries: store.get('lp-entries', {}),
  settings: { ...DEFAULT_SETTINGS, ...store.get('lp-settings', {}) },
  goals: store.get('lp-goals', []),
  pending: new Set(store.get('lp-pending', [])),
  saveState: 'idle',
  authMode: 'signin',
  openPriority: null,
  movedGoal: null,
  sheet: null,
};

const ctxFor = (day) => ({
  target: targetFor(day, S.settings.drinkPlan),
  baselineSpend: Number(S.settings.baselineSpend) || 12,
  workoutTarget: workoutTarget(day, S.settings.workoutPlan),
});
const entry = (day = S.day) => (S.entries[day] ||= {});
let lib = null; // created after helpers below are defined

// ---------- persistence ----------
let saveTimer = null;
function queueSave(day) {
  S.pending.add(day);
  store.set('lp-pending', [...S.pending]);
  store.set('lp-entries', S.entries);
  setSaveState('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 500);
}
async function flush() {
  if (!S.session || !S.pending.size) { if (!S.pending.size) setSaveState('saved'); return; }
  const days = [...S.pending];
  const rows = days.map((day) => {
    const data = S.entries[day] || {};
    const sc = scoreDay(data, ctxFor(day));
    return { day, data, score: sc.overall, area_scores: sc.areas, updated_at: new Date().toISOString() };
  });
  const { error } = await sb.from('entries').upsert(rows, { onConflict: 'user_id,day' });
  if (error) { console.error(error); setSaveState('offline'); return; }
  days.forEach((d) => S.pending.delete(d));
  store.set('lp-pending', [...S.pending]);
  setSaveState('saved');
}
function setSaveState(s) {
  S.saveState = s;
  const el = document.getElementById('save-state');
  if (el) { el.dataset.state = s; el.textContent = { saving: 'Saving…', saved: 'Saved', offline: 'Saved on phone — will sync', idle: '' }[s]; }
}
window.addEventListener('online', flush);

async function saveSettings() {
  store.set('lp-settings', S.settings);
  if (!S.session) return;
  await sb.from('settings').upsert({ data: S.settings, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}

let loadingAll = null;
const loadAll = () => (loadingAll ||= doLoadAll().finally(() => { loadingAll = null; }));
async function doLoadAll() {
  const [{ data: rows }, { data: st }, { data: goals }] = await Promise.all([
    sb.from('entries').select('day,data'),
    sb.from('settings').select('data').maybeSingle(),
    sb.from('goals').select('*'),
  ]);
  if (rows) {
    const remote = Object.fromEntries(rows.map((r) => [r.day, r.data]));
    for (const d of S.pending) if (S.entries[d]) remote[d] = S.entries[d]; // unsynced local edits win
    S.entries = remote;
    store.set('lp-entries', S.entries);
  }
  if (st?.data) S.settings = { ...DEFAULT_SETTINGS, ...st.data };
  else await saveSettings();
  store.set('lp-settings', S.settings);
  if (goals && goals.length) S.goals = goals;
  else if (goals) {
    const { data: seeded } = await sb.from('goals').insert(SEED_GOALS).select('*');
    S.goals = seeded || [];
  }
  store.set('lp-goals', S.goals);
  await lib.load();
  flush();
}

// ---------- value changes ----------
let deferTimer = null;
function setValue(fid, v, opts = {}) {
  const d = entry();
  const f = FIELD[fid];
  if (v === undefined || v === null || v === '') delete d[fid]; else d[fid] = v;
  if (fid === 'targetAchieved') d._targetManual = true;
  if (fid === 'drinkCount' && !d._targetManual) {
    const t = ctxFor(S.day).target;
    if (d.drinkCount == null) delete d.targetAchieved;
    else d.targetAchieved = t == null || d.drinkCount <= t ? 'yes' : 'no';
  }
  if (fid === 'release' || fid === 'drinkCount') d.currentDays = d.release ? computeCurrentDays(S.day, S.entries, S.settings) : undefined;
  if (fid === 'release' && !S.settings.currentDaysStart && d.release) { S.settings.currentDaysStart = S.day; saveSettings(); }
  if (d.currentDays === undefined) delete d.currentDays;
  queueSave(S.day);
  // Typed inputs commit on blur; re-rendering immediately would swallow the tap that caused the blur.
  if (opts.defer) { clearTimeout(deferTimer); deferTimer = setTimeout(render, 400); } else render();
  if (f && f.type === 'choice' && navigator.vibrate) navigator.vibrate(8);
}

// ---------- ring ----------
function ringSVG(sc, size = 168) {
  const c = size / 2; const stroke = size * 0.036; const gap = size * 0.016;
  let r = c - stroke / 2 - 2;
  const rings = AREA_ORDER.map((a) => {
    const val = sc.areas[a];
    const circ = 2 * Math.PI * r;
    const fill = val == null ? 0 : (val / 100) * circ;
    const s = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="${stroke}"/>
      ${fill > 0 ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${AREAS[a].color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${fill} ${circ}" transform="rotate(-90 ${c} ${c})" class="ring-arc"/>` : ''}`;
    r -= stroke + gap;
    return s;
  }).join('');
  const label = sc.overall == null ? '–' : sc.overall;
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Today's score ${label} out of 100">
    ${rings}
    <text x="${c}" y="${c + 2}" text-anchor="middle" dominant-baseline="middle" class="ring-num" style="font-size:${Math.round(size * 0.2)}px">${label}</text>
  </svg>`;
}

function ageLine(day) {
  const b = S.settings.birthday || '1985-10-04';
  const [by, bm, bd] = b.split('-').map(Number);
  const d = new Date(day + 'T12:00:00');
  let age = d.getFullYear() - by;
  const bdayThisYear = `${d.getFullYear()}-${pad(bm)}-${pad(bd)}`;
  if (day < bdayThisYear) age -= 1;
  const lastBday = day >= bdayThisYear ? bdayThisYear : `${d.getFullYear() - 1}-${pad(bm)}-${pad(bd)}`;
  const n = dayDiff(lastBday, day) + 1;
  const nextBday = day >= bdayThisYear ? `${d.getFullYear() + 1}-${pad(bm)}-${pad(bd)}` : bdayThisYear;
  const toGo = dayDiff(day, nextBday);
  if (toGo <= 7 && toGo > 0) return `${toGo} day${toGo > 1 ? 's' : ''} until ${age + 1}`;
  if (n === 1) return `Happy birthday. Day one of ${age}.`;
  return `Day ${n} of being ${age}`;
}

// ---------- controls ----------
function optBtn(f, opt, selected, act) {
  const v = JSON.stringify(opt.v);
  return `<button type="button" class="opt${selected ? ' on' : ''}${opt.star ? ' star' : ''}" data-act="${act}" data-f="${f.id}" data-v='${esc(v)}' aria-pressed="${selected}">${esc(opt.label)}${opt.star ? '<span class="bonus">+' + opt.pts + '</span>' : ''}</button>`;
}

function control(f, d) {
  const v = d[f.id];
  switch (f.type) {
    case 'choice':
      return `<div class="opts${f.scale ? ' scale' : ''}" role="group" aria-label="${esc(f.label)}">${f.options.map((o) => optBtn(f, o, v === o.v, 'set')).join('')}</div>
        ${f.low ? `<div class="scale-ends"><span>${f.low}</span><span>${f.high}</span></div>` : ''}`;
    case 'multi':
      return `<div class="opts wrap" role="group" aria-label="${esc(f.label)}">${f.options.map((o) => optBtn(f, o, Array.isArray(v) && v.includes(o.v), 'toggle')).join('')}</div>`;
    case 'time':
      return `<div class="time-row">
        <input type="time" class="time" data-f="${f.id}" value="${esc(v || '')}" aria-label="${esc(f.label)}">
        <button type="button" class="opt slim" data-act="now" data-f="${f.id}">Now</button>
        <button type="button" class="opt slim ghost" data-act="nudge" data-f="${f.id}" data-n="-15" aria-label="15 minutes earlier">−15</button>
        <button type="button" class="opt slim ghost" data-act="nudge" data-f="${f.id}" data-n="15" aria-label="15 minutes later">+15</button>
        ${v ? `<button type="button" class="clear" data-act="clear" data-f="${f.id}" aria-label="Clear">×</button>` : ''}
      </div>`;
    case 'count': {
      const t = ctxFor(S.day).target;
      const has = typeof v === 'number';
      const under = has && t != null && v <= t;
      return `<div class="count-row">
        <button type="button" class="step" data-act="count" data-n="-0.5" aria-label="Half a drink less">−</button>
        <div class="count-val${has ? '' : ' empty'}"><span class="big">${has ? v : '–'}</span><span class="of">target ${t ?? '–'}</span></div>
        <button type="button" class="step" data-act="count" data-n="1" aria-label="One more drink">+</button>
        <button type="button" class="opt slim${v === 0 ? ' on' : ''}" data-act="set" data-f="drinkCount" data-v="0">Dry day</button>
      </div>
      ${has && v > 0 ? `<p class="micro ${under ? 'good' : ''}">${under ? (v < t ? `${t - v} under target. Nice.` : 'Right on target.') : `${v - t} over today's target. Tomorrow's a fresh start.`}</p>` : ''}
      ${v === 0 ? '<p class="micro good">A dry day. That counts for a lot.</p>' : ''}`;
    }
    case 'money': {
      const quick = [0, 5, 10, 15, 20];
      return `<div class="money-row">
        ${quick.map((q) => `<button type="button" class="opt slim${v === q ? ' on' : ''}" data-act="set" data-f="${f.id}" data-v="${q}">£${q}</button>`).join('')}
        <label class="money-in"><span>£</span><input type="number" inputmode="decimal" min="0" step="0.5" data-f="${f.id}" value="${typeof v === 'number' && !quick.includes(v) ? v : ''}" placeholder="other" aria-label="Other amount"></label>
      </div>`;
    }
    case 'auto': {
      const val = d.release ? d.currentDays ?? computeCurrentDays(S.day, S.entries, S.settings) : computeCurrentDays(S.day, { ...S.entries, [S.day]: { ...d, release: 'no' } }, S.settings);
      return `<div class="auto"><span class="big">${val}</span><span class="micro">${d.release ? (d.release === 'yes' ? 'Counter resets today' : 'Counted automatically') : 'Fills in when you answer Release'}</span></div>`;
    }
    case 'text':
      return `<textarea data-f="${f.id}" rows="4" placeholder="Anything worth remembering about today">${esc(v || '')}</textarea>`;
    case 'workout': {
      const t = ctxFor(S.day).workoutTarget;
      const sc = d.workoutScore || 0;
      const pct = Math.min(100, Math.round((sc / t) * 100));
      return `<button type="button" class="workout-link" data-act="tab" data-v="workout">
        <span class="wl-nums"><strong>${sc}</strong> / ${t}</span>
        <span class="wl-bar"><span style="width:${pct}%"></span></span>
        <span class="wl-cta">${sc ? (sc >= t ? 'Target reached. Add more' : 'Add exercises') : 'Log your exercises'}</span>
      </button>`;
    }
    default: return '';
  }
}

function fieldRow(f, d) {
  const done = isAnswered(f, d);
  const p = f.area ? fieldPoints(f, f.type === 'auto' ? d.currentDays : f.type === 'workout' ? d.workoutScore : d[f.id], ctxFor(S.day)) : null;
  return `<div class="field${done ? ' done' : ''}" data-field="${f.id}">
    <div class="field-head"><span class="field-label">${esc(f.label)}</span>${p != null && p !== 0 && f.type !== 'auto' ? `<span class="pts ${p > 0 ? 'pos' : 'neg'}">${p > 0 ? '+' : ''}${p}</span>` : ''}</div>
    ${control(f, d)}
  </div>`;
}

function cardHTML(card, d, sc) {
  const fields = visibleFields(card.id, d);
  const done = fields.filter((f) => isAnswered(f, d)).length;
  let body = '';
  let group = null;
  for (const f of fields) {
    if (f.group && f.group !== group) { body += `<div class="group-label">${esc(f.group)}</div>`; group = f.group; }
    if (!f.group) group = null;
    body += fieldRow(f, d);
  }
  let extra = '';
  if (card.id === 'drinks') extra = drinksFooter();
  if (card.id === 'wellbeing') { const w = wellbeingReading(d); if (w != null) extra = `<p class="micro">Wellbeing reading today: <strong>${w}</strong>. This never affects your score.</p>`; }
  const areaScore = card.area && card.id !== 'night' ? sc.areas[card.area] : null;
  return `<section class="card" id="card-${card.id}" style="--accent:${card.area ? AREAS[card.area].color : 'var(--ink-3)'}">
    <header class="card-head">
      <h2>${esc(card.title)}</h2>
      <span class="card-meta">${card.id === 'notes' ? '' : `${done}/${fields.length}`}${areaScore != null ? ` <span class="area-pill">${areaScore}</span>` : ''}</span>
    </header>
    ${card.hint ? `<p class="card-hint">${esc(card.hint)}</p>` : ''}
    ${body}${extra}
  </section>`;
}

function drinksFooter() {
  const base = Number(S.settings.baselineSpend) || 12;
  const days = Object.keys(S.entries).filter((k) => typeof S.entries[k].spend === 'number');
  const saved = days.reduce((s, k) => s + (base - S.entries[k].spend), 0);
  const t = ctxFor(S.day).target;
  const plan = [...S.settings.drinkPlan].sort((a, b) => a.from.localeCompare(b.from));
  const next = plan.find((p) => p.from > S.day && p.target !== t);
  const nextLine = next ? ` Drops to ${next.target} on ${fmtShort(next.from)}.` : '';
  return `<div class="drinks-foot">
    <p class="micro">Today's target: <strong>${t}</strong>.${nextLine}</p>
    ${days.length ? `<p class="micro">${saved > 0 ? `Saved so far: <strong>${money(saved)}</strong> against your £${base} a day.` : `Every pound under £${base} a day is counted as saved.`}</p>` : ''}
  </div>`;
}

// Same rule as the morning reminder: only once you've started, and only if yesterday is missing or sparse and not finished.
function yesterdayUnfinished() {
  const y = addDays(todayIso(), -1);
  const started = Object.keys(S.entries).some((k) => k <= y);
  if (!started) return false;
  const d = S.entries[y];
  if (!d) return true;
  const n = Object.keys(d).filter((k) => !k.startsWith('_') && !['notes', 'done', 'currentDays', 'targetAchieved', 'readSecs', 'basilReadSecs', 'workout', 'workoutScore', 'workoutTarget'].includes(k)).length;
  return !d.done && n < 20;
}

// ---------- home workout ----------
const defaultSession = () => (new Date().getHours() < 11 ? 'morning' : 'midday');

function setWorkout(mutator, opts = {}) {
  const d = entry();
  const w = d.workout ? JSON.parse(JSON.stringify(d.workout)) : { morning: {}, midday: {}, cardio: {} };
  mutator(w);
  for (const s of ['morning', 'midday']) for (const k of Object.keys(w[s] || {})) if (!(w[s][k] > 0)) delete w[s][k];
  if (w.cardio) { for (const k of ['mins', 'km']) if (!(w.cardio[k] > 0)) delete w.cardio[k]; }
  d.workout = w;
  const b = workoutBreakdown(w);
  if (b.total > 0) d.workoutScore = b.total; else delete d.workoutScore;
  d.workoutTarget = ctxFor(S.day).workoutTarget;
  // Fill Morning/Midday workout fields from what was logged, keeping anything ticked by hand.
  d._wDerived ||= {};
  for (const [session, fid] of [['morning', 'morningWorkout'], ['midday', 'middayWorkout']]) {
    const prev = d._wDerived[session] || [];
    const now = workoutAreasFor(w, session);
    const manual = (Array.isArray(d[fid]) ? d[fid] : []).filter((x) => !prev.includes(x) && x !== 'none');
    const merged = ['lower', 'core', 'upper'].filter((a) => manual.includes(a) || now.includes(a));
    if (merged.length) d[fid] = merged;
    else if (prev.length) delete d[fid];
    d._wDerived[session] = now;
  }
  queueSave(S.day);
  if (opts.defer) { clearTimeout(deferTimer); deferTimer = setTimeout(render, 400); } else render();
}

function lastTime(exId) {
  const days = Object.keys(S.entries).filter((k) => k < S.day && S.entries[k].workout).sort().reverse();
  for (const k of days) {
    const w = S.entries[k].workout;
    const n = (w.morning?.[exId] || 0) + (w.midday?.[exId] || 0);
    if (n > 0) return n;
  }
  return null;
}

function workoutMessage(sc, t, best, boxesLeft) {
  if (!sc) return 'Every rep counts. Pick any exercise to start.';
  if (best != null && sc > best) return `New personal best. ${sc} beats your previous ${best}.`;
  if (sc >= t) return `Target reached with ${sc - t} to spare. Anything else is a bonus.`;
  if (boxesLeft > 0 && boxesLeft <= 3) return `${boxesLeft} more exercise${boxesLeft > 1 ? 's' : ''} for the +${ALL_BOX_BONUS} bonus.`;
  const pct = Math.round((sc / t) * 100);
  return pct >= 50 ? `${pct}% of today's target. Building nicely.` : `${sc} points in the bank. Good start.`;
}

function viewWorkout() {
  const d = entry();
  const w = d.workout || { morning: {}, midday: {}, cardio: {} };
  const session = S.wSession || defaultSession();
  const b = workoutBreakdown(w);
  const t = ctxFor(S.day).workoutTarget;
  const pct = Math.min(100, Math.round((b.total / t) * 100));
  const prevScores = Object.keys(S.entries).filter((k) => k !== S.day && S.entries[k].workoutScore > 0).map((k) => S.entries[k].workoutScore);
  const best = prevScores.length ? Math.max(...prevScores) : null;
  const isToday = S.day === todayIso();
  const other = session === 'morning' ? 'midday' : 'morning';

  // This week (Mon-Sun)
  const dow = (new Date(S.day + 'T12:00:00').getDay() + 6) % 7;
  const monday = addDays(S.day, -dow);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekTotal = week.reduce((s, k) => s + (S.entries[k]?.workoutScore || 0), 0);
  const weekDays = week.filter((k) => S.entries[k]?.workoutScore > 0).length;
  const strip = week.map((k) => {
    const sc = S.entries[k]?.workoutScore || 0; const tt = workoutTarget(k, S.settings.workoutPlan);
    const h = sc ? Math.max(8, Math.min(100, Math.round((sc / tt) * 100))) : 0;
    return `<div class="wk-day${k === S.day ? ' cur' : ''}${sc >= tt ? ' hit' : ''}" title="${fmtShort(k)}: ${sc || 'rest'}">
      <div class="wk-bar"><span style="height:${h}%"></span></div>
      <span>${new Date(k + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'narrow' })}</span></div>`;
  }).join('');

  const row = (e) => {
    const n = w[session]?.[e.id] || 0;
    const otherN = w[other]?.[e.id] || 0;
    const sec = e.unit === 'sec';
    const step1 = sec ? 10 : 5; const step2 = sec ? 30 : 10;
    const lt = lastTime(e.id);
    const earned = (n + otherN) * e.pts;
    return `<div class="ex${n + otherN > 0 ? ' done' : ''}">
      <div class="ex-head">
        <span class="ex-name">${esc(e.name)}</span>
        <button type="button" class="guide-btn" data-act="guide" data-id="${e.id}" aria-label="How to do ${esc(e.name)}">How to</button>
        <span class="ex-pts">${earned ? `<strong>+${earned}</strong>` : `${e.pts} pt${e.pts > 1 ? 's' : ''} per ${sec ? 'second' : 'rep'}`}</span>
      </div>
      <div class="ex-ctrl">
        <button type="button" class="step sm" data-act="ex" data-id="${e.id}" data-n="-${step1}" aria-label="Less">−</button>
        <label class="ex-val"><input type="number" inputmode="numeric" min="0" data-ex="${e.id}" value="${n || ''}" placeholder="0" aria-label="${esc(e.name)} ${sec ? 'seconds' : 'reps'}"><span>${sec ? 'sec' : 'reps'}</span></label>
        <button type="button" class="opt slim" data-act="ex" data-id="${e.id}" data-n="${step1}">+${step1}</button>
        <button type="button" class="opt slim" data-act="ex" data-id="${e.id}" data-n="${step2}">+${step2}</button>
      </div>
      ${otherN || lt ? `<p class="ex-note">${otherN ? `${otherN} ${sec ? 'sec' : ''} logged ${other === 'morning' ? 'this morning' : 'at midday'}. ` : ''}${lt ? `Last time: ${lt}${sec ? ' sec' : ''}.` : ''}</p>` : ''}
    </div>`;
  };

  const mins = w.cardio?.mins || 0; const km = w.cardio?.km || 0;
  return `<section class="page workout">
    <div class="date-nav">
      <button type="button" class="nav-arrow" data-act="day" data-n="-1" aria-label="Previous day">‹</button>
      <label class="date-label"><span class="date-main">${isToday ? 'Home workout' : esc(fmtLong(S.day))}</span>
        <span class="date-sub">${isToday ? esc(fmtLong(S.day)) : 'Home workout'}</span>
        <input type="date" class="date-pick" value="${S.day}" max="${todayIso()}" aria-label="Choose a day"></label>
      <button type="button" class="nav-arrow" data-act="day" data-n="1" ${isToday ? 'disabled' : ''} aria-label="Next day">›</button>
    </div>

    <div class="w-score">
      <div class="w-big"><span class="w-num">${b.total}</span><span class="w-of">of ${t}</span></div>
      <div class="w-bar${b.total >= t ? ' hit' : ''}"><span style="width:${pct}%"></span></div>
      <p class="w-msg">${esc(workoutMessage(b.total, t, best, b.boxTotal - b.boxes))}</p>
      <div class="w-facts">
        <span><strong>${b.boxes}</strong>/${b.boxTotal} exercises ${b.bonus ? `· +${ALL_BOX_BONUS} bonus earned` : ''}</span>
        ${best != null ? `<span>Best: <strong>${Math.max(best, b.total)}</strong></span>` : ''}
      </div>
    </div>

    <div class="seg" role="group" aria-label="Session">
      <button type="button" class="${session === 'morning' ? 'on' : ''}" data-act="wsession" data-v="morning">Morning</button>
      <button type="button" class="${session === 'midday' ? 'on' : ''}" data-act="wsession" data-v="midday">Midday</button>
    </div>

    ${EX_GROUPS.map(([g, label]) => `<section class="card ex-group" style="--accent:var(--a-move)">
      <header class="card-head"><h2>${label}</h2><span class="card-meta">${EXERCISES.filter((e) => e.area === g && b.totals[e.id] > 0).length}/${EXERCISES.filter((e) => e.area === g).length}</span></header>
      ${EXERCISES.filter((e) => e.area === g && !e.standing).map(row).join('')}
      ${g === 'core' ? `<div class="group-label standing-label">Standing core <span>no floor needed</span></div>${EXERCISES.filter((e) => e.standing).map(row).join('')}` : ''}
    </section>`).join('')}

    <section class="card ex-group" style="--accent:var(--a-move)">
      <header class="card-head"><h2>Cardio</h2><span class="card-meta">${b.cardio ? `+${b.cardio}` : '10 per 10 min · 20 per km'}</span></header>
      <div class="ex${mins || km ? ' done' : ''}">
        <div class="ex-head"><span class="ex-name">Minutes</span></div>
        <div class="ex-ctrl">
          <button type="button" class="step sm" data-act="cardio" data-k="mins" data-n="-5" aria-label="Less">−</button>
          <label class="ex-val"><input type="number" inputmode="numeric" min="0" data-cardio="mins" value="${mins || ''}" placeholder="0"><span>min</span></label>
          <button type="button" class="opt slim" data-act="cardio" data-k="mins" data-n="5">+5</button>
          <button type="button" class="opt slim" data-act="cardio" data-k="mins" data-n="10">+10</button>
        </div>
      </div>
      <div class="ex${km ? ' done' : ''}">
        <div class="ex-head"><span class="ex-name">Distance</span></div>
        <div class="ex-ctrl">
          <button type="button" class="step sm" data-act="cardio" data-k="km" data-n="-0.5" aria-label="Less">−</button>
          <label class="ex-val"><input type="number" inputmode="decimal" min="0" step="0.1" data-cardio="km" value="${km || ''}" placeholder="0"><span>km</span></label>
          <button type="button" class="opt slim" data-act="cardio" data-k="km" data-n="0.5">+0.5</button>
          <button type="button" class="opt slim" data-act="cardio" data-k="km" data-n="1">+1</button>
        </div>
      </div>
    </section>

    <h2 class="sub">This week</h2>
    <div class="wk">${strip}</div>
    <p class="micro">${weekTotal ? `<strong>${weekTotal}</strong> points across ${weekDays} day${weekDays > 1 ? 's' : ''} this week.` : 'Your week starts with the first rep.'}</p>
    <p class="micro">Your score flows into Today under Movement and fills in your Morning and Midday workout automatically.</p>
    <p class="micro"><a class="doc-link" href="/guides/all-exercises.pdf" target="_blank" rel="noopener">All exercise guides in one PDF</a></p>
  </section>`;
}

// ---------- views ----------
function viewToday() {
  const d = entry();
  const sc = scoreDay(d, ctxFor(S.day));
  const isToday = S.day === todayIso();
  const legend = AREA_ORDER.map((a) => `<li style="--c:${AREAS[a].color}"><span class="dot"></span>${AREAS[a].label}<span class="lv">${sc.areas[a] ?? '–'}</span></li>`).join('');
  const chips = CARDS.map((c) => {
    const fs = visibleFields(c.id, d);
    const n = fs.filter((f) => isAnswered(f, d)).length;
    const full = c.id !== 'notes' && n === fs.length;
    return `<a href="#card-${c.id}" class="chip${full ? ' full' : ''}" style="--accent:${c.area ? AREAS[c.area].color : 'var(--ink-3)'}">${esc(c.title)}</a>`;
  }).join('');
  return `
  <header class="today-top">
    <div class="date-nav">
      <button type="button" class="nav-arrow" data-act="day" data-n="-1" aria-label="Previous day">‹</button>
      <label class="date-label"><span class="date-main">${isToday ? 'Today' : esc(fmtLong(S.day))}</span>
        <span class="date-sub">${isToday ? esc(fmtLong(S.day)) : esc(ageLine(S.day))}</span>
        <input type="date" class="date-pick" data-act="pickday" value="${S.day}" max="${todayIso()}" aria-label="Choose a day"></label>
      <button type="button" class="nav-arrow" data-act="day" data-n="1" ${isToday ? 'disabled' : ''} aria-label="Next day">›</button>
    </div>
    ${isToday ? `<p class="age-line">${esc(ageLine(S.day))}</p>` : ''}
    ${isToday ? lib.todayCard() : ''}
    ${isToday && yesterdayUnfinished() ? `<button type="button" class="catchup" data-act="day" data-n="-1">Yesterday isn’t finished yet. <strong>Fill it in</strong></button>` : ''}
    <div class="score-block">
      ${ringSVG(sc)}
      <ul class="legend">${legend}</ul>
    </div>
    <nav class="chips" aria-label="Jump to section">${chips}</nav>
  </header>
  ${CARDS.map((c) => cardHTML(c, d, sc)).join('')}
  <div class="finish">
    <button type="button" class="primary" data-act="finish">${d.done ? 'Update my day' : 'Finish my day'}</button>
    <p id="save-state" class="save-state" data-state="${S.saveState}"></p>
  </div>`;
}

function finishMessage(d, sc) {
  const lines = [];
  const t = ctxFor(S.day).target;
  if (Array.isArray(d.otherActivity) && d.otherActivity.includes('swim')) lines.push('You swam. Facing a fear beats any score.');
  if (d.driving === 'yes') lines.push('Behind the wheel today. That one matters.');
  if (d.drinkCount === 0) lines.push('A dry day. Genuinely big.');
  else if (typeof d.drinkCount === 'number' && t != null && d.drinkCount < t) lines.push(`${t - d.drinkCount} under your target of ${t}.`);
  else if (typeof d.drinkCount === 'number' && d.drinkCount === t) lines.push('Right on your drinks target.');
  const best = AREA_ORDER.filter((a) => sc.areas[a] != null).sort((a, b) => sc.areas[b] - sc.areas[a])[0];
  if (best && sc.areas[best] >= 60) lines.push(`Strongest area: ${AREAS[best].label} (${sc.areas[best]}).`);
  if (d.fcProject && d.fcProject !== 'none') lines.push('Another brick in the FC plan.');
  if (d.workoutScore > 0) {
    const wt = ctxFor(S.day).workoutTarget;
    lines.push(d.workoutScore >= wt ? `Workout target reached: ${d.workoutScore} of ${wt}.` : `${d.workoutScore} workout points banked.`);
  }
  const closers = ['Logged and done. That habit is the win.', 'One more day of showing up for yourself.',
    'Your 40s are built a day at a time. This was one.', 'Rest well. Tomorrow starts fresh.', 'Small days add up to a big decade.'];
  lines.push(closers[Math.floor(Math.random() * closers.length)]);
  return lines;
}

function viewProgress() {
  const days = Object.keys(S.entries).filter((k) => Object.keys(S.entries[k]).some((x) => !x.startsWith('_'))).sort();
  if (!days.length) return `<section class="page"><h1>Progress</h1><p class="lead">Your charts start growing after your first check-in. Log today and come back tomorrow.</p></section>`;
  const today = todayIso();
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const logged7 = last7.filter((k) => S.entries[k] && days.includes(k)).length;
  const base = Number(S.settings.baselineSpend) || 12;
  const spendDays = days.filter((k) => typeof S.entries[k].spend === 'number');
  const saved = spendDays.reduce((s, k) => s + (base - S.entries[k].spend), 0);
  const weekDrinks = last7.filter((k) => typeof S.entries[k]?.drinkCount === 'number');
  const underT = weekDrinks.filter((k) => S.entries[k].drinkCount <= targetFor(k, S.settings.drinkPlan)).length;
  const dry = days.filter((k) => S.entries[k].drinkCount === 0).length;
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const bars = last14.map((k) => {
    const sc = S.entries[k] ? scoreDay(S.entries[k], ctxFor(k)).overall : null;
    const h = sc == null ? 0 : Math.max(4, sc);
    return `<div class="bar-col" title="${fmtShort(k)}: ${sc ?? 'no entry'}"><div class="bar" style="height:${h}%"></div><span>${new Date(k + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'narrow' })}</span></div>`;
  }).join('');
  return `<section class="page">
    <h1>Progress</h1>
    <div class="stat-grid">
      <div class="stat"><span class="stat-n">${logged7}<small>/7</small></span><span class="stat-l">days logged this week</span></div>
      <div class="stat"><span class="stat-n">${weekDrinks.length ? `${underT}<small>/${weekDrinks.length}</small>` : '–'}</span><span class="stat-l">days at or under drinks target</span></div>
      <div class="stat"><span class="stat-n">${saved > 0 ? money(saved) : '£0'}</span><span class="stat-l">saved on alcohol</span></div>
      <div class="stat"><span class="stat-n">${dry}</span><span class="stat-l">dry days so far</span></div>
    </div>
    <h2 class="sub">Last 14 days</h2>
    <div class="bars">${bars}</div>
    <p class="note">Full charts, trends by area and insights from your own patterns are coming in the next update.</p>
  </section>`;
}

// ---------- goals ----------
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const fmtDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

async function saveGoal(g, patch) {
  Object.assign(g, patch, { updated_at: new Date().toISOString() });
  store.set('lp-goals', S.goals);
  const { error } = await sb.from('goals').update({ ...patch, updated_at: g.updated_at }).eq('id', g.id);
  if (error) console.error(error);
}

const catOptions = (sel, allowNone) => `${allowNone ? `<option value="">None</option>` : ''}${CATEGORIES.map((c) => `<option${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('')}`;
const prioRow = (current, act, id = '') => `<div class="prio-pick" role="group" aria-label="Priority">${[1, 2, 3, 4, 5].map((n) =>
  `<button type="button" class="prio p${n}${n === current ? ' on' : ''}" data-act="${act}" data-id="${id}" data-n="${n}" aria-label="Priority ${n}">${n}</button>`).join('')}</div>`;

function stepSummary(g) {
  const steps = g.steps || [];
  const done = steps.filter((s) => s.done).length;
  const planned = steps.length - done;
  if (!steps.length) return '';
  return [done ? `${done} done` : '', planned ? `${planned} planned` : ''].filter(Boolean).join(' · ');
}

function viewGoalNew() {
  const p = S.newPrio || 3;
  return `<section class="page goal-page">
    <button type="button" class="back" data-act="goal-close">‹ Goals</button>
    <h1>New goal</h1>
    <form id="goal-form" class="goal-form">
      <label>What do you want to achieve?<input name="title" required maxlength="120" placeholder="e.g. Run 5k without stopping" autocomplete="off"></label>
      <div class="row2">
        <label>Primary category<select name="cat1" required>${catOptions('Personal', false)}</select></label>
        <label>Secondary category<select name="cat2">${catOptions('', true)}</select></label>
      </div>
      <div class="field-label">Priority</div>
      ${prioRow(p, 'newprio')}
      <label>First step <span class="opt-tag">optional</span><input name="step" maxlength="200" placeholder="The smallest thing you could do next" autocomplete="off"></label>
      <button class="primary" type="submit">Add goal</button>
    </form>
  </section>`;
}

function viewGoalDetail(g) {
  const steps = g.steps || [];
  const done = steps.filter((s) => s.done);
  const planned = steps.filter((s) => !s.done);
  const achieved = g.status === 'achieved';
  const stepLi = (s) => `<li class="step-item${s.done ? ' is-done' : ''}">
    <button type="button" class="tick${s.done ? ' on' : ''}" data-act="step-toggle" data-id="${s.id}" aria-pressed="${!!s.done}" aria-label="${s.done ? 'Mark as planned' : 'Mark as done'}"></button>
    <div class="step-text"><span>${esc(s.text)}</span><small>${s.done ? `Done ${fmtDate(s.doneAt || s.created)}` : `Added ${fmtDate(s.created)}`}</small></div>
    <button type="button" class="clear" data-act="step-del" data-id="${s.id}" aria-label="Remove step">×</button></li>`;
  const confirming = S.confirmDelete === g.id;
  return `<section class="page goal-page">
    <button type="button" class="back" data-act="goal-close">‹ ${achieved ? 'Achieved' : 'Goals'}</button>
    ${achieved ? `<p class="achieved-badge">Achieved ${g.achieved_at ? fmtDate(g.achieved_at) : ''}</p>` : ''}
    <textarea class="goal-title-in" data-gfield="title" rows="2" maxlength="120" aria-label="Goal">${esc(g.title)}</textarea>
    <div class="row2">
      <label>Primary category<select data-gfield="cat1">${catOptions(g.cat1 || 'Personal', false)}</select></label>
      <label>Secondary category<select data-gfield="cat2">${catOptions(g.cat2 || '', true)}</select></label>
    </div>
    ${achieved ? '' : `<div class="field-label">Priority</div>${prioRow(g.priority, 'gprio', g.id)}`}

    <h2 class="sub">Steps</h2>
    <form id="step-form" class="step-add">
      <input name="step" maxlength="200" placeholder="Add a step you're planning or have done" autocomplete="off" aria-label="New step">
      <button class="primary small" type="submit">Add</button>
    </form>
    ${planned.length ? `<h3 class="step-h">Planned</h3><ul class="steps">${planned.map(stepLi).join('')}</ul>` : ''}
    ${done.length ? `<h3 class="step-h">Done so far</h3><ul class="steps">${done.map(stepLi).join('')}</ul>` : ''}
    ${!steps.length ? `<p class="micro">Break it down: what's one small thing that would move this forward?</p>` : ''}
    <p class="micro">Tap the circle when a step is done.</p>

    <h2 class="sub">Notes</h2>
    <textarea data-gfield="notes" rows="4" placeholder="Thoughts, links, people who could help">${esc(g.notes || '')}</textarea>

    <h2 class="sub">From your library</h2>
    ${lib.goalSection(g.id)}

    <div class="goal-actions">
      ${achieved
        ? `<button type="button" class="secondary small" data-act="goal-unachieve">Move back to active</button>`
        : `<button type="button" class="primary" data-act="goal-achieve">Mark as achieved</button>`}
      <button type="button" class="danger small${confirming ? ' armed' : ''}" data-act="goal-delete">${confirming ? 'Tap again to delete for good' : 'Delete goal'}</button>
    </div>
  </section>`;
}

function viewGoals() {
  if (S.goalNew) return viewGoalNew();
  const open = S.goalOpen && S.goals.find((g) => g.id === S.goalOpen);
  if (open) return viewGoalDetail(open);
  const tab = S.goalTab || 'active';
  const active = S.goals.filter((g) => g.status !== 'achieved').sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
  const achieved = S.goals.filter((g) => g.status === 'achieved').sort((a, b) => (b.achieved_at || '').localeCompare(a.achieved_at || ''));
  const seg = `<div class="seg" role="group" aria-label="Goal list">
    <button type="button" class="${tab === 'active' ? 'on' : ''}" data-act="goaltab" data-v="active">Active (${active.length})</button>
    <button type="button" class="${tab === 'achieved' ? 'on' : ''}" data-act="goaltab" data-v="achieved">Achieved (${achieved.length})</button>
  </div>`;
  if (tab === 'achieved') {
    const totalSteps = achieved.reduce((s, g) => s + (g.steps || []).filter((x) => x.done).length, 0);
    return `<section class="page">
      <h1>Goals</h1>
      ${seg}
      ${achieved.length ? `<div class="pride">
          <span class="pride-n">${achieved.length}</span>
          <span class="pride-l">goal${achieved.length > 1 ? 's' : ''} achieved${totalSteps ? `, built from ${totalSteps} completed step${totalSteps > 1 ? 's' : ''}` : ''}.</span>
        </div>
        <ul class="goal-list">${achieved.map((g) => {
          const days = g.achieved_at && g.created_at ? Math.max(0, dayDiff(g.created_at.slice(0, 10), g.achieved_at)) : null;
          const n = (g.steps || []).filter((s) => s.done).length;
          return `<li class="goal won" data-act="goal-open" data-id="${g.id}">
            <span class="won-mark" aria-hidden="true">✓</span>
            <div class="goal-body"><span class="goal-title">${esc(g.title)}</span>
              <span class="goal-cats">${g.achieved_at ? `Achieved ${fmtDate(g.achieved_at)}` : 'Achieved'}${n ? ` · ${n} step${n > 1 ? 's' : ''}` : ''}${days ? ` · ${days} day${days > 1 ? 's' : ''} in the making` : ''}</span></div></li>`;
        }).join('')}</ul>`
        : `<p class="lead">Every goal you mark as achieved lands here. This is where you'll look back and see how far you've come.</p>`}
    </section>`;
  }
  const rows = active.map((g) => {
    const openP = S.openPriority === g.id;
    const ss = stepSummary(g);
    return `<li class="goal${S.movedGoal === g.id ? ' moved' : ''}" data-p="${g.priority}">
      <button type="button" class="prio p${g.priority}" data-act="prio-open" data-id="${g.id}" aria-label="Priority ${g.priority}, change">${g.priority}</button>
      <div class="goal-body" data-act="goal-open" data-id="${g.id}" role="button" tabindex="0">
        <span class="goal-title">${esc(g.title)}</span>
        <span class="goal-cats">${esc(g.cat1 || '')}${g.cat2 ? ` <span class="sep">/</span> ${esc(g.cat2)}` : ''}${ss ? ` <span class="sep">·</span> ${ss}` : ''}</span>
        ${openP ? prioRow(g.priority, 'prio-set', g.id) : ''}
      </div>
      <span class="chev" data-act="goal-open" data-id="${g.id}" aria-hidden="true">›</span>
    </li>`;
  }).join('');
  return `<section class="page">
    <h1>Goals</h1>
    ${seg}
    <button type="button" class="add-goal" data-act="goal-new">+ Add a goal</button>
    <ul class="goal-list">${rows || '<li class="lead">No active goals. Add one to get started.</li>'}</ul>
    <p class="micro">Tap a goal to add steps and notes. Tap its number to change priority.</p>
  </section>`;
}

function guideSheet() {
  const e = EXERCISES.find((x) => x.id === S.guide);
  return `<div class="sheet-back" data-act="guide-close"></div>
    <div class="sheet guide-sheet" role="dialog" aria-modal="true" aria-label="How to do ${esc(e.name)}">
      <div class="guide-scroll"><img src="/guides/${e.id}.webp" alt="Illustrated guide: ${esc(e.name)}" width="480" loading="eager"></div>
      <div class="btn-row guide-actions">
        <button type="button" class="primary small" data-act="guide-close">Close</button>
        <a class="secondary small as-btn" href="/guides/${e.id}.pdf" target="_blank" rel="noopener">Open as PDF</a>
      </div>
    </div>`;
}

function celebrateSheet() {
  const g = S.celebrate;
  const n = (g.steps || []).filter((s) => s.done).length;
  const days = g.created_at ? Math.max(0, dayDiff(g.created_at.slice(0, 10), g.achieved_at)) : null;
  const total = S.goals.filter((x) => x.status === 'achieved').length;
  return `<div class="sheet-back" data-act="celebrate-close"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Goal achieved">
      <div class="celebrate-mark" aria-hidden="true">✓</div>
      <h2>Goal achieved</h2>
      <p class="celebrate-title">${esc(g.title)}</p>
      <ul class="sheet-lines">
        ${n ? `<li>${n} step${n > 1 ? 's' : ''} took you here.</li>` : ''}
        ${days ? `<li>${days} day${days > 1 ? 's' : ''} from setting it to doing it.</li>` : ''}
        <li>${total === 1 ? 'Your first achieved goal of your 40s.' : `That's ${total} goals achieved.`} Be proud of this one.</li>
      </ul>
      <button type="button" class="primary" data-act="celebrate-close">Close</button>
    </div>`;
}

function viewSettings() {
  const st = S.settings;
  const r = st.reminders || {};
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const plan = [...st.drinkPlan].sort((a, b) => a.from.localeCompare(b.from));
  return `<section class="page settings">
    <h1>Settings</h1>

    <h2 class="sub">Reminders</h2>
    <div class="set-block">
      <p class="micro">${perm === 'granted' ? 'Notifications are on for this phone.' : perm === 'denied' ? 'Notifications are blocked. Turn them on for this app in your phone settings.' : perm === 'unsupported' ? 'Add this app to your home screen first, then turn on reminders.' : 'Turn on reminders to get your morning and evening nudge.'}</p>
      <div class="row2">
        <label>Morning<input type="time" data-set="rem-morning" value="${esc(r.morning || '07:45')}"></label>
        <label>Evening<input type="time" data-set="rem-evening" value="${esc(r.evening || '21:30')}"></label>
      </div>
      <div class="btn-row">
        <button type="button" class="primary small" data-act="push-on">${perm === 'granted' ? 'Re-connect this phone' : 'Turn on reminders'}</button>
        <button type="button" class="secondary small" data-act="push-test">Send a test</button>
      </div>
      <p class="micro" id="push-msg"></p>
    </div>

    <h2 class="sub">Drinks plan</h2>
    <div class="set-block">
      <p class="micro">Each step starts on its date and runs until the next one. Change, pause or repeat steps whenever you need to.</p>
      <ul class="plan">${plan.map((p, i) => `<li>
        <input type="date" data-plan="${i}" data-k="from" value="${p.from}" aria-label="Start date">
        <label class="plan-t"><input type="number" min="0" max="30" data-plan="${i}" data-k="target" value="${p.target}" aria-label="Daily target"> a day</label>
        <button type="button" class="clear" data-act="plan-del" data-i="${i}" aria-label="Remove step">×</button></li>`).join('')}</ul>
      <button type="button" class="secondary small" data-act="plan-add">Add a step</button>
    </div>

    <h2 class="sub">Home workout targets</h2>
    <div class="set-block">
      <p class="micro">Starts at your base target, rises 25 every 2 days for two weeks, then 25 a week. Today's target: <strong>${workoutTarget(todayIso(), st.workoutPlan)}</strong>.</p>
      <div class="row2">
        <label>Start date<input type="date" data-set="w-start" value="${esc(st.workoutPlan?.start || '2026-10-05')}"></label>
        <label>Base target<input type="number" min="0" step="25" data-set="w-base" value="${esc(st.workoutPlan?.base ?? 400)}"></label>
      </div>
    </div>

    <h2 class="sub">Money</h2>
    <div class="set-block">
      <label class="inline">Typical daily alcohol spend before the plan <span class="money-in"><span>£</span><input type="number" min="0" step="0.5" data-set="baseline" value="${esc(st.baselineSpend)}"></span></label>
    </div>

    <h2 class="sub">Current days</h2>
    <div class="set-block">
      <label class="inline">Count from <input type="date" data-set="cd-start" value="${esc(st.currentDaysStart || '')}"></label>
      <p class="micro">Used until your first “yes”. After that it counts from the last yes.</p>
    </div>

    <h2 class="sub">Your data</h2>
    <div class="btn-row">
      <button type="button" class="secondary small" data-act="export">Download my data</button>
      <button type="button" class="secondary small" data-act="signout">Sign out</button>
    </div>
    <p class="micro version">Life Plan ${APP_VERSION}</p>
  </section>`;
}

function viewAuth(msg = '') {
  const up = S.authMode === 'signup';
  return `<section class="auth">
    <div class="auth-mark">${ringSVG({ overall: null, areas: { sleep: 80, food: 65, move: 50, drinks: 90, rel: 70, mind: 60 } }, 120)}</div>
    <h1>Life Plan</h1>
    <p class="lead">${up ? 'Create your account. Only one account can ever exist on this app.' : 'Sign in to pick up where you left off.'}</p>
    <form id="auth-form">
      <label>Email<input type="email" name="email" autocomplete="email" required></label>
      <label>Password<input type="password" name="password" autocomplete="${up ? 'new-password' : 'current-password'}" minlength="6" required></label>
      <button class="primary" type="submit">${up ? 'Create account' : 'Sign in'}</button>
    </form>
    <p class="auth-msg">${esc(msg)}</p>
    <button type="button" class="link" data-act="auth-toggle">${up ? 'I already have an account' : 'First time here? Create your account'}</button>
  </section>`;
}

const TABS = [
  ['today', 'Today', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'],
  ['workout', 'Workout', '<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>'],
  ['library', 'Library', '<path d="M5 4v16M9.5 4v16M14 5l4.5 14.5M3 20h18"/>'],
  ['progress', 'Progress', '<path d="M4 19V11M10 19V5M16 19v-6M22 19H2"/>'],
  ['goals', 'Goals', '<path d="M5 21V4l7 3 7-3v11l-7 3-7-3"/>'],
];
lib = createLibrary({
  S, sb, store, esc, todayIso,
  render: () => render(),
  entryFor: (day, peek) => (peek ? S.entries[day] : (S.entries[day] ||= {})),
  queueSave: (day) => queueSave(day),
});
const COG = '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>';

function render() {
  if (!S.session) { $app.innerHTML = viewAuth(S.authMsg); return; }
  const y = window.scrollY;
  const views = { today: viewToday, workout: viewWorkout, library: () => lib.view(), progress: viewProgress, goals: viewGoals, settings: viewSettings };
  const immersive = S.view === 'library' && lib.immersive();
  $app.innerHTML = `<main class="view view-${S.view}${immersive ? ' immersive' : ''}">${views[S.view]()}</main>
    ${immersive ? '' : `<button type="button" class="cog${S.view === 'settings' ? ' on' : ''}" data-act="tab" data-v="settings" aria-label="Settings">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${COG}</svg></button>
    <nav class="tabbar" aria-label="Sections">${TABS.map(([id, label, icon]) => `<button type="button" class="tab${S.view === id ? ' on' : ''}" data-act="tab" data-v="${id}" aria-current="${S.view === id ? 'page' : 'false'}">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg><span>${label}</span></button>`).join('')}</nav>`}
    ${S.sheet ? sheetHTML() : ''}${S.celebrate ? celebrateSheet() : ''}${S.guide ? guideSheet() : ''}`;
  window.scrollTo(0, y);
  setSaveState(S.saveState);
  if (immersive) document.body.dataset.rt = store.get('lp-reader', {}).theme || 'auto'; else delete document.body.dataset.rt;
  lib.afterRender();
}

function sheetHTML() {
  const d = entry();
  const sc = scoreDay(d, ctxFor(S.day));
  const lines = S.sheet.lines;
  return `<div class="sheet-back" data-act="sheet-close"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Day summary">
      <div class="sheet-ring">${ringSVG(sc, 140)}</div>
      <h2>${S.day === todayIso() ? "Today's done" : `${fmtShort(S.day)} is done`}</h2>
      <ul class="sheet-lines">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <button type="button" class="primary" data-act="sheet-close">Close</button>
    </div>`;
}

// ---------- events ----------
$app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (await lib.onClick(act, el)) return;
  const fid = el.dataset.f;
  const d = entry();
  switch (act) {
    case 'set': { const v = JSON.parse(el.dataset.v); setValue(fid, d[fid] === v ? null : v); break; }
    case 'toggle': {
      const f = FIELD[fid]; const v = JSON.parse(el.dataset.v);
      const opt = f.options.find((o) => o.v === v);
      let cur = Array.isArray(d[fid]) ? [...d[fid]] : [];
      if (cur.includes(v)) cur = cur.filter((x) => x !== v);
      else if (opt.exclusive) cur = [v];
      else cur = [...cur.filter((x) => !f.options.find((o) => o.v === x)?.exclusive), v];
      setValue(fid, cur.length ? cur : null);
      break;
    }
    case 'now': setValue(fid, nowHHMM()); break;
    case 'nudge': {
      const base = d[fid] || FIELD[fid].defaultTime || nowHHMM();
      let [h, m] = base.split(':').map(Number);
      let t = (h * 60 + m + Number(el.dataset.n) + 1440) % 1440;
      t = Math.round(t / 5) * 5 % 1440;
      setValue(fid, `${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
      break;
    }
    case 'clear': setValue(fid, null); break;
    case 'count': {
      const n = Number(el.dataset.n);
      const cur = typeof d.drinkCount === 'number' ? d.drinkCount : 0;
      setValue('drinkCount', Math.max(0, cur + n));
      break;
    }
    case 'day': {
      const nd = addDays(S.day, Number(el.dataset.n));
      if (nd <= todayIso()) { S.day = nd; render(); window.scrollTo(0, 0); }
      break;
    }
    case 'finish': {
      d.done = true; queueSave(S.day);
      S.sheet = { lines: finishMessage(d, scoreDay(d, ctxFor(S.day))) };
      render();
      break;
    }
    case 'sheet-close': S.sheet = null; render(); break;
    case 'ex': {
      const id = el.dataset.id; const n = Number(el.dataset.n); const s = S.wSession || defaultSession();
      setWorkout((w) => { w[s] ||= {}; w[s][id] = Math.max(0, (w[s][id] || 0) + n); });
      if (navigator.vibrate) navigator.vibrate(8);
      break;
    }
    case 'cardio': {
      const k = el.dataset.k; const n = Number(el.dataset.n);
      setWorkout((w) => { w.cardio ||= {}; w.cardio[k] = Math.max(0, Math.round(((w.cardio[k] || 0) + n) * 10) / 10); });
      break;
    }
    case 'wsession': S.wSession = el.dataset.v; render(); break;
    case 'guide': S.guide = el.dataset.id; render(); break;
    case 'guide-close': S.guide = null; render(); break;
    case 'tab': S.view = el.dataset.v; lib.reset(); S.openPriority = null; S.goalOpen = null; S.goalNew = false; S.confirmDelete = null; if (S.view === 'workout') S.wSession = null; render(); window.scrollTo(0, 0); break;
    case 'goaltab': S.goalTab = el.dataset.v; S.openPriority = null; render(); break;
    case 'goal-new': S.goalNew = true; S.newPrio = 3; render(); window.scrollTo(0, 0); document.querySelector('#goal-form input[name=title]')?.focus(); break;
    case 'goal-close': S.goalNew = false; S.goalOpen = null; S.confirmDelete = null; render(); window.scrollTo(0, 0); break;
    case 'goal-open': S.goalOpen = el.dataset.id; S.openPriority = null; S.confirmDelete = null; render(); window.scrollTo(0, 0); break;
    case 'newprio': {
      S.newPrio = Number(el.dataset.n);
      el.parentElement.querySelectorAll('.prio').forEach((b) => b.classList.toggle('on', b === el));
      break;
    }
    case 'gprio': {
      const g = S.goals.find((x) => x.id === el.dataset.id);
      await saveGoal(g, { priority: Number(el.dataset.n) }); render();
      break;
    }
    case 'step-toggle': case 'step-del': {
      const g = S.goals.find((x) => x.id === S.goalOpen);
      let steps = [...(g.steps || [])];
      if (act === 'step-del') steps = steps.filter((s) => s.id !== el.dataset.id);
      else steps = steps.map((s) => (s.id === el.dataset.id ? { ...s, done: !s.done, doneAt: !s.done ? todayIso() : null } : s));
      g.steps = steps; render();
      await saveGoal(g, { steps });
      break;
    }
    case 'goal-achieve': {
      const g = S.goals.find((x) => x.id === S.goalOpen);
      S.goalOpen = null; S.goalTab = 'achieved';
      g.status = 'achieved'; g.achieved_at = todayIso();
      S.celebrate = g; render(); window.scrollTo(0, 0);
      await saveGoal(g, { status: 'achieved', achieved_at: g.achieved_at });
      break;
    }
    case 'goal-unachieve': {
      const g = S.goals.find((x) => x.id === S.goalOpen);
      await saveGoal(g, { status: 'active', achieved_at: null });
      S.goalOpen = null; S.goalTab = 'active'; render();
      break;
    }
    case 'goal-delete': {
      const id = S.goalOpen;
      if (S.confirmDelete !== id) {
        S.confirmDelete = id; render();
        setTimeout(() => { if (S.confirmDelete === id) { S.confirmDelete = null; render(); } }, 4000);
        break;
      }
      S.goals = S.goals.filter((x) => x.id !== id);
      S.goalOpen = null; S.confirmDelete = null;
      store.set('lp-goals', S.goals); render();
      await sb.from('goals').delete().eq('id', id);
      break;
    }
    case 'celebrate-close': S.celebrate = null; render(); break;
    case 'auth-toggle': S.authMode = S.authMode === 'signin' ? 'signup' : 'signin'; S.authMsg = ''; render(); break;
    case 'prio-open': S.openPriority = S.openPriority === el.dataset.id ? null : el.dataset.id; render(); break;
    case 'prio-set': {
      const g = S.goals.find((x) => x.id === el.dataset.id);
      g.priority = Number(el.dataset.n); g.updated_at = new Date().toISOString();
      S.openPriority = null; S.movedGoal = g.id;
      store.set('lp-goals', S.goals);
      render();
      setTimeout(() => { S.movedGoal = null; }, 1200);
      await sb.from('goals').update({ priority: g.priority, updated_at: g.updated_at }).eq('id', g.id);
      break;
    }
    case 'plan-add': {
      const plan = [...S.settings.drinkPlan].sort((a, b) => a.from.localeCompare(b.from));
      const last = plan[plan.length - 1];
      plan.push({ from: last ? addDays(last.from, 14) : todayIso(), target: last ? Math.max(0, last.target - 1) : 4 });
      S.settings.drinkPlan = plan; await saveSettings(); render();
      break;
    }
    case 'plan-del': {
      const plan = [...S.settings.drinkPlan].sort((a, b) => a.from.localeCompare(b.from));
      plan.splice(Number(el.dataset.i), 1);
      S.settings.drinkPlan = plan; await saveSettings(); render();
      break;
    }
    case 'push-on': await enablePush(); break;
    case 'push-test': {
      const msg = document.getElementById('push-msg');
      msg.textContent = 'Sending…';
      const { data, error } = await sb.functions.invoke('send-reminders', { body: { test: true } });
      msg.textContent = error ? 'Could not send. Turn on reminders first.' : data?.sent ? 'Sent. It should arrive in a few seconds.' : 'No phone connected yet. Tap “Turn on reminders” first.';
      break;
    }
    case 'export': {
      const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), settings: S.settings, entries: S.entries, goals: S.goals }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `life-plan-${todayIso()}.json`; a.click();
      break;
    }
    case 'signout': await sb.auth.signOut(); break;
    default: break;
  }
});

$app.addEventListener('change', async (e) => {
  const el = e.target;
  if (await lib.onChange(el)) return;
  if (el.matches('.date-pick')) { if (el.value && el.value <= todayIso()) { S.day = el.value; render(); } return; }
  if (el.dataset.gfield) {
    const g = S.goals.find((x) => x.id === S.goalOpen);
    if (!g) return;
    const k = el.dataset.gfield; let v = el.value;
    if (k === 'title') { v = v.trim(); if (!v) { el.value = g.title; return; } }
    if (k === 'cat2' || k === 'notes') v = v.trim() || null;
    await saveGoal(g, { [k]: v });
    return;
  }
  if (el.dataset.ex) {
    const id = el.dataset.ex; const s = S.wSession || defaultSession(); const v = Math.max(0, Math.round(Number(el.value) || 0));
    setWorkout((w) => { w[s] ||= {}; w[s][id] = v; }, { defer: true });
    return;
  }
  if (el.dataset.cardio) {
    const k = el.dataset.cardio; const v = Math.max(0, Number(el.value) || 0);
    setWorkout((w) => { w.cardio ||= {}; w.cardio[k] = v; }, { defer: true });
    return;
  }
  if (el.matches('input.time')) { setValue(el.dataset.f, el.value || null, { defer: true }); return; }
  if (el.matches('.money-in input[data-f]')) { const v = el.value === '' ? null : Math.max(0, Number(el.value)); setValue(el.dataset.f, v, { defer: true }); return; }
  if (el.matches('textarea[data-f]')) { const d = entry(); const t = el.value.trim(); if (t) d[el.dataset.f] = el.value; else delete d[el.dataset.f]; queueSave(S.day); return; }
  if (el.dataset.plan !== undefined) {
    const plan = [...S.settings.drinkPlan].sort((a, b) => a.from.localeCompare(b.from));
    const i = Number(el.dataset.plan);
    plan[i] = { ...plan[i], [el.dataset.k]: el.dataset.k === 'target' ? Number(el.value) : el.value };
    S.settings.drinkPlan = plan; await saveSettings(); render();
    return;
  }
  const k = el.dataset.set;
  if (!k) return;
  if (k === 'baseline') S.settings.baselineSpend = Number(el.value) || 0;
  if (k === 'cd-start') S.settings.currentDaysStart = el.value || null;
  if (k === 'w-start' || k === 'w-base') {
    S.settings.workoutPlan = { ...DEFAULT_SETTINGS.workoutPlan, ...S.settings.workoutPlan,
      [k === 'w-start' ? 'start' : 'base']: k === 'w-start' ? (el.value || DEFAULT_SETTINGS.workoutPlan.start) : (Number(el.value) || 400) };
    await saveSettings(); render(); return;
  }
  if (k === 'rem-morning' || k === 'rem-evening') {
    S.settings.reminders = { ...DEFAULT_SETTINGS.reminders, ...S.settings.reminders, [k === 'rem-morning' ? 'morning' : 'evening']: el.value };
  }
  await saveSettings();
});

// Save notes as you type (without re-rendering)
$app.addEventListener('input', (e) => {
  const el = e.target;
  if (el.matches('textarea[data-f]')) { const d = entry(); if (el.value.trim()) d[el.dataset.f] = el.value; else delete d[el.dataset.f]; queueSave(S.day); }
});

$app.addEventListener('submit', async (e) => {
  if (await lib.onSubmit(e)) return;
  if (e.target.id === 'goal-form') {
    e.preventDefault();
    const fd = new FormData(e.target);
    const title = String(fd.get('title') || '').trim();
    if (!title) return;
    const step = String(fd.get('step') || '').trim();
    const row = { title, cat1: fd.get('cat1') || 'Personal', cat2: fd.get('cat2') || null, priority: S.newPrio || 3, status: 'active',
      steps: step ? [{ id: uid(), text: step, done: false, created: todayIso() }] : [] };
    const { data, error } = await sb.from('goals').insert(row).select('*').single();
    const g = error ? { ...row, id: uid(), created_at: new Date().toISOString() } : data;
    if (error) console.error(error);
    S.goals.push(g); store.set('lp-goals', S.goals);
    S.goalNew = false; S.goalTab = 'active'; S.movedGoal = g.id; render(); window.scrollTo(0, 0);
    setTimeout(() => { S.movedGoal = null; }, 1500);
    return;
  }
  if (e.target.id === 'step-form') {
    e.preventDefault();
    const input = e.target.querySelector('input[name=step]');
    const text = input.value.trim();
    if (!text) return;
    const g = S.goals.find((x) => x.id === S.goalOpen);
    const steps = [...(g.steps || []), { id: uid(), text, done: false, created: todayIso() }];
    g.steps = steps; render();
    document.querySelector('#step-form input')?.focus();
    await saveGoal(g, { steps });
    return;
  }
  if (e.target.id !== 'auth-form') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const email = fd.get('email'); const password = fd.get('password');
  S.authMsg = S.authMode === 'signup' ? 'Creating your account…' : 'Signing in…'; render();
  if (S.authMode === 'signup') {
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
    if (error) S.authMsg = /closed|Database error/i.test(error.message) ? 'An account already exists. Sign in instead.' : error.message;
    else if (!data.session) { S.authMode = 'signin'; S.authMsg = 'Account created. Check your email and tap the confirmation link, then sign in here.'; }
  } else {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) S.authMsg = /confirm/i.test(error.message) ? 'Confirm your email first (check your inbox), then sign in.' : 'That email and password don’t match.';
  }
  render();
});

// ---------- push ----------
function urlB64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function enablePush() {
  const msg = document.getElementById('push-msg');
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      msg.textContent = /iPhone|iPad/.test(navigator.userAgent) ? 'On iPhone: tap Share, then “Add to Home Screen”, open the app from there and try again.' : 'This browser can’t receive reminders.';
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { msg.textContent = 'Notifications weren’t allowed. You can change this in your phone settings.'; return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) });
    const json = sub.toJSON();
    const { error } = await sb.from('push_subscriptions').upsert({ endpoint: json.endpoint, subscription: json }, { onConflict: 'endpoint' });
    if (error) throw error;
    S.settings.reminders = { ...DEFAULT_SETTINGS.reminders, ...S.settings.reminders, enabled: true };
    await saveSettings();
    render();
    document.getElementById('push-msg').textContent = 'Reminders are on. Tap “Send a test” to check.';
  } catch (err) {
    console.error(err);
    msg.textContent = 'Something went wrong turning on reminders. Try again in a moment.';
  }
}

// ---------- boot ----------
function jumpFromUrl() {
  const q = new URLSearchParams(location.search);
  const card = q.get('card');
  const day = q.get('day');
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= todayIso()) {
    S.view = 'today'; S.day = day; render(); window.scrollTo(0, 0);
    history.replaceState(null, '', location.pathname);
    return;
  }
  if (card) {
    S.view = 'today'; S.day = todayIso(); render();
    requestAnimationFrame(() => document.getElementById(`card-${card}`)?.scrollIntoView({ block: 'start' }));
    history.replaceState(null, '', location.pathname);
  }
}

sb.auth.onAuthStateChange((event, session) => {
  const was = !!S.session;
  S.session = session;
  if (session && !was) { render(); loadAll().then(() => { render(); jumpFromUrl(); }); }
  if (!session && was) { S.authMsg = ''; render(); }
});

(async () => {
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  render();
  if (S.session) { await loadAll(); render(); jumpFromUrl(); }
})();

// Refresh "today" when the app is reopened on a new day
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.session) {
    if (S.lastSeenDay !== todayIso() && S.day === S.lastSeenDay) S.day = todayIso();
    S.lastSeenDay = todayIso();
    loadAll().then(render);
  }
});
S.lastSeenDay = todayIso();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
