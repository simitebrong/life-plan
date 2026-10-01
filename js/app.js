import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY, APP_VERSION } from './config.js';
import {
  AREAS, AREA_ORDER, CARDS, FIELDS, FIELD, DEFAULT_SETTINGS, targetFor, scoreDay,
  computeCurrentDays, wellbeingReading, isAnswered, visibleFields, fieldPoints,
} from './fields.js';
import { SEED_GOALS, CATEGORIES } from './goals-seed.js';

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

const ctxFor = (day) => ({ target: targetFor(day, S.settings.drinkPlan), baselineSpend: Number(S.settings.baselineSpend) || 12 });
const entry = (day = S.day) => (S.entries[day] ||= {});

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

async function loadAll() {
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
    default: return '';
  }
}

function fieldRow(f, d) {
  const done = isAnswered(f, d);
  const p = f.area ? fieldPoints(f, f.type === 'auto' ? d.currentDays : d[f.id], ctxFor(S.day)) : null;
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
  const n = Object.keys(d).filter((k) => !k.startsWith('_') && !['notes', 'done', 'currentDays', 'targetAchieved'].includes(k)).length;
  return !d.done && n < 20;
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

function viewGoals() {
  const goals = [...S.goals].sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
  const rows = goals.map((g) => {
    const open = S.openPriority === g.id;
    return `<li class="goal${S.movedGoal === g.id ? ' moved' : ''}" data-p="${g.priority}">
      <button type="button" class="prio p${g.priority}" data-act="prio-open" data-id="${g.id}" aria-label="Priority ${g.priority}, change">${g.priority}</button>
      <div class="goal-body">
        <span class="goal-title">${esc(g.title)}</span>
        <span class="goal-cats">${esc(g.cat1 || '')}${g.cat2 ? ` <span class="sep">/</span> ${esc(g.cat2)}` : ''}</span>
        ${open ? `<div class="prio-pick" role="group" aria-label="Choose priority">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="prio p${n}${n === g.priority ? ' on' : ''}" data-act="prio-set" data-id="${g.id}" data-n="${n}">${n}</button>`).join('')}</div>` : ''}
      </div>
    </li>`;
  }).join('');
  return `<section class="page">
    <h1>Goals</h1>
    <p class="lead">Tap a number to change its priority. The list re-sorts itself.</p>
    <ul class="goal-list">${rows}</ul>
    <p class="note">Next update: your 40s vision, steps and progress notes for each goal, and ideas for how to achieve them.</p>
  </section>`;
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
  ['progress', 'Progress', '<path d="M4 19V11M10 19V5M16 19v-6M22 19H2"/>'],
  ['goals', 'Goals', '<path d="M5 21V4l7 3 7-3v11l-7 3-7-3"/>'],
  ['settings', 'Settings', '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'],
];

function render() {
  if (!S.session) { $app.innerHTML = viewAuth(S.authMsg); return; }
  const y = window.scrollY;
  const views = { today: viewToday, progress: viewProgress, goals: viewGoals, settings: viewSettings };
  $app.innerHTML = `<main class="view view-${S.view}">${views[S.view]()}</main>
    <nav class="tabbar" aria-label="Sections">${TABS.map(([id, label, icon]) => `<button type="button" class="tab${S.view === id ? ' on' : ''}" data-act="tab" data-v="${id}" aria-current="${S.view === id ? 'page' : 'false'}">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg><span>${label}</span></button>`).join('')}</nav>
    ${S.sheet ? sheetHTML() : ''}`;
  window.scrollTo(0, y);
  setSaveState(S.saveState);
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
    case 'tab': S.view = el.dataset.v; S.openPriority = null; render(); window.scrollTo(0, 0); break;
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
  if (el.matches('.date-pick')) { if (el.value && el.value <= todayIso()) { S.day = el.value; render(); } return; }
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
