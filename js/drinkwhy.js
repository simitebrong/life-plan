// Life Plan — "Before you pour": a short, honest check-in when you pour in the gardens, and the
// insights it builds up over time. Stored on each day as drinkWhy: [{ t, n, fx, adds, why[], poured }].
//   t = time, n = which drink this would be, fx = how much you already feel it (0-3),
//   adds = will this one genuinely add anything ('yes' | 'no' | 'unsure'), why = what's behind it,
//   poured = true if you went ahead, false if you chose not to (always a win).

export const REASONS = [
  ['fun', 'Fun'], ['social', 'Social'], ['relaxation', 'Relaxation'], ['excitement', 'Excitement'],
  ['craving', 'Craving'], ['habit', 'Habit'], ['compulsion', 'Compulsion'], ['stress', 'Stress'],
  ['anger', 'Anger'], ['loneliness', 'Loneliness'], ['insecurity', 'Insecurity'], ['fear', 'Fear'], ['sleep', 'Sleep aid'],
];
const LABEL = Object.fromEntries(REASONS);
const FX = ['Not at all', 'A little', 'Noticeably', 'Plenty'];
const ADDS = [['yes', 'Yes, genuinely'], ['no', 'Not really'], ['unsure', 'Not sure']];
const AUTOPILOT = ['habit', 'compulsion', 'craving'];
const HARD = ['stress', 'anger', 'loneliness', 'insecurity', 'fear'];
const GOOD = ['fun', 'social', 'relaxation', 'excitement'];
const HELD = [
  'Held back. One for you, nil for the goblin.',
  'Not this one. That’s the whole skill, right there.',
  'Chosen, not poured. Logged as a win.',
  'Nicely done. The urge will pass whether you pour or not, and now it will pass without costing you anything.',
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hmOf = (t) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
const hourOf = (t) => Number(hmOf(t).slice(0, 2));

export function createDrinkWhy({ esc, redraw, getEntries, todayIso, drinksSoFar, logCheck, pour, onDone, openGoblin }) {
  const C = { fx: null, adds: null, why: new Set(), range: 30 };

  function begin() { C.fx = drinksSoFar() ? null : 0; C.adds = null; C.why = new Set(); }

  // a gentle, honest reflection based on the answers so far
  function reflection() {
    const w = C.why; const has = (list) => list.some((k) => w.has(k));
    if (C.fx != null && C.fx >= 2 && C.adds === 'no') return 'You’re already feeling it, and you don’t think this one will add much. That’s usually the habit asking, not you. Want to let the clock run instead?';
    if (has(AUTOPILOT)) return 'This sounds like autopilot more than appetite. Urges rise, peak and pass, usually within half an hour, whether you pour or not. You could let this one pass and see.';
    if (w.has('sleep')) return 'Worth knowing: a drink helps you drop off but breaks up the second half of the night. It’s a poor sleep aid.';
    if (has(HARD)) return 'That’s a real feeling, and it deserves something that actually helps: a walk, a message to someone, ten minutes in the gardens. A drink only postpones it.';
    if (has(GOOD) && (C.fx == null || C.fx <= 1) && C.adds !== 'no') return 'Sounds like a drink for good reasons. Enjoy it slowly, and let the clock hold the gap.';
    return '';
  }
  function checkView() {
    const n = drinksSoFar(); const ref = reflection();
    return `<p class="gd-kick">Before you pour</p><h2 class="gd-h">A moment of honesty</h2>
      <p class="gd-text">One slow breath first. Then answer the way a friend who’s on your side would ask: no right answers, just the true ones.</p>
      ${n ? `<section class="dw-q"><h3>How much do you feel the drink${n === 1 ? '' : 's'} you’ve had?</h3>
        <div class="dw-opts">${FX.map((l, i) => `<button type="button" class="${C.fx === i ? 'on' : ''}" data-act="dw-fx" data-v="${i}" aria-pressed="${C.fx === i}">${l}</button>`).join('')}</div></section>` : ''}
      <section class="dw-q"><h3>Will this one genuinely add something?</h3>
        <div class="dw-opts">${ADDS.map(([k, l]) => `<button type="button" class="${C.adds === k ? 'on' : ''}" data-act="dw-adds" data-v="${k}" aria-pressed="${C.adds === k}">${l}</button>`).join('')}</div></section>
      <section class="dw-q"><h3>What’s behind it? <small>Pick all that are true</small></h3>
        <div class="dw-chips">${REASONS.map(([k, l]) => `<button type="button" class="${C.why.has(k) ? 'on' : ''}" data-act="dw-why" data-v="${k}" aria-pressed="${C.why.has(k)}">${l}</button>`).join('')}</div></section>
      ${ref ? `<p class="dw-reflect" role="status">${esc(ref)}</p>` : ''}
      <div class="dw-go"><button type="button" class="gd-btn" data-act="dw-pour">Pour it and start the clock</button>
        <button type="button" class="gd-btn ghost" data-act="dw-hold">Not this one</button></div>
      ${['craving', 'compulsion'].some((k) => C.why.has(k)) ? `<div class="gd-row center"><button type="button" class="gd-link" data-act="dw-goblin">This is the goblin. Destroy him first</button></div>` : ''}
      <div class="gd-row center"><button type="button" class="gd-link" data-act="dw-cancel">Back to the gardens</button></div>`;
  }
  function record(poured) {
    return { t: Date.now(), n: drinksSoFar() + 1, fx: C.fx, adds: C.adds, why: [...C.why], poured };
  }

  // ---------- insights ----------
  function collect(days) {
    const E = getEntries(); const today = todayIso();
    const from = days ? new Date(Date.parse(today) - (days - 1) * 864e5).toISOString().slice(0, 10) : '0000';
    return Object.keys(E).filter((k) => k >= from && k <= today).sort()
      .flatMap((k) => (Array.isArray(E[k].drinkWhy) ? E[k].drinkWhy.map((r) => ({ ...r, day: k })) : []));
  }
  function insights(recs) {
    const pours = recs.filter((r) => r.poured); const held = recs.filter((r) => !r.poured);
    const out = [];
    if (held.length) out.push(`You paused, checked in and chose not to pour <b>${held.length}</b> time${held.length === 1 ? '' : 's'}. Every one of those is the habit losing.`);
    const count = (list) => { const c = {}; list.forEach((r) => (r.why || []).forEach((k) => { c[k] = (c[k] || 0) + 1; })); return Object.entries(c).sort((a, b) => b[1] - a[1]); };
    const top = count(pours);
    if (top.length) out.push(`The most common reason behind a pour is <b>${LABEL[top[0][0]].toLowerCase()}</b>${top[1] ? `, then <b>${LABEL[top[1][0]].toLowerCase()}</b>` : ''}.`);
    const share = (list, keys) => (list.length ? Math.round((100 * list.filter((r) => (r.why || []).some((k) => keys.includes(k))).length) / list.length) : 0);
    const early = pours.filter((r) => r.n <= 2); const late = pours.filter((r) => r.n >= 3);
    if (early.length >= 3 && late.length >= 3) {
      const a = share(early, AUTOPILOT); const b = share(late, AUTOPILOT);
      if (b - a >= 15) out.push(`Later drinks lean on autopilot: habit, craving or compulsion is behind <b>${b}%</b> of drink three onwards, against <b>${a}%</b> of the first two. That’s where the gap timer earns its keep.`);
      else if (a - b >= 15) out.push(`Interesting: autopilot shows up more in the first drinks (${a}%) than later ones (${b}%). The decision to start may matter more than the pace.`);
    }
    const felt = pours.filter((r) => r.fx != null && r.fx >= 2);
    if (pours.length >= 4 && felt.length) out.push(`<b>${Math.round((100 * felt.length) / pours.length)}%</b> of pours came when you already felt the drinks noticeably or more. ${felt.filter((r) => r.adds === 'no').length ? `In ${felt.filter((r) => r.adds === 'no').length} of those you honestly thought it wouldn’t add anything.` : ''}`);
    const hard = share(pours, HARD);
    if (pours.length >= 4 && hard >= 25) out.push(`About <b>${hard}%</b> of pours are linked to a hard feeling (stress, anger, loneliness, insecurity or fear). Those evenings might deserve something kinder than a drink.`);
    const good = share(pours, GOOD);
    if (pours.length >= 4 && good >= 50) out.push(`More than half your pours (${good}%) are for good reasons: fun, company, relaxing. That’s a healthy base to build on.`);
    const late9 = pours.filter((r) => hourOf(r.t) >= 21 || hourOf(r.t) < 4);
    if (pours.length >= 6 && late9.length / pours.length >= 0.4) out.push(`${Math.round((100 * late9.length) / pours.length)}% of pours are after 9pm. A cut-off time might be an easy win.`);
    return out;
  }
  function insightsView() {
    const recs = collect(C.range); const pours = recs.filter((r) => r.poured); const held = recs.length - pours.length;
    const counts = {}; recs.forEach((r) => (r.why || []).forEach((k) => { counts[k] ||= { p: 0, h: 0 }; counts[k][r.poured ? 'p' : 'h']++; }));
    const rows = REASONS.filter(([k]) => counts[k]).sort((a, b) => (counts[b[0]].p + counts[b[0]].h) - (counts[a[0]].p + counts[a[0]].h));
    const max = Math.max(1, ...rows.map(([k]) => counts[k].p + counts[k].h));
    const fxD = [0, 1, 2, 3].map((i) => pours.filter((r) => r.fx === i).length);
    const ins = insights(recs);
    const ranges = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [0, 'All']];
    return `<p class="gd-kick">What’s behind the drinks</p><h2 class="gd-h">Your check-ins</h2>
      <div class="dw-range">${ranges.map(([v, l]) => `<button type="button" class="${C.range === v ? 'on' : ''}" data-act="dw-range" data-v="${v}">${l}</button>`).join('')}</div>
      ${!recs.length ? `<p class="gd-text">Nothing logged in this period yet. Each time you tap <b>Pouring one</b> in the gardens, your answers land here, and the patterns start to show after a handful of evenings.</p>` : `
      <div class="gd-wins"><div><b>${recs.length}</b><span>check-ins</span></div><div><b>${pours.length}</b><span>poured</span></div><div><b>${held}</b><span>chose not to</span></div></div>
      ${ins.length ? `<section class="gd-panel"><h2>What it’s telling you</h2>${ins.map((x) => `<p class="dw-ins">${x}</p>`).join('')}</section>` : ''}
      <section class="gd-panel"><h2>Reasons</h2><p class="gd-hint">Dark: poured · light: checked in and chose not to</p>
        <div class="dw-bars">${rows.map(([k, l]) => `<div class="dw-bar"><span class="dw-bl">${l}</span><span class="dw-bt"><i class="p" style="width:${(100 * counts[k].p) / max}%"></i><i class="h" style="width:${(100 * counts[k].h) / max}%"></i></span><span class="dw-bn">${counts[k].p + counts[k].h}</span></div>`).join('')}</div></section>
      ${pours.some((r) => r.fx != null) ? `<section class="gd-panel"><h2>How much you already felt it</h2><p class="gd-hint">At the moment of each pour</p>
        <div class="dw-bars">${FX.map((l, i) => `<div class="dw-bar"><span class="dw-bl">${l}</span><span class="dw-bt"><i class="p" style="width:${(100 * fxD[i]) / Math.max(1, ...fxD)}%"></i></span><span class="dw-bn">${fxD[i]}</span></div>`).join('')}</div></section>` : ''}
      <section class="gd-panel"><h2>Recent</h2><div class="dw-log">${recs.slice(-12).reverse().map((r) => `<div class="${r.poured ? '' : 'held'}">
        <span class="dw-lt">${new Date(r.day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${hmOf(r.t)}${r.n ? ` · drink ${r.n}` : ''}</span>
        <span>${r.poured ? '' : '<b>Chose not to</b> · '}${(r.why || []).map((k) => LABEL[k] || k).join(', ') || 'No reason picked'}${r.fx != null && r.n > 1 ? ` · felt it: ${FX[r.fx].toLowerCase()}` : ''}${r.adds ? ` · adds: ${ADDS.find((a) => a[0] === r.adds)?.[1].toLowerCase()}` : ''}</span></div>`).join('')}</div></section>`}
      <p class="gd-hint center">These patterns also feed into your Sunday review.</p>
      <div class="gd-row center"><button type="button" class="gd-btn ghost" data-act="dw-cancel">Back to the gardens</button></div>`;
  }

  function onClick(act, el) {
    switch (act) {
      case 'dw-fx': C.fx = Number(el.dataset.v); redraw(); return true;
      case 'dw-adds': C.adds = el.dataset.v; redraw(); return true;
      case 'dw-why': { const k = el.dataset.v; if (C.why.has(k)) C.why.delete(k); else C.why.add(k); redraw(); return true; }
      case 'dw-pour': logCheck(record(true)); pour(); onDone('Poured. The clock’s running. Enjoy it slowly.'); return true;
      case 'dw-hold': logCheck(record(false)); if (navigator.vibrate) navigator.vibrate([15, 40, 15]); onDone(pick(HELD)); return true;
      case 'dw-goblin': openGoblin(); return true;
      case 'dw-cancel': onDone(''); return true;
      case 'dw-range': C.range = Number(el.dataset.v); redraw(); return true;
      default: return false;
    }
  }
  return { begin, checkView, insightsView, onClick };
}
