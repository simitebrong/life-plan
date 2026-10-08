// Life Plan — analysis engine. Pure functions, no DOM: used by the app's Progress
// screen and by the weekly-review edge function (Deno), so the numbers always agree.
import {
  AREAS, AREA_ORDER, FIELDS, FIELD, CARDS, targetFor, scoreDay, wellbeingReading,
  workoutTarget, workoutScore, timeToMins, fieldPoints, DEFAULT_SETTINGS,
} from './fields.js';

// ---------- dates (timezone-proof: everything at UTC noon) ----------
const D = (iso) => Date.parse(iso + 'T12:00:00Z');
const pad = (n) => String(n).padStart(2, '0');
export const iso = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const addDays = (day, n) => iso(D(day) + n * 86400000);
export const dayDiff = (a, b) => Math.round((D(b) - D(a)) / 86400000);
export const weekday = (day) => (new Date(D(day)).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
export const weekStart = (day) => addDays(day, -weekday(day));
export function daysBetween(a, b) { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; }

const answered = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
export const isLogged = (e) => !!e && Object.keys(e).some((k) => !k.startsWith('_') && !['currentDays', 'targetAchieved', 'workoutTarget'].includes(k) && answered(e[k]));
export const loggedDays = (entries) => Object.keys(entries).filter((k) => isLogged(entries[k])).sort();

const mean = (a) => { const v = a.filter((x) => x != null && !Number.isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const sum = (a) => a.filter((x) => x != null).reduce((s, x) => s + x, 0);
export const round = (x, dp = 0) => (x == null ? null : Math.round(x * 10 ** dp) / 10 ** dp);

export function makeCtx(settings = {}) {
  const st = { ...DEFAULT_SETTINGS, ...settings };
  const cache = {};
  return (day) => (cache[day] ||= {
    target: targetFor(day, st.drinkPlan),
    baselineSpend: Number(st.baselineSpend) || 12,
    workoutTarget: workoutTarget(day, st.workoutPlan),
  });
}

// ---------- formatting ----------
export const fmtTime = (m) => { if (m == null) return '–'; const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };
export const fmtNum = (dp = 0) => (v) => (v == null ? '–' : (Math.round(v * 10 ** dp) / 10 ** dp).toLocaleString('en-GB', { maximumFractionDigits: dp }));
export const fmtMoney = (v) => (v == null ? '–' : `£${Math.round(v).toLocaleString('en-GB')}`);
export const fmtHours = (v) => (v == null ? '–' : `${Math.floor(v)}h ${pad(Math.round((v % 1) * 60))}m`);

// ---------- metric catalogue ----------
// kind: 'num' (plotted as a line/bars) or 'cat' (a choice, plotted as a strip + counts)
// better: 1 higher is better, -1 lower is better, 0 neutral
// night: describes the night before (Morning card), which matters for "what led to what"
// src: the fields a metric is built from, so patterns never "discover" a metric explaining itself
const SEVERITY = { none: 0, low: 1, minor: 1, manageable: 2, medium: 2, difficult: 3, severe: 3 };
const SCORED = FIELDS.filter((f) => f.area).map((f) => f.id);

function fieldMetric(f) {
  const base = { id: f.id, label: f.label, card: f.card, group: CARDS.find((c) => c.id === f.card)?.title, night: f.card === 'morning', src: [f.id], field: f };
  if (f.type === 'time') {
    const evening = !!f.evening;
    return { ...base, kind: 'num', unit: 'time', fmt: fmtTime, better: f.better ?? (f.id === 'firstDrink' ? 1 : -1),
      get: (e) => timeToMins(e[f.id], evening), chart: 'line' };
  }
  if (f.type === 'count') return { ...base, kind: 'num', fmt: fmtNum(1), better: -1, get: (e) => (typeof e[f.id] === 'number' ? e[f.id] : null), chart: 'bar', zero: true };
  if (f.type === 'money') return { ...base, kind: 'num', unit: '£', fmt: fmtMoney, better: -1, get: (e) => (typeof e[f.id] === 'number' ? e[f.id] : null), chart: 'bar', zero: true };
  if (f.type === 'auto') return { ...base, kind: 'num', fmt: fmtNum(0), better: 0, get: (e) => (answered(e.release) && typeof e[f.id] === 'number' ? e[f.id] : null), chart: 'line', src: ['currentDays', 'release'] };
  if (f.type === 'choice' && f.scale) {
    const vals = f.options.map((o) => o.v);
    const better = f.better ?? (['stress', 'anxiety', 'eczema'].includes(f.id) ? -1 : 1);
    return { ...base, kind: 'num', scale: true, domain: [Math.min(...vals), Math.max(...vals)], fmt: fmtNum(1), better,
      get: (e) => (typeof e[f.id] === 'number' ? e[f.id] : null), chart: 'line' };
  }
  if (f.type === 'choice') {
    const severity = f.options.every((o) => o.v in SEVERITY) && f.options.some((o) => o.v === 'none');
    const ordinal = severity || !!f.ranked; // ranked: options listed worst to best
    const levels = f.options.map((o, i) => ({ v: o.v, label: o.label, rank: severity ? SEVERITY[o.v] : i, pts: o.pts }));
    return { ...base, kind: 'cat', ordinal, levels, better: f.ranked ? 1 : severity && !f.area ? -1 : 0,
      get: (e) => (answered(e[f.id]) ? e[f.id] : null),
      // numeric reading so cat fields can be outcomes too: severity for symptoms, points for scored choices
      num: ordinal ? (e) => (answered(e[f.id]) ? levels.find((l) => l.v === e[f.id])?.rank ?? null : null) : null };
  }
  if (f.type === 'multi') {
    const levels = f.options.filter((o) => !o.exclusive).map((o) => ({ v: o.v, label: o.label }));
    return { ...base, kind: 'num', multi: true, levels, label: `${f.label} (how many)`, fmt: fmtNum(1), better: 1,
      get: (e) => (Array.isArray(e[f.id]) ? e[f.id].filter((x) => levels.some((l) => l.v === x)).length : null), chart: 'bar', zero: true };
  }
  return null;
}

export function buildMetrics() {
  const m = [];
  const add = (x) => { m.push(x); return x; };
  // Derived first: these are the headline numbers
  add({ id: 'score', label: 'Day score', group: 'Overview', kind: 'num', domain: [0, 100], fmt: fmtNum(0), better: 1, chart: 'line', src: SCORED,
    get: (e, day, ctx) => scoreDay(e, ctx(day)).overall });
  for (const a of AREA_ORDER) add({ id: `area.${a}`, label: AREAS[a].label, area: a, group: 'Overview', kind: 'num', domain: [0, 100], fmt: fmtNum(0), better: 1, chart: 'line',
    src: FIELDS.filter((f) => f.area === a).map((f) => f.id), get: (e, day, ctx) => scoreDay(e, ctx(day)).areas[a] ?? null });
  add({ id: 'wellbeing', label: 'Wellbeing reading', group: 'How I felt', kind: 'num', domain: [0, 100], fmt: fmtNum(0), better: 1, chart: 'line',
    src: ['stress', 'selfEsteem', 'anxiety', 'motivation', 'ptsd', 'palpitations'], get: (e) => wellbeingReading(e) });
  add({ id: 'workoutScore', label: 'Workout points', group: 'Movement', kind: 'num', fmt: fmtNum(0), better: 1, chart: 'bar', zero: true,
    src: ['homeWorkout', 'workoutScore', 'morningWorkout', 'middayWorkout'], target: (day, ctx) => ctx(day).workoutTarget,
    get: (e) => (typeof e.workoutScore === 'number' ? e.workoutScore : e.workout ? workoutScore(e.workout) : e.done ? 0 : null) });
  add({ id: 'workoutPct', label: 'Workout, % of target', group: 'Movement', kind: 'num', unit: '%', fmt: (v) => (v == null ? '–' : `${Math.round(v)}%`), better: 1, chart: 'bar', zero: true,
    src: ['homeWorkout', 'workoutScore', 'morningWorkout', 'middayWorkout'],
    get: (e, day, ctx) => { const w = typeof e.workoutScore === 'number' ? e.workoutScore : e.done ? 0 : null; return w == null ? null : (w / ctx(day).workoutTarget) * 100; } });
  add({ id: 'drinksVsTarget', label: 'Drinks vs target', group: 'Drinks', kind: 'num', fmt: (v) => (v == null ? '–' : v > 0 ? `+${v}` : String(v)), better: -1, chart: 'bar',
    src: ['drinkCount', 'targetAchieved'], get: (e, day, ctx) => (typeof e.drinkCount === 'number' && ctx(day).target != null ? e.drinkCount - ctx(day).target : null) });
  add({ id: 'saved', label: 'Saved vs usual spend', group: 'Drinks', kind: 'num', unit: '£', fmt: fmtMoney, better: 1, chart: 'bar', cumulative: true,
    src: ['spend'], get: (e, day, ctx) => (typeof e.spend === 'number' ? ctx(day).baselineSpend - e.spend : null) });
  add({ id: 'drinkHours', label: 'Drinking window', group: 'Drinks', kind: 'num', unit: 'h', fmt: fmtHours, better: -1, chart: 'line',
    src: ['firstDrink', 'lastDrink'], get: (e) => { const a = timeToMins(e.firstDrink, true); const b = timeToMins(e.lastDrink, true); return a != null && b != null && b >= a ? (b - a) / 60 : null; } });
  add({ id: 'hoursInBed', label: 'Time in bed', group: 'Morning', kind: 'num', unit: 'h', night: true, fmt: fmtHours, better: 1, chart: 'line',
    src: ['bedTime', 'outOfBed'], prev: true,
    get: (e, day, ctx, entries) => {
      const bed = timeToMins(entries[addDays(day, -1)]?.bedTime, true); const up = timeToMins(e.outOfBed);
      if (bed == null || up == null) return null; const h = (up + 1440 - bed) / 60; return h >= 3 && h <= 14 ? h : null;
    } });
  add({ id: 'readMins', label: 'Reading minutes', group: 'Mind & growth', kind: 'num', unit: 'min', fmt: fmtNum(0), better: 1, chart: 'bar', zero: true,
    src: ['readSecs'], get: (e) => (e.readSecs ? e.readSecs / 60 : e.done ? 0 : null) });
  for (const f of FIELDS) { const x = fieldMetric(f); if (x) add(x); }
  // Work: a working-day flag (the toggle) and hours between logging on and closing the laptop
  add({ id: 'workDay', label: 'Working day', group: 'Work', card: 'work', kind: 'cat', src: ['workOff', 'workStart', 'workEnd', 'workIntensity', 'workFeeling', 'splashDown'],
    levels: [{ v: 'yes', label: 'Working day', rank: 0 }, { v: 'no', label: 'Day off', rank: 1 }], better: 0, factorShort: 'it was a working day',
    get: (e) => (e.workOff ? 'no' : ['workStart', 'workEnd', 'workIntensity', 'workFeeling', 'splashDown'].some((k) => answered(e[k])) ? 'yes' : null) });
  add({ id: 'workHours', label: 'Working hours', group: 'Work', card: 'work', kind: 'num', unit: 'h', fmt: fmtHours, better: 0, chart: 'bar', zero: true,
    src: ['workStart', 'workEnd'], get: (e) => {
      if (e.workOff) return null; const a = timeToMins(e.workStart); let b = timeToMins(e.workEnd);
      if (a == null || b == null) return null; if (b < a) b += 1440; const h = (b - a) / 60; return h > 0 && h <= 18 ? h : null;
    } });
  // Drinks count keeps its familiar name and gets a target line
  const dc = m.find((x) => x.id === 'drinkCount'); dc.target = (day, ctx) => ctx(day).target; dc.src = ['drinkCount', 'targetAchieved'];
  m.find((x) => x.id === 'targetAchieved').src = ['drinkCount', 'targetAchieved'];
  return m;
}
export const METRICS = buildMetrics();
export const METRIC = Object.fromEntries(METRICS.map((x) => [x.id, x]));
export const METRIC_GROUPS = ['Overview', ...CARDS.filter((c) => c.id !== 'notes').map((c) => c.title)];

// value of a metric on a day (null = not recorded)
export function valueOf(m, entries, day, ctx) {
  const e = entries[day];
  if (!e || !isLogged(e)) return null;
  const v = m.get(e, day, ctx, entries);
  return v === undefined ? null : v;
}
export const numOf = (m, entries, day, ctx) => {
  if (m.kind === 'num') return valueOf(m, entries, day, ctx);
  const e = entries[day]; return e && m.num ? m.num(e) : null;
};

export function series(metricId, days, entries, settings, ctx = makeCtx(settings)) {
  const m = METRIC[metricId];
  return days.map((day) => ({ day, v: valueOf(m, entries, day, ctx), t: m.target ? m.target(day, ctx) : null }));
}

export function rolling(values, n = 7) {
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - n + 1), i + 1).filter((x) => x != null);
    return w.length >= Math.min(3, n) ? w.reduce((s, x) => s + x, 0) / w.length : null;
  });
}

// Group a daily series into Monday-start weeks (for long ranges)
export function byWeek(points, agg = 'mean') {
  const map = new Map();
  for (const p of points) { const k = weekStart(p.day); if (!map.has(k)) map.set(k, []); map.get(k).push(p); }
  return [...map].map(([day, ps]) => {
    const vs = ps.map((p) => p.v).filter((x) => x != null);
    const ts = ps.map((p) => p.t).filter((x) => x != null);
    return { day, week: true, n: vs.length, v: vs.length ? (agg === 'sum' ? sum(vs) : mean(vs)) : null, t: ts.length ? mean(ts) : null };
  });
}

// ---------- ranges ----------
export const RANGES = [
  { id: 'week', label: '7 days', days: 7 },
  { id: 'month', label: '30 days', days: 30 },
  { id: 'quarter', label: '90 days', days: 90 },
  { id: 'all', label: 'All', days: null },
];
export function rangeDays(rangeId, today, entries) {
  const r = RANGES.find((x) => x.id === rangeId) || RANGES[0];
  const first = loggedDays(entries)[0] || today;
  let start = r.days ? addDays(today, -(r.days - 1)) : first;
  if (!r.days && dayDiff(start, today) < 6) start = addDays(today, -6);
  return daysBetween(start, today);
}
export function previousRange(days) {
  const n = days.length; const end = addDays(days[0], -1);
  return daysBetween(addDays(end, -(n - 1)), end);
}

// ---------- period stats ----------
export function periodStats(days, entries, settings, ctx = makeCtx(settings), live = null) {
  const logged = days.filter((d) => isLogged(entries[d]));
  const e = (d) => entries[d];
  // a day still in progress would drag averages down, so its score waits until it's finished
  const scored = logged.filter((d) => !(d === live && !e(d).done));
  const scores = scored.map((d) => scoreDay(e(d), ctx(d)));
  const areaAvg = {};
  for (const a of AREA_ORDER) areaAvg[a] = round(mean(scores.map((s) => s.areas[a] ?? null)));
  const drinkDays = logged.filter((d) => typeof e(d).drinkCount === 'number');
  const spendDays = logged.filter((d) => typeof e(d).spend === 'number');
  const W = METRIC.workoutScore;
  const wVals = logged.map((d) => W.get(e(d), d, ctx)).filter((x) => x != null);
  const wHit = logged.filter((d) => (W.get(e(d), d, ctx) || 0) >= ctx(d).workoutTarget).length;
  const best = scored.map((d, i) => ({ day: d, score: scores[i].overall })).filter((x) => x.score != null).sort((a, b) => b.score - a.score)[0] || null;
  const m = (id) => round(mean(logged.map((d) => numOf(METRIC[id], entries, d, ctx))), 1);
  return {
    from: days[0], to: days[days.length - 1], days: days.length,
    logged: logged.length, finished: logged.filter((d) => e(d).done).length,
    avgScore: round(mean(scores.map((s) => s.overall))),
    areaAvg, best,
    drinks: {
      days: drinkDays.length, total: sum(drinkDays.map((d) => e(d).drinkCount)),
      avg: round(mean(drinkDays.map((d) => e(d).drinkCount)), 1),
      avgTarget: round(mean(drinkDays.map((d) => ctx(d).target)), 1),
      atOrUnder: drinkDays.filter((d) => ctx(d).target == null || e(d).drinkCount <= ctx(d).target).length,
      dry: drinkDays.filter((d) => e(d).drinkCount === 0).length,
      firstDrink: round(mean(logged.map((d) => timeToMins(e(d).firstDrink, true)))),
      lastDrink: round(mean(logged.map((d) => timeToMins(e(d).lastDrink, true)))),
    },
    spend: { days: spendDays.length, total: sum(spendDays.map((d) => e(d).spend)), saved: sum(spendDays.map((d) => ctx(d).baselineSpend - e(d).spend)) },
    workout: { total: sum(wVals), days: wVals.filter((x) => x > 0).length, hitTarget: wHit, avg: round(mean(wVals)) },
    sleep: { quality: m('sleepQuality'), outOfBed: m('outOfBed'), bedTime: m('bedTime'), hoursInBed: m('hoursInBed') },
    felt: { stress: m('stress'), anxiety: m('anxiety'), motivation: m('motivation'), selfEsteem: m('selfEsteem'), wellbeing: m('wellbeing') },
    readMins: round(sum(logged.map((d) => (e(d).readSecs || 0) / 60))),
  };
}

// Consecutive days logged, ending today (or yesterday if today isn't logged yet)
export function streak(entries, today) {
  let d = isLogged(entries[today]) ? today : addDays(today, -1); let n = 0;
  while (isLogged(entries[d])) { n++; d = addDays(d, -1); }
  return n;
}

// ---------- habits ----------
// A habit is "done" when a scored field earned points that day. Workouts use the target.
export const HABITS = [
  ['morningVitamins', 'Morning vitamins'], ['eveningVitamins', 'Evening vitamins'], ['homeWorkout', 'Home workout'],
  ['targetAchieved', 'Drinks on target'], ['loAlarm', 'Last-orders alarm'], ['dinner', 'Healthy dinner'],
  ['eveningTreats', 'No evening treats'], ['bedTime', 'Bed by 22:30'], ['outOfBed', 'Up by 06:30'],
  ['duolingo', 'Duolingo'], ['visualisation', 'Visualisation'], ['goals', 'Goal progress'], ['fcProject', 'FC project'],
  ['basil', 'Basil'], ['splashDown', 'Post-work splash down'], ['social', 'Social'], ['fun', 'Fun & hobbies'], ['stretcher', 'Stretcher'], ['decMH', 'Positive mental-health choice'],
];
export function habitDone(id, e, day, ctx) {
  if (!e) return null;
  if (id === 'homeWorkout') { const w = METRIC.workoutScore.get(e, day, ctx); return w == null ? null : w > 0; }
  if (id === 'bedTime') { const m = timeToMins(e.bedTime, true); return m == null ? null : m <= 1350; }
  if (id === 'outOfBed') { const m = timeToMins(e.outOfBed); return m == null ? null : m <= 390; }
  if (id === 'eveningTreats') return answered(e.eveningTreats) ? e.eveningTreats === 'none' : null;
  if (id === 'dinner') return answered(e.dinner) ? e.dinner === 'healthy' : null;
  if (id === 'splashDown') return e.workOff || !answered(e.splashDown) ? null : e.splashDown === 'yes';
  const f = FIELD[id]; const v = e[id];
  if (!answered(v)) return null;
  if (f.type === 'multi') return v.some((x) => !f.options.find((o) => o.v === x)?.exclusive);
  return (fieldPoints(f, v, ctx(day)) || 0) > 0;
}
export function habitGrid(days, entries, settings, ctx = makeCtx(settings)) {
  return HABITS.map(([id, label]) => {
    const cells = days.map((d) => (isLogged(entries[d]) ? habitDone(id, entries[d], d, ctx) : null));
    const known = cells.filter((x) => x != null);
    return { id, label, cells, hits: known.filter(Boolean).length, of: known.length };
  }).filter((h) => h.of > 0);
}

// ---------- patterns ----------
// Compares an outcome on days with vs without a factor (same day, or the day after).
// With little data these are possibilities, not conclusions; the strength label says so.
const OUTCOMES = ['workIntensity', 'workFeeling', 'workHours', 'sleepQuality', 'hoursInBed', 'nightTerrors', 'morningWood', 'outOfBed', 'stress', 'anxiety', 'motivation', 'selfEsteem',
  'wellbeing', 'palpitations', 'ptsd', 'eczema', 'drinkCount', 'firstDrink', 'lastDrink', 'spend', 'workoutScore', 'bedTime', 'intimacy', 'score'];
const RELATED = [['workStart', 'workHours'], ['workEnd', 'workHours'], ['drinkCount', 'targetAchieved', 'spend'], ['homeWorkout', 'workoutScore', 'morningWorkout', 'middayWorkout'], ['release', 'currentDays'],
  ['bedTime', 'hoursInBed'], ['outOfBed', 'hoursInBed'], ['firstDrink', 'drinkHours'], ['lastDrink', 'drinkHours']];
const SKIP_FACTORS = new Set(['notes', 'currentDays', 'homeWorkout', 'workoutPct', 'saved', 'wellbeing', 'drinksVsTarget', 'readMins', 'targetAchieved']);
// lower-case a label for use mid-sentence, but leave acronyms (PTSD, FC) alone
const lc = (t) => t.replace(/\b([A-Z])([a-z])/g, (_, a, b) => a.toLowerCase() + b);

// Links worth looking for first. Anything else needs far more evidence before it's shown,
// so a handful of days can't produce a list of coincidences.
const FAM = {
  drinks: ['drinkCount', 'firstDrink', 'lastDrink', 'drinkHours', 'spend', 'loAlarm'],
  sleep: ['sleepQuality', 'hoursInBed', 'nightTerrors', 'outOfBed', 'bedTime', 'whichBed', 'snoring', 'morningWood'],
  evening: ['bedTime', 'eveningTreats', 'eveningVitamins', 'bedWithJen', 'dinner', 'lastDrink', 'drinkCount'],
  move: ['workoutScore', 'morningWorkout', 'middayWorkout', 'club', 'otherActivity', 'schoolRuns'],
  felt: ['stress', 'anxiety', 'motivation', 'selfEsteem', 'ptsd', 'palpitations'],
  rel: ['intimacy', 'release', 'cage', 'stretcher', 'staminaTraining', 'service', 'bedWithJen'],
  mind: ['social', 'fun', 'visualisation', 'goals', 'duolingo', 'fcProject', 'basil', 'decMH', 'clothes', 'driving'],
  work: ['workDay', 'workStart', 'workEnd', 'workHours', 'workIntensity', 'workFeeling', 'splashDown'],
  food: ['dinner', 'eveningTreats', 'snacks', 'breakfast', 'lunch', 'morningVitamins', 'eveningVitamins'],
};
const MOOD = ['stress', 'anxiety', 'motivation', 'selfEsteem', 'wellbeing'];
const SLEEP_OUT = ['sleepQuality', 'hoursInBed', 'nightTerrors', 'morningWood', 'outOfBed'];
const KEY = [
  [FAM.work, [...MOOD, 'drinkCount', 'firstDrink', 'lastDrink', 'spend', 'sleepQuality', 'hoursInBed', 'nightTerrors', 'bedTime', 'workoutScore', 'palpitations', 'eczema', 'score']],
  [[...FAM.sleep, ...FAM.drinks, ...FAM.move, 'stress', 'anxiety', 'motivation'], ['workIntensity', 'workFeeling', 'workHours']],
  [FAM.drinks, [...SLEEP_OUT, ...MOOD, 'palpitations', 'eczema', 'workoutScore', 'score']],
  [FAM.sleep, [...MOOD, 'drinkCount', 'firstDrink', 'workoutScore', 'score', 'palpitations']],
  [FAM.evening, SLEEP_OUT],
  [FAM.move, [...MOOD, 'sleepQuality', 'nightTerrors', 'hoursInBed', 'drinkCount', 'firstDrink', 'score', 'eczema']],
  [FAM.felt, ['drinkCount', 'firstDrink', 'lastDrink', 'spend', 'workoutScore', 'sleepQuality', 'nightTerrors', 'bedTime', 'score', 'intimacy']],
  [FAM.rel, [...MOOD, 'sleepQuality', 'morningWood', 'drinkCount', 'score']],
  [FAM.mind, [...MOOD, 'drinkCount', 'score']],
  [FAM.food, ['sleepQuality', 'eczema', 'stress', 'motivation', 'wellbeing', 'drinkCount']],
];
const isKey = (f, o) => KEY.some(([fs, os]) => fs.includes(f) && os.includes(o));

function expand(src) {
  const s = new Set(src);
  for (const g of RELATED) if (g.some((x) => s.has(x))) g.forEach((x) => s.add(x));
  return s;
}

// seeded RNG so results are stable between renders
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; }

function permP(a, b, iters, rand) {
  const all = [...a, ...b]; const na = a.length; const obs = Math.abs(mean(a) - mean(b));
  const tot = sum(all); let hits = 0;
  for (let i = 0; i < iters; i++) {
    for (let j = all.length - 1; j > 0; j--) { const k = Math.floor(rand() * (j + 1)); [all[j], all[k]] = [all[k], all[j]]; }
    let sa = 0; for (let j = 0; j < na; j++) sa += all[j];
    const diff = Math.abs(sa / na - (tot - sa) / (all.length - na));
    if (diff >= obs - 1e-9) hits++;
  }
  return (hits + 1) / (iters + 1);
}

// Factors: each a yes/no reading per day
export function buildFactors(days, entries, ctx) {
  const factors = [];
  const logged = days.filter((d) => isLogged(entries[d]));
  for (const m of METRICS) {
    if (SKIP_FACTORS.has(m.id) || m.id.startsWith('area.') || m.id === 'score') continue;
    const night = !!m.night;
    if (m.kind === 'cat') {
      const lv = m.levels;
      const pts = lv.map((o) => o.pts ?? 0);
      const mono = pts.every((x, i) => !i || x > pts[i - 1]) || pts.every((x, i) => !i || x < pts[i - 1]);
      const vals = Object.fromEntries(logged.map((d) => [d, valueOf(m, entries, d, ctx)]));
      if (lv.length > 2 && (m.ordinal || mono)) {
        // ordered choice: split into "this level or higher" vs the rest, as evenly as possible
        const rankOf = (v) => { const o = lv.find((x) => x.v === v); return o ? (m.ordinal ? o.rank : o.pts) : null; };
        const ranks = [...new Set(lv.map((o) => (m.ordinal ? o.rank : o.pts)))].sort((a, b) => a - b);
        const known = logged.map((d) => rankOf(vals[d])).filter((x) => x != null);
        let cut = null; let bal = Infinity;
        for (const r of ranks.slice(1)) { const hi = known.filter((x) => x >= r).length; const b = Math.abs(hi - (known.length - hi)); if (hi && hi < known.length && b < bal) { bal = b; cut = r; } }
        if (cut == null) continue;
        const top = lv.filter((o) => (m.ordinal ? o.rank : o.pts) >= cut).map((o) => o.label.toLowerCase());
        const words = top.length === 1 ? `“${top[0]}”` : `${top.slice(0, -1).map((t) => `“${t}”`).join(', ')} or “${top[top.length - 1]}”`;
        factors.push({ id: `${m.id}>=${cut}`, metric: m.id, src: m.src, night, label: `${m.label}: ${top.join(' or ')}`, short: `${lc(m.label)} was ${words}`,
          vals: Object.fromEntries(logged.map((d) => [d, vals[d] == null ? null : rankOf(vals[d]) >= cut])) });
        continue;
      }
      const opts = lv.length === 2 ? [lv[0]] : lv;
      for (const o of opts) {
        factors.push({ id: `${m.id}=${o.v}`, metric: m.id, src: m.src, night, label: `${m.label}: ${o.label}`, short: m.factorShort || `${lc(m.label)} was “${o.label.toLowerCase()}”`,
          vals: Object.fromEntries(logged.map((d) => [d, vals[d] == null ? null : vals[d] === o.v])) });
      }
      continue;
    }
    if (m.multi) {
      for (const o of m.levels) {
        const f = m.field;
        const vals = logged.map((d) => { const v = entries[d][f.id]; return Array.isArray(v) ? v.includes(o.v) : null; });
        factors.push({ id: `${f.id}∋${o.v}`, metric: f.id, src: m.src, night, label: `${f.label}: ${o.label}`, short: `${lc(f.label)} included ${o.label.toLowerCase()}`, vals: Object.fromEntries(logged.map((d, i) => [d, vals[i]])) });
      }
      continue;
    }
    // numeric: split at the cut that balances the two groups best
    const pairs = logged.map((d) => [d, valueOf(m, entries, d, ctx)]).filter(([, v]) => v != null);
    const uniq = [...new Set(pairs.map(([, v]) => v))].sort((a, b) => a - b);
    if (uniq.length < 2) continue;
    let bestCut = null; let bestBal = Infinity;
    for (let i = 1; i < uniq.length; i++) {
      const hi = pairs.filter(([, v]) => v >= uniq[i]).length; const bal = Math.abs(hi - (pairs.length - hi));
      if (bal < bestBal) { bestBal = bal; bestCut = uniq[i]; }
    }
    const isTime = m.unit === 'time';
    const cutTxt = m.fmt(bestCut);
    factors.push({ id: `${m.id}>=${bestCut}`, metric: m.id, src: m.src, night,
      label: isTime ? `${m.label} at ${cutTxt} or later` : `${m.label} ${cutTxt} or more`,
      short: isTime ? `${lc(m.label)} was at ${cutTxt} or later` : `${lc(m.label)} was ${cutTxt} or more`,
      vals: Object.fromEntries(pairs.map(([d, v]) => [d, v >= bestCut])) });
  }
  return factors;
}

export function strengthOf(nMin, p) {
  if (nMin >= 10 && p < 0.05) return { id: 'strong', label: 'Consistent pattern' };
  if (nMin >= 5 && p < 0.1) return { id: 'emerging', label: 'Emerging pattern' };
  return { id: 'early', label: 'Early hint' };
}

export function findPatterns(entries, settings, opts = {}) {
  const ctx = opts.ctx || makeCtx(settings);
  const all = loggedDays(entries);
  const days = opts.days ? opts.days.filter((d) => isLogged(entries[d])) : all;
  if (days.length < 5) return [];
  const minN = opts.minN ?? (days.length < 14 ? 3 : 4);
  const maxP = opts.maxP ?? (days.length < 14 ? 0.12 : 0.1);
  const factors = buildFactors(days, entries, ctx);
  const rand = rng(days.length * 7919 + all.length);
  const out = [];
  for (const oid of OUTCOMES) {
    const O = METRIC[oid]; if (!O) continue;
    // scores only count once a day is finished; part-logged days would look like bad days
    const oVals = Object.fromEntries(days.map((d) => [d, oid === 'score' && !entries[d].done ? null : numOf(O, entries, d, ctx)]));
    const known = Object.values(oVals).filter((x) => x != null);
    if (known.length < minN * 2 || new Set(known).size < 2) continue;
    const oSrc = expand(O.src);
    for (const F of factors) {
      if (F.metric === oid) continue;
      const overlap = [...expand(F.src)].some((x) => oSrc.has(x));
      for (const lag of [0, 1]) {
        if (lag === 0 && (overlap || (O.night && !F.night))) continue; // same-field or "after caused before"
        if (lag === 1 && F.night) continue;
        if (lag === 1 && O.prev && overlap) continue; // e.g. last night's bed time already sits inside time in bed
        const a = []; const b = [];
        for (const d of days) {
          const y = oVals[d]; if (y == null) continue;
          const x = F.vals[lag ? addDays(d, -1) : d]; if (x == null) continue;
          (x ? a : b).push(y);
        }
        if (a.length < minN || b.length < minN) continue;
        const ma = mean(a); const mb = mean(b); const diff = ma - mb;
        if (Math.abs(diff) < 1e-9) continue;
        const va = a.reduce((s, x) => s + (x - ma) ** 2, 0); const vb = b.reduce((s, x) => s + (x - mb) ** 2, 0);
        const sd = Math.sqrt((va + vb) / Math.max(1, a.length + b.length - 2));
        const range = O.domain ? O.domain[1] - O.domain[0] : Math.max(...known) - Math.min(...known) || 1;
        const effect = sd > 0 ? Math.abs(diff) / sd : Math.abs(diff) / range * 4;
        if (effect < 0.8) continue;
        const key = isKey(F.metric, oid);
        const nMin = Math.min(a.length, b.length);
        if (!key && nMin < 6) continue; // off-list links need a decent sample
        const p = permP(a, b, a.length + b.length <= 10 ? 600 : 400, rand);
        if (p > (key ? maxP : maxP / 5)) continue;
        out.push({ outcome: oid, factor: F.id, factorMetric: F.metric, lag, nWith: a.length, nWithout: b.length,
          meanWith: ma, meanWithout: mb, diff, effect, p, key, factorLabel: F.label, factorShort: F.short });
      }
    }
  }
  // Keep the clearest, and keep the list varied: one per outcome+factor field, max two per outcome / per factor field
  // clearest first; bigger samples beat tiny ones at similar strength
  const rank = (r) => -Math.log10(r.p) + 0.15 * Math.min(r.nWith, r.nWithout) + (r.key ? 0.3 : 0);
  out.sort((x, y) => rank(y) - rank(x) || y.effect - x.effect);
  const seen = new Set(); const perO = {}; const perF = {}; const final = [];
  for (const r of out) {
    const k = `${r.outcome}|${r.factorMetric}`; const k2 = `${r.factorMetric}|${r.outcome}|${r.lag}`;
    if (seen.has(k) || (r.lag === 0 && seen.has(k2)) || (perO[r.outcome] || 0) >= 2 || (perF[r.factorMetric] || 0) >= 2) continue;
    seen.add(k); if (r.lag === 0) seen.add(`${r.outcome}|${r.factorMetric}|0`).add(`${r.factorMetric}|${r.outcome}|0`); perO[r.outcome] = (perO[r.outcome] || 0) + 1; perF[r.factorMetric] = (perF[r.factorMetric] || 0) + 1;
    final.push(describe(r));
    if (final.length >= (opts.limit ?? 12)) break;
  }
  return final;
}

function describe(r) {
  const O = METRIC[r.outcome];
  const nMin = Math.min(r.nWith, r.nWithout);
  const strength = strengthOf(nMin, r.p);
  const when = r.lag === 0 ? 'on days when' : O.night ? 'the morning after days when' : 'the day after days when';
  const fmt = O.kind === 'cat' ? (v) => severityWord(O, v) : O.fmt;
  const better = O.better === 0 ? null : (r.diff > 0) === (O.better > 0);
  const label = O.kind === 'cat' ? `${O.label} (severity)` : O.label;
  return {
    ...r, strength, better, outcomeLabel: label,
    text: `${O.label} averaged ${fmt(r.meanWith)} ${when} ${r.factorShort}, vs ${fmt(r.meanWithout)} otherwise.`,
    basis: `${r.nWith} v ${r.nWithout} ${O.night ? 'nights' : 'days'}`,
  };
}
function severityWord(O, v) {
  const lv = [...O.levels].sort((a, b) => a.rank - b.rank);
  const i = Math.max(0, Math.min(lv.length - 1, Math.round(v)));
  return `${(Math.round(v * 10) / 10).toLocaleString('en-GB')} (≈${lv[i].label.toLowerCase()})`;
}

// Spearman correlation for two numeric metrics, same day or next day
export function correlate(aId, bId, days, entries, settings, lag = 0, ctx = makeCtx(settings)) {
  const A = METRIC[aId]; const B = METRIC[bId]; const xs = []; const ys = [];
  for (const d of days) {
    const x = numOf(A, entries, lag ? addDays(d, -1) : d, ctx); const y = numOf(B, entries, d, ctx);
    if (x != null && y != null) { xs.push(x); ys.push(y); }
  }
  if (xs.length < 4) return { n: xs.length, r: null };
  const rank = (v) => { const s = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = Array(v.length);
    for (let i = 0; i < s.length;) { let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j++; for (let k = i; k <= j; k++) r[s[k][1]] = (i + j) / 2; i = j + 1; } return r; };
  const rx = rank(xs); const ry = rank(ys); const mx = mean(rx); const my = mean(ry);
  let num = 0; let dx = 0; let dy = 0;
  for (let i = 0; i < rx.length; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  const r = dx && dy ? num / Math.sqrt(dx * dy) : null;
  return { n: xs.length, r, xs, ys };
}
export function corrWord(r, n) {
  if (r == null) return 'Not enough overlapping days yet';
  const a = Math.abs(r);
  const s = a >= 0.7 ? 'strongly' : a >= 0.4 ? 'moderately' : a >= 0.2 ? 'loosely' : null;
  if (!s) return `No clear link so far (${n} days)`;
  return `${s[0].toUpperCase() + s.slice(1)} ${r > 0 ? 'move together' : 'move in opposite directions'} (${n} days${n < 14 ? ', early days' : ''})`;
}

// ---------- weekly summary (feeds the Sunday AI review) ----------
export function nextDrinkStep(day, settings) {
  const plan = [...((settings && settings.drinkPlan) || DEFAULT_SETTINGS.drinkPlan)].sort((a, b) => a.from.localeCompare(b.from));
  const next = plan.find((s) => s.from > day);
  return next ? { from: next.from, target: next.target, daysAway: dayDiff(day, next.from) } : null;
}

const KEEP_RAW = FIELDS.map((f) => f.id).concat(['workOff', 'workoutScore', 'readSecs', 'basilReadSecs', 'done', 'workout']);
export function weeklySummary(entries, settings, wkStart, extra = {}) {
  const ctx = makeCtx(settings);
  const days = daysBetween(wkStart, addDays(wkStart, 6));
  const prev = daysBetween(addDays(wkStart, -7), addDays(wkStart, -1));
  const cur = periodStats(days, entries, settings, ctx, extra.today || null);
  const before = periodStats(prev, entries, settings, ctx);
  const habits = habitGrid(days, entries, settings, ctx).map((h) => ({ habit: h.label, done: h.hits, of: h.of }));
  const highlights = [];
  for (const d of days) {
    const e = entries[d]; if (!e) continue;
    if (Array.isArray(e.otherActivity) && e.otherActivity.includes('swim')) highlights.push(`${d}: went swimming (a fear being faced)`);
    if (e.driving === 'yes') highlights.push(`${d}: drove`);
    if (e.drinkCount === 0) highlights.push(`${d}: dry day`);
    if (Array.isArray(e.basil) && e.basil.some((x) => x !== 'none')) highlights.push(`${d}: Basil work (${e.basil.join(', ')})`);
    if (e.fcProject && e.fcProject !== 'none') highlights.push(`${d}: FC project (${e.fcProject})`);
    if (e.goals === 'achievement') highlights.push(`${d}: logged a goal achievement`);
    if ((e.workoutScore || 0) >= ctx(d).workoutTarget) highlights.push(`${d}: workout target hit (${e.workoutScore}/${ctx(d).workoutTarget})`);
  }
  const daily = days.map((d) => {
    const e = entries[d];
    if (!isLogged(e)) return { day: d, weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday(d)], logged: false };
    const sc = scoreDay(e, ctx(d));
    const partial = d === extra.today && !e.done;
    const raw = Object.fromEntries(KEEP_RAW.filter((k) => answered(e[k])).map((k) => [k, e[k]]));
    return { day: d, weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday(d)], logged: true, inProgress: partial || undefined, score: partial ? null : sc.overall, areas: partial ? null : sc.areas,
      drinksTarget: ctx(d).target, workoutTarget: ctx(d).workoutTarget, wellbeing: wellbeingReading(e), data: raw };
  });
  const end = addDays(wkStart, 6);
  const upTo = Object.fromEntries(Object.entries(entries).filter(([k]) => k <= end));
  return {
    weekStart: wkStart, weekEnd: end,
    stats: cur, previousWeek: before.logged ? before : null,
    habits, highlights, daily,
    notes: days.filter((d) => entries[d]?.notes).map((d) => ({ day: d, text: String(entries[d].notes).trim() })),
    currentDrinksTarget: ctx(end).target,
    nextDrinkStep: nextDrinkStep(end, settings),
    workoutTargetNextWeek: workoutTarget(addDays(end, 1), settings?.workoutPlan),
    patterns: findPatterns(upTo, settings, { limit: 10, ctx }).map((p) => ({ text: p.text, strength: p.strength.label, basis: p.basis, direction: p.better == null ? 'neutral' : p.better ? 'better' : 'worse' })),
    totalDaysTracked: loggedDays(upTo).length,
    streak: streak(upTo, end),
    scoring: 'Day score 0-100 is the average of six area scores (Sleep, Nutrition, Movement, Drinks, Relationship, Mind & growth). Not doing something scores 0, never negative; only actively-avoided choices lose points. "How I felt" fields (stress, anxiety, self-esteem, motivation, PTSD triggers, palpitations), night terrors, eczema and cage are recorded for insight only and never scored.',
    ...extra,
  };
}
