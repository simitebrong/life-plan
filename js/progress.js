// Life Plan — Progress: overview charts, explore any data point, patterns, weekly reviews.
import { AREAS, AREA_ORDER, scoreDay, timeToMins } from './fields.js';
import {
  METRICS, METRIC, METRIC_GROUPS, RANGES, makeCtx, rangeDays, previousRange, periodStats, series, byWeek,
  habitGrid, findPatterns, correlate, corrWord, numOf, valueOf, isLogged, loggedDays, streak, weekStart, addDays,
  fmtTime, fmtHours, fmtMoney, nextDrinkStep, round,
} from './analysis.js';
import {
  resetCharts, lineChart, barChart, miniLine, stripChart, distBars, scatter, dumbbell, calendar, habitRows,
  initCharts, closeTip, longDate, shortDate,
} from './charts.js';

export function createProgress(api) {
  const { S, sb, store, esc, todayIso, render, openDay } = api;
  const P = Object.assign({ tab: 'overview', range: 'week', a: 'score', b: '', lag: 0 }, store.get('lp-prog', {}));
  P.reports = null; P.reportOpen = null; P.busy = false; P.msg = '';
  const save = () => store.set('lp-prog', { tab: P.tab, range: P.range, a: P.a, b: P.b, lag: P.lag });

  let patCache = { key: '', list: [] };
  const patterns = () => {
    const key = JSON.stringify([Object.keys(S.entries).length, S.entries[todayIso()] && Object.keys(S.entries[todayIso()]).length, JSON.stringify(S.settings.drinkPlan), Object.values(S.entries).reduce((s, e) => s + JSON.stringify(e).length, 0)]);
    if (patCache.key !== key) patCache = { key, list: findPatterns(S.entries, S.settings, { limit: loggedDays(S.entries).length < 14 ? 6 : 12 }) };
    return patCache.list;
  };

  // ---------- sizes ----------
  const inner = () => Math.min(560, document.getElementById('app')?.clientWidth || 380) - 28;
  const W = () => inner() - 32;          // inside a .panel
  const halfW = () => Math.floor((inner() - 10) / 2) - 24; // inside a .mini tile

  // ---------- helpers ----------
  const fmtV = (m, v) => (v == null ? '–' : m.fmt ? m.fmt(v) : String(v));
  const better = (m, d) => (m.better === 0 || d === 0 ? 'same' : (d > 0) === (m.better > 0) ? 'up' : 'down');
  function delta(cur, prev, m, unit = '') {
    if (cur == null || prev == null) return '';
    const d = round(cur - prev, 1);
    if (Math.abs(d) < (m.unit === 'time' ? 1 : 0.05)) return `<span class="dl same">Same as before</span>`;
    const abs = m.unit === 'time' ? `${Math.round(Math.abs(d))} min` : m.unit === '£' ? fmtMoney(Math.abs(d)) : `${round(Math.abs(d), 1)}${unit}`;
    const word = m.unit === 'time' ? (d > 0 ? 'later' : 'earlier') : d > 0 ? 'up' : 'down';
    return `<span class="dl ${better(m, d)}">${d > 0 ? '▲' : '▼'} ${abs} ${word}</span>`;
  }
  const ctx = () => makeCtx(S.settings);
  const days = () => rangeDays(P.range, todayIso(), S.entries);
  const long = (ds) => ds.length > 60;
  const prevLabel = (n) => `vs the ${n} days before`;

  // series for a metric, weekly-averaged on long ranges for bars
  const inProgress = (m, day) => (m.id === 'score' || m.id.startsWith('area.')) && day === todayIso() && !S.entries[day]?.done;
  function pointsFor(m, ds, c, forBars) {
    const pts = series(m.id, ds, S.entries, S.settings, c).map((p) => ({ ...p, v: inProgress(m, p.day) ? null : m.kind === 'cat' ? numOf(m, S.entries, p.day, c) : p.v }));
    return forBars && long(ds) ? byWeek(pts, 'mean') : pts;
  }
  const weekTitle = (p) => (p.week ? `Week of ${shortDate(p.day)}` : longDate(p.day));

  function metricChart(m, ds, c, opts = {}) {
    const w = opts.W || W();
    if (m.kind === 'cat' && !m.num) return catBlock(m, ds, c, w);
    const asBars = m.chart === 'bar' || opts.bars;
    const pts = pointsFor(m, ds, c, asBars);
    const tip = (p, i, avg) => ({
      title: weekTitle(p) + (p.week ? ' (average)' : ''),
      rows: [[m.label, p.v == null ? 'not logged' : fmtV(m, p.v)], ...(p.t != null ? [['Target', fmtV(m, p.t)]] : []), ...(avg != null ? [['7-day average', fmtV(m, avg)]] : [])],
      day: p.week ? null : p.day,
    });
    if (m.kind === 'cat') {
      return lineChart({ pts, W: w, H: opts.H || 170, domain: [0, Math.max(...m.levels.map((l) => l.rank))], fmt: (v) => sevLabel(m, v), tickFmt: (v) => sevLabel(m, v), color: opts.color, tip, open: true, label: m.label });
    }
    if (asBars) {
      return barChart({ pts, W: w, H: opts.H || 180, fmt: (v) => fmtV(m, v), tickFmt: m.unit === 'time' ? fmtTime : (v) => (m.unit === '£' ? `£${v}` : String(v)),
        color: opts.color || 'var(--primary)', target: !!m.target, muted: m.target && m.better < 0 ? (p) => p.t != null && p.v > p.t : null, tip, open: true, label: m.label });
    }
    return lineChart({ pts, W: w, H: opts.H || 180, domain: m.domain, time: m.unit === 'time', fmt: (v) => fmtV(m, v),
      tickFmt: m.unit === 'time' ? fmtTime : m.unit === 'h' ? (v) => `${v}h` : String, color: opts.color || 'var(--primary)', avg: true, target: !!m.target, tip, open: true, label: m.label });
  }
  const sevLabel = (m, v) => { const lv = [...m.levels].sort((a, b) => a.rank - b.rank); return lv.find((l) => l.rank === Math.round(v))?.label ?? ''; };

  function catBlock(m, ds, c, w) {
    const pts = ds.map((day) => ({ day, v: valueOf(m, S.entries, day, c) }));
    const counts = m.levels.map((l) => ({ label: l.label, n: pts.filter((p) => p.v === l.v).length }));
    const strip = stripChart({ pts, W: w, levels: m.levels, tip: (p) => ({ title: longDate(p.day), rows: [[m.label, p.v == null ? 'not logged' : m.levels.find((l) => l.v === p.v)?.label ?? p.v]], day: p.day }), open: true });
    return `${strip}<div class="dist-wrap">${distBars(counts)}</div>`;
  }

  // ---------- header ----------
  const TABS = [['overview', 'Overview'], ['explore', 'Explore'], ['patterns', 'Patterns'], ['reviews', 'Reviews']];
  function header() {
    const showRange = P.tab === 'overview' || P.tab === 'explore';
    return `<h1>Progress</h1>
      <div class="seg seg4 ptabs" role="tablist">${TABS.map(([id, l]) => `<button type="button" role="tab" class="${P.tab === id ? 'on' : ''}" aria-selected="${P.tab === id}" data-act="p-tab" data-v="${id}">${l}</button>`).join('')}</div>
      ${showRange ? `<div class="ranges" role="group" aria-label="Time range">${RANGES.map((r) => `<button type="button" class="rchip${P.range === r.id ? ' on' : ''}" data-act="p-range" data-v="${r.id}" aria-pressed="${P.range === r.id}">${r.label}</button>`).join('')}</div>` : ''}`;
  }

  // ---------- overview ----------
  function tile(n, label, d = '', small = '') {
    return `<div class="stat"><span class="stat-n">${n}${small ? `<small>${small}</small>` : ''}</span><span class="stat-l">${label}</span>${d}</div>`;
  }

  function overview() {
    const c = ctx(); const ds = days(); const prev = previousRange(ds);
    const live = todayIso(); const st = periodStats(ds, S.entries, S.settings, c, live); const pv = periodStats(prev, S.entries, S.settings, c);
    if (!st.logged) return `<p class="lead">Nothing logged in this range yet. Pick a longer range, or log today and come back.</p>`;
    const has = pv.logged >= Math.max(2, Math.ceil(st.logged / 2)); const n = ds.length; // only compare like with like
    const strk = streak(S.entries, todayIso());
    const M = METRIC;
    const tiles = [
      tile(st.avgScore ?? '–', 'average day score', has ? delta(st.avgScore, pv.avgScore, M.score) : ''),
      tile(st.logged, `days logged${strk > 1 ? ` · ${strk}-day streak` : ''}`, '', `/${n}`),
      tile(st.drinks.avg ?? '–', `drinks a day${st.drinks.avgTarget != null ? ` (target ${st.drinks.avgTarget})` : ''}`, has ? delta(st.drinks.avg, pv.drinks.avg, M.drinkCount) : ''),
      tile(st.drinks.days ? `${st.drinks.atOrUnder}` : '–', `days at or under target${st.drinks.dry ? ` · ${st.drinks.dry} dry` : ''}`, '', st.drinks.days ? `/${st.drinks.days}` : ''),
      tile(fmtMoney(Math.max(0, st.spend.saved)), 'kept vs usual drinks spend', has && pv.spend.days ? delta(st.spend.saved, pv.spend.saved, M.saved) : ''),
      tile(st.workout.total.toLocaleString('en-GB'), `workout points${st.workout.hitTarget ? ` · target hit ${st.workout.hitTarget}×` : ''}`, has ? delta(st.workout.total, pv.workout.total, M.workoutScore) : ''),
    ].join('');

    // Day score
    const scorePts = pointsFor(M.score, ds, c, false);
    const scoreTip = (p, i, avg) => {
      const e = S.entries[p.day];
      const rows = [['Score', p.v ?? (p.day === todayIso() && isLogged(e) ? 'in progress' : 'not logged')]];
      if (avg != null) rows.push(['7-day average', Math.round(avg)]);
      if (e && typeof e.drinkCount === 'number') rows.push(['Drinks', e.drinkCount]);
      if (e && e.workoutScore) rows.push(['Workout', e.workoutScore]);
      return { title: longDate(p.day), rows, day: p.day, note: e?.notes ? String(e.notes).split('\n')[0].slice(0, 60) : '' };
    };
    const scoreChart = lineChart({ pts: scorePts, W: W(), H: 190, domain: [0, 100], fmt: String, avg: true, tip: scoreTip, open: true, label: 'Day score' });
    const cal = n >= 28 ? calendar({ days: ds, W: W(), value: (d) => (isLogged(S.entries[d]) && !inProgress(M.score, d) ? scoreDay(S.entries[d], c(d)).overall : null) }) : '';

    // Areas
    const areas = AREA_ORDER.map((a) => {
      const m = M[`area.${a}`];
      const pts = pointsFor(m, ds, c, false);
      const avg = st.areaAvg[a];
      return `<div class="mini"><div class="mini-h"><span>${AREAS[a].label}</span><b>${avg ?? '–'}</b></div>
        ${miniLine({ pts, W: halfW(), domain: [0, 100], mid: 50, color: AREAS[a].color, fmt: String, open: true, tip: (p) => ({ title: longDate(p.day), rows: [[AREAS[a].label, p.v ?? '–']], day: p.day }) })}
        ${has ? delta(avg, pv.areaAvg[a], m) : ''}</div>`;
    }).join('');

    // Drinks
    const drinkBars = metricChart(M.drinkCount, ds, c, { color: 'var(--a-drinks)', H: 190 });
    const step = nextDrinkStep(todayIso(), S.settings);
    const savedPts = (() => { let run = 0; return ds.map((day) => { const v = valueOf(M.saved, S.entries, day, c); if (v != null) run += v; return { day, v: v == null && !isLogged(S.entries[day]) ? null : run }; }); })();
    const anySaved = savedPts.some((p) => p.v != null);
    const savedChart = anySaved ? lineChart({ pts: savedPts, W: W(), H: 140, zero: true, fmt: fmtMoney, tickFmt: (v) => `£${v}`, color: 'var(--a-drinks)', open: true,
      tip: (p) => ({ title: longDate(p.day), rows: [['Kept so far', fmtMoney(p.v)], ['Spent that day', S.entries[p.day]?.spend != null ? fmtMoney(S.entries[p.day].spend) : '–']], day: p.day }) }) : '';

    // Workout
    const wChart = metricChart(M.workoutScore, ds, c, { color: 'var(--a-move)', H: 180 });

    // Sleep + felt multiples
    const multi = (ids, color) => ids.map((id) => {
      const m = M[id]; const pts = pointsFor(m, ds, c, false);
      const v = id === 'hoursInBed' ? st.sleep.hoursInBed : id === 'outOfBed' ? st.sleep.outOfBed : id === 'bedTime' ? st.sleep.bedTime : id === 'sleepQuality' ? st.sleep.quality : st.felt[id];
      const pvv = id === 'hoursInBed' ? pv.sleep.hoursInBed : id === 'outOfBed' ? pv.sleep.outOfBed : id === 'bedTime' ? pv.sleep.bedTime : id === 'sleepQuality' ? pv.sleep.quality : pv.felt[id];
      const label = { sleepQuality: 'Sleep quality', hoursInBed: 'Time in bed', outOfBed: 'Out of bed', bedTime: 'Bed time' }[id] || m.label.replace(' level', '');
      return `<div class="mini"><div class="mini-h"><span>${label}</span><b>${fmtV(m, v)}</b></div>
        ${miniLine({ pts, W: halfW(), domain: m.domain, time: m.unit === 'time', color, fmt: (x) => fmtV(m, x), open: true, tip: (p) => ({ title: longDate(p.day), rows: [[label, fmtV(m, p.v)]], day: p.day }) })}
        ${has ? delta(v, pvv, m) : ''}</div>`;
    }).join('');
    const strip = (id, color) => {
      const m = M[id]; const pts = ds.map((day) => ({ day, v: valueOf(m, S.entries, day, c) }));
      if (!pts.some((p) => p.v != null)) return '';
      const levels = m.levels || m.field.options.map((o) => ({ v: o.v, label: o.label }));
      return `<div class="strip-block"><div class="mini-h"><span>${m.label}${m.field?.low ? ` <small>(${m.field.options[0].label} = ${esc(m.field.low)})</small>` : ''}</span></div>${stripChart({ pts, W: W(), levels, color, open: true,
        tip: (p) => ({ title: longDate(p.day), rows: [[m.label, p.v == null ? 'not logged' : levels.find((l) => l.v === p.v)?.label]], day: p.day }) })}</div>`;
    };

    // Work (unscored): only shown once there's something in range
    const workBlock = () => {
      const wd = ds.map((d) => valueOf(M.workDay, S.entries, d, c));
      if (!wd.some((v) => v != null)) return '';
      const on = wd.filter((v) => v === 'yes').length; const off = wd.filter((v) => v === 'no').length;
      const avg = (id) => { const v = ds.map((d) => numOf(M[id], S.entries, d, c)).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      const tileFor = (id, label, val, dom) => `<div class="mini"><div class="mini-h"><span>${label}</span><b>${val}</b></div>
        ${miniLine({ pts: pointsFor(M[id], ds, c, false), W: halfW(), domain: dom, time: M[id].unit === 'time', color: 'var(--a-work)', fmt: (x) => fmtV(M[id], x), open: true,
          tip: (p) => ({ title: longDate(p.day), rows: [[label, fmtV(M[id], p.v)]], day: p.day }) })}</div>`;
      return `<h2 class="sub">Work</h2>
        <div class="mini-grid">
          ${tileFor('workHours', 'Hours', fmtHours(avg('workHours')))}
          ${tileFor('workIntensity', 'Intensity', avg('workIntensity') == null ? '–' : round(avg('workIntensity'), 1), [1, 5])}
          ${tileFor('workStart', 'Logged on', fmtTime(avg('workStart')))}
          ${tileFor('workEnd', 'Laptop shut', fmtTime(avg('workEnd')))}
        </div>
        <div class="panel slim">${strip('workFeeling', 'var(--a-work)')}${strip('splashDown', 'var(--a-work)')}${strip('workDay', 'var(--a-work)')}</div>
        <p class="fine">${on} working day${on === 1 ? '' : 's'}${off ? ` and ${off} day${off === 1 ? '' : 's'} off` : ''} in this range. Work is recorded for insight and never scored.</p>`;
    };

    // Habits
    const hab = habitGrid(ds, S.entries, S.settings, c).sort((a, b) => b.hits / b.of - a.hits / a.of);

    // Pattern teaser
    const pats = patterns().slice(0, 2);

    return `
      ${reviewTeaser()}
      <div class="stat-grid">${tiles}</div>
      <p class="fine">${has ? `Arrows compare with the ${n} days before.` : 'Arrows appear once there’s enough of an earlier period to compare with.'}${S.entries[todayIso()] && !S.entries[todayIso()].done ? ' Today’s score joins in once you finish the day.' : ''}</p>

      <section class="panel"><div class="panel-h"><h2>Day score</h2><span class="hint">Tap or drag for detail</span></div>${scoreChart}${cal}</section>

      <h2 class="sub">By area</h2>
      <div class="mini-grid">${areas}</div>

      <section class="panel"><div class="panel-h"><h2>Drinks</h2>${step && step.daysAway <= 14 ? `<span class="pill">${step.target} a day from ${shortDate(step.from)}</span>` : ''}</div>
        ${drinkBars}
        <p class="clegend-note">Dashed line is your target. Any day over it shows lighter.</p>
        <div class="kv">
          <span>First drink, average <b>${fmtTime(st.drinks.firstDrink)}</b></span>
          <span>Last drink, average <b>${fmtTime(st.drinks.lastDrink)}</b></span>
        </div>
        ${savedChart ? `<h3 class="h3">Money kept vs £${Number(S.settings.baselineSpend) || 12} a day</h3>${savedChart}` : ''}
      </section>

      <section class="panel"><div class="panel-h"><h2>Home workout</h2><span class="hint">${st.workout.days} active day${st.workout.days === 1 ? '' : 's'}</span></div>${wChart}
        <p class="clegend-note">Dashed line shows each day's target, which climbs as you get stronger.</p></section>

      ${workBlock()}

      <h2 class="sub">Sleep</h2>
      <div class="mini-grid">${multi(['sleepQuality', 'hoursInBed', 'outOfBed', 'bedTime'], 'var(--a-sleep)')}</div>
      <div class="panel slim">${strip('nightTerrors', 'var(--a-sleep)')}${strip('morningWood', 'var(--a-sleep)')}</div>

      <h2 class="sub">How I felt</h2>
      <div class="mini-grid">${multi(['stress', 'anxiety', 'motivation', 'selfEsteem'], 'var(--a-mind)')}</div>
      <div class="panel slim">${strip('ptsd', 'var(--a-rel)')}${strip('palpitations', 'var(--a-rel)')}${strip('eczema', 'var(--a-food)')}</div>

      <section class="panel"><div class="panel-h"><h2>Habits</h2><span class="hint">${long(ds) ? 'share of logged days' : 'filled = done'}</span></div>${habitRows(hab, ds, W())}</section>

      ${pats.length ? `<section class="panel"><div class="panel-h"><h2>Possible links</h2><button type="button" class="link" data-act="p-tab" data-v="patterns">See all ›</button></div>
        ${pats.map((p) => `<p class="pat-mini"><span class="badge ${p.strength.id}">${p.strength.label}</span> ${esc(p.text)}</p>`).join('')}</section>` : ''}
    `;
  }

  // ---------- explore ----------
  function metricSelect(name, val, allowNone) {
    const groups = METRIC_GROUPS.map((g) => {
      const ms = METRICS.filter((m) => m.group === g && m.id !== 'notes');
      return ms.length ? `<optgroup label="${esc(g)}">${ms.map((m) => `<option value="${m.id}"${m.id === val ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}</optgroup>` : '';
    }).join('');
    return `<select data-p="${name}" aria-label="${name === 'a' ? 'Data to show' : 'Compare with'}">${allowNone ? `<option value="">Nothing</option>` : ''}${groups}</select>`;
  }
  const QUICK = ['score', 'drinkCount', 'sleepQuality', 'stress', 'workoutScore', 'bedTime', 'motivation', 'hoursInBed'];

  function summary(m, ds, c) {
    if (m.kind === 'cat' && !m.num) {
      const vals = ds.map((d) => valueOf(m, S.entries, d, c)).filter((v) => v != null);
      if (!vals.length) return '';
      const top = m.levels.map((l) => [l, vals.filter((v) => v === l.v).length]).sort((a, b) => b[1] - a[1])[0];
      return `<div class="kv"><span>Most often <b>${esc(top[0].label)}</b> (${top[1]} of ${vals.length})</span><span>Latest <b>${esc(m.levels.find((l) => l.v === vals[vals.length - 1])?.label)}</b></span></div>`;
    }
    const vals = ds.filter((d) => !inProgress(m, d)).map((d) => numOf(m, S.entries, d, c)).filter((v) => v != null);
    if (!vals.length) return '';
    const prev = previousRange(ds).map((d) => numOf(m, S.entries, d, c)).filter((v) => v != null);
    const avg = vals.reduce((s, x) => s + x, 0) / vals.length;
    const pavg = prev.length ? prev.reduce((s, x) => s + x, 0) / prev.length : null;
    const f = m.kind === 'cat' ? (v) => sevLabel(m, v) : (v) => fmtV(m, v);
    return `<div class="kv"><span>Average <b>${m.kind === 'cat' ? round(avg, 1) : f(avg)}</b></span><span>Range <b>${f(Math.min(...vals))} – ${f(Math.max(...vals))}</b></span>
      <span>Days <b>${vals.length}</b></span>${pavg != null ? `<span>${delta(avg, pavg, m)}</span>` : ''}</div>`;
  }

  function explore() {
    const c = ctx(); const ds = days();
    const A = METRIC[P.a] || METRIC.score; const B = P.b ? METRIC[P.b] : null;
    const numA = A.kind === 'num' || A.num; const numB = B && (B.kind === 'num' || B.num);
    let rel = '';
    if (B && numA && numB) {
      const cr = correlate(B.id, A.id, ds, S.entries, S.settings, P.lag, c);
      const fx = (m) => (m.kind === 'cat' ? (v) => sevLabel(m, v) : (v) => fmtV(m, v));
      const crDays = ds.filter((d) => numOf(A, S.entries, d, c) != null && numOf(B, S.entries, P.lag ? addDays(d, -1) : d, c) != null);
      rel = `<section class="panel"><div class="panel-h"><h2>How they relate</h2></div>
        <div class="seg seg2 small">${[[0, 'Same day'], [1, `${esc(B.label)} the day before`]].map(([v, l]) => `<button type="button" class="${P.lag === v ? 'on' : ''}" data-act="p-lag" data-v="${v}">${l}</button>`).join('')}</div>
        <p class="rel-line">${esc(corrWord(cr.r, cr.n))}</p>
        ${cr.n ? scatter({ xs: cr.xs, ys: cr.ys, days: crDays, W: W(), xfmt: fx(B), yfmt: fx(A), xLabel: B.label + (P.lag ? ' (day before)' : ''), yLabel: A.label,
          xtime: B.unit === 'time', ytime: A.unit === 'time', xdomain: B.domain, ydomain: A.domain, open: true }) : ''}
        <p class="clegend-note">Each dot is one day. Patterns over a couple of weeks say more than any single day.</p></section>`;
    }
    return `
      <div class="explore-pick">
        <label>Show ${metricSelect('a', A.id, false)}</label>
        <label>Compare with ${metricSelect('b', P.b, true)}</label>
      </div>
      <div class="quick">${QUICK.map((id) => `<button type="button" class="rchip${P.a === id ? ' on' : ''}" data-act="p-quick" data-v="${id}">${esc(METRIC[id].label)}</button>`).join('')}</div>
      <section class="panel"><div class="panel-h"><h2>${esc(A.label)}</h2><span class="hint">${esc(A.group || '')}</span></div>
        ${metricChart(A, ds, c, { H: 200 })}${summary(A, ds, c)}</section>
      ${B ? `<section class="panel"><div class="panel-h"><h2>${esc(B.label)}</h2><span class="hint">${esc(B.group || '')}</span></div>
        ${metricChart(B, ds, c, { H: 170, color: 'var(--a-sleep)' })}${summary(B, ds, c)}</section>` : ''}
      ${rel}`;
  }

  // ---------- patterns ----------
  function patternsView() {
    const n = loggedDays(S.entries).length;
    if (n < 5) return `<p class="lead">Patterns need at least 5 logged days. You have ${n}. Keep going, they'll appear here on their own.</p>`;
    const list = patterns();
    const head = `<p class="lead">Possible links in your own data, from all ${n} days logged. Treat them as hunches to test, not proof: they firm up or fade as the days add up.</p>
      <div class="clegend"><span><i class="dot-on"></i>When it happened</span><span><i class="dot-off"></i>Otherwise</span></div>`;
    if (!list.length) return head + `<p class="note">Nothing stands out yet. That's normal early on; check back after another week.</p>`;
    return head + list.map((p, i) => {
      const O = METRIC[p.outcome];
      const fmt = O.kind === 'cat' ? (v) => sevLabel(O, v) || round(v, 1) : (v) => fmtV(O, v);
      const dom = O.domain && O.kind !== 'cat' ? O.domain : O.kind === 'cat' ? [0, Math.max(...O.levels.map((l) => l.rank))] : null;
      return `<article class="pat">
        <div class="pat-top"><span class="badge ${p.strength.id}">${p.strength.label}</span><span class="pat-basis">${esc(p.basis)}</span></div>
        <p>${esc(p.text)}</p>
        ${dumbbell({ a: p.meanWith, b: p.meanWithout, W: W(), fmt, domain: dom, better: p.better })}
        <button type="button" class="link" data-act="p-explore" data-i="${i}">Explore this ›</button>
      </article>`;
    }).join('') + `<p class="note">Each finding compares days with and without something, on the same day or the day after. Several of them will be coincidence at this stage; the Sunday review keeps an eye on which ones hold up.</p>`;
  }

  // ---------- weekly reviews ----------
  async function loadReports() {
    const { data, error } = await sb.from('weekly_reports').select('week_start,report,stats,created_at,model').order('week_start', { ascending: false }).limit(52);
    P.reports = error ? [] : data || [];
    if (error) console.error(error);
  }
  function reviewTeaser() {
    const r = P.reports?.[0];
    if (!r || !r.report?.headline) return '';
    const age = Math.round((Date.now() - Date.parse(r.created_at)) / 86400000);
    if (age > 8) return '';
    return `<button type="button" class="teaser" data-act="p-review" data-v="${r.week_start}"><span class="teaser-k">Weekly review · week of ${shortDate(r.week_start)}</span><strong>${esc(r.report.headline)}</strong><span class="teaser-go">Read ›</span></button>`;
  }
  const thisWeek = () => weekStart(todayIso());
  function nextSunday() {
    const wr = { weekday: 0, at: '20:45', ...(S.settings.reminders?.weeklyReview || {}) };
    let d = todayIso(); const now = new Date(); const mins = now.getHours() * 60 + now.getMinutes();
    const target = timeToMins(wr.at);
    for (let i = 0; i < 8; i++) { const day = addDays(todayIso(), i); if (new Date(day + 'T12:00:00').getDay() === wr.weekday && (i > 0 || mins < target)) { d = day; break; } }
    return `${longDate(d)} at ${wr.at}`;
  }
  function reportHTML(r, open) {
    const rep = r.report || {}; const st = r.stats || {};
    const daily = st.daily || [];
    const bars = daily.length ? barChart({ pts: daily.map((d) => ({ day: d.day, v: d.logged ? d.score : null })), W: W(), H: 130, domain: [0, 100], fmt: String, color: 'var(--primary)', open: true,
      tip: (p) => ({ title: longDate(p.day), rows: [['Score', p.v ?? 'not logged']], day: p.day }) }) : '';
    const s = st.stats || {};
    const head = `<button type="button" class="rep-head" data-act="p-review" data-v="${r.week_start}" aria-expanded="${open}">
      <span class="teaser-k">Week of ${shortDate(r.week_start)}</span><strong>${esc(rep.headline || 'Weekly review')}</strong></button>`;
    if (!open) return `<article class="rep closed">${head}</article>`;
    const list = (arr) => (arr || []).map((x) => `<li>${esc(typeof x === 'string' ? x : x.text || '')}${x && x.confidence ? ` <span class="badge early">${esc(x.confidence)}</span>` : ''}</li>`).join('');
    return `<article class="rep">${head}
      ${s.logged != null ? `<div class="rep-stats"><span><b>${s.avgScore ?? '–'}</b> avg score</span><span><b>${s.drinks?.avg ?? '–'}</b> drinks/day</span><span><b>${(s.workout?.total ?? 0).toLocaleString('en-GB')}</b> workout pts</span><span><b>${s.logged}/7</b> days</span></div>` : ''}
      ${bars}
      ${rep.summary ? `<p class="rep-sum">${esc(rep.summary)}</p>` : ''}
      ${rep.wins?.length ? `<h3 class="h3">Wins</h3><ul class="rep-list wins">${list(rep.wins)}</ul>` : ''}
      ${rep.patterns?.length ? `<h3 class="h3">Patterns worth watching</h3><ul class="rep-list">${list(rep.patterns)}</ul>` : ''}
      ${rep.focus ? `<div class="focus"><span class="teaser-k">One focus for this week</span><p>${esc(rep.focus)}</p></div>` : ''}
      ${rep.look_ahead ? `<h3 class="h3">Looking ahead</h3><p>${esc(rep.look_ahead)}</p>` : ''}
      <p class="fine">Written ${new Date(r.created_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${r.week_start === thisWeek() ? ` · <button type="button" class="link inline" data-act="p-gen" data-v="${r.week_start}">Refresh with latest data</button>` : ''}</p>
    </article>`;
  }
  function reviewsView() {
    if (P.reports === null) return `<p class="lead">Loading your reviews…</p>`;
    const wk = thisWeek(); const haveThis = P.reports.some((r) => r.week_start === wk);
    const open = P.reportOpen || P.reports[0]?.week_start;
    return `<p class="lead">Every Sunday at ${S.settings.reminders?.weeklyReview?.at || '20:45'} your week is read in full, every field and note, and turned into a short review: what went well, links worth watching and one thing to focus on.</p>
      <div class="gen">
        ${P.busy ? `<p class="gen-busy"><span class="spinner"></span>Reading your week… this takes about half a minute.</p>`
          : `<button type="button" class="primary" data-act="p-gen" data-v="${wk}">${haveThis ? "Refresh this week's review" : "Create this week's review now"}</button>`}
        ${P.msg ? `<p class="gen-msg">${esc(P.msg)}</p>` : ''}
        <p class="fine">Next automatic review: ${nextSunday()}.</p>
      </div>
      ${P.reports.map((r) => reportHTML(r, r.week_start === open)).join('') || '<p class="note">No reviews yet. Your first arrives this Sunday, or create one now.</p>'}`;
  }
  async function generate(week) {
    if (P.busy) return;
    P.busy = true; P.msg = ''; render();
    try {
      const { data, error } = await sb.functions.invoke('weekly-review', { body: { weekStart: week } });
      if (error || !data?.ok) throw error || new Error(data?.error || 'failed');
      await loadReports(); P.reportOpen = week;
    } catch (e) {
      console.error(e); P.msg = 'Couldn’t create the review just now. Check your connection and try again.';
    }
    P.busy = false; render();
  }

  // ---------- public ----------
  function view() {
    resetCharts(); closeTip();
    if (P.reports === null && S.session && !P.loading) { P.loading = true; loadReports().finally(() => { P.loading = false; if (S.view === 'progress') render(); }); }
    const any = loggedDays(S.entries).length;
    const body = !any && P.tab !== 'reviews'
      ? `<p class="lead">Your charts start growing after your first check-in. Log today and come back tomorrow.</p>`
      : P.tab === 'explore' ? explore() : P.tab === 'patterns' ? patternsView() : P.tab === 'reviews' ? reviewsView() : overview();
    return `<section class="page progress">${header()}${body}</section>`;
  }

  async function onClick(act, el) {
    switch (act) {
      case 'p-tab': P.tab = el.dataset.v; save(); render(); window.scrollTo(0, 0); return true;
      case 'p-range': P.range = el.dataset.v; save(); render(); return true;
      case 'p-quick': P.a = el.dataset.v; if (P.b === P.a) P.b = ''; save(); render(); return true;
      case 'p-lag': P.lag = Number(el.dataset.v); save(); render(); return true;
      case 'p-explore': {
        const p = patterns()[Number(el.dataset.i)]; if (!p) return true;
        P.a = p.outcome; P.b = METRIC[p.factorMetric] ? p.factorMetric : ''; P.lag = p.lag; P.tab = 'explore';
        if (RANGES.find((r) => r.id === P.range).days === 7) P.range = 'all';
        save(); render(); window.scrollTo(0, 0); return true;
      }
      case 'p-review': {
        const v = el.dataset.v;
        if (P.tab !== 'reviews') { P.tab = 'reviews'; P.reportOpen = v; save(); render(); window.scrollTo(0, 0); return true; }
        P.reportOpen = P.reportOpen === v ? '__none' : v; render(); return true;
      }
      case 'p-gen': generate(el.dataset.v); return true;
      case 'open-day': closeTip(); openDay(el.dataset.day); return true;
      default: return false;
    }
  }
  function onChange(el) {
    if (!el.dataset.p) return false;
    P[el.dataset.p] = el.value;
    if (P.a === P.b) P.b = '';
    save(); render(); return true;
  }
  function openReview(week) { P.tab = 'reviews'; P.reportOpen = week; P.reports = null; save(); }

  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (S.view === 'progress') render(); }, 200); });
  return { view, onClick, onChange, init: initCharts, openReview };
}
