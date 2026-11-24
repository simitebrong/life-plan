// Life Plan — "Stay in the gardens": a calm place to land in the evening, opened from the Drinks card.
// Your picture first, then your own reasons, the pacing timer and what you've already done.
// Nothing here scolds: the tone is steady, warm and forward-looking.
// Personal words live in your private synced settings (settings.gardens), never in this public code;
// the picture lives in your private storage folder ({uid}/gardens/hero.webp).

import { createGoblin } from './goblin.js';
import { createDrinkWhy } from './drinkwhy.js';

const CACHE = 'lp-gardens';
const HERO = 'gardens/hero.webp';
const DEFAULTS = {
  reasons: [
    { id: 'role', title: 'The example you set', text: 'The people who look up to you are learning what a drink is for by watching you. Let them see one enjoyed slowly.' },
    { id: 'future', title: 'The years ahead', text: 'Every paced evening is an investment in a long, healthy, clear-headed future.' },
    { id: 'money', title: 'Money back in your pocket', text: '{saved} saved so far. Real money working for you.' },
  ],
  nudges: ['Stay in the gardens.', 'Water first, then decide.', 'The clock is on your side. Let it do the work.', 'Slow is a strength.'],
};
const STEPS = [
  { id: 'look', title: 'Look', secs: 30, text: 'Look at the gardens. The willow, the water, the swan taking its time. This is where you want to be tonight.' },
  { id: 'breathe', title: 'Breathe', secs: 60, breath: true, text: 'In for four, out for six. Let your shoulders drop and your jaw unclench. Nothing needs deciding for a minute.' },
  { id: 'remember', title: 'Remember why', secs: 60, text: 'Read this slowly, and picture it as if it’s already happened.' },
  { id: 'choose', title: 'Choose your next move', secs: 0, text: 'Whatever you pick, pick it on purpose.' },
];
const CHOICES = [
  ['water', 'Water first', 'Good call. A glass of water, then see how you feel when the clock runs down.'],
  ['wait', 'Let the clock run', 'Let the timer do the work. You don’t have to decide anything until it’s done.'],
  ['slow', 'Pour one, slowly', 'Enjoy it properly. The clock starts now, so the next one waits for the full gap.'],
  ['done', 'Done for tonight', 'That’s the man she married. Enjoy the rest of the evening, clear-headed.'],
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function createGardens({ sb, esc, render, getContent, setContent, getState, pacingHTML, pour, getEntries, todayIso, logCheck }) {
  const G = { open: false, mode: 'home', step: 0, left: 0, running: false, nudge: null, reason: null, all: false, editing: false, img: undefined, msg: '', reply: null, picking: false };
  let timer = null; let last = 0; let uid = null;
  const goblin = createGoblin({ esc, redraw: () => redraw(), getContent, setContent,
    onDone: () => { G.mode = 'home'; redraw(); document.querySelector('.gd')?.scrollTo(0, 0); } });
  const dw = createDrinkWhy({ esc, redraw: () => redraw(), getEntries, todayIso, drinksSoFar: () => getState().drinks, logCheck, pour,
    onDone: (msg) => { G.mode = 'home'; G.flash = msg; redraw(); if (msg) requestAnimationFrame(() => document.querySelector('.gd-tonight')?.scrollIntoView({ block: 'start' })); else document.querySelector('.gd')?.scrollTo(0, 0); },
    openGoblin: () => { G.mode = 'goblin'; goblin.reset(); redraw(); document.querySelector('.gd')?.scrollTo(0, 0); } });

  const content = () => { const c = getContent() || {}; return { reasons: c.reasons?.length ? c.reasons : DEFAULTS.reasons, nudges: c.nudges?.length ? c.nudges : DEFAULTS.nudges }; };
  const fill = (t) => t.replace('{saved}', getState().savedText);

  // ---------- picture (private storage, cached on this phone) ----------
  const folder = async () => { if (!uid) { const { data } = await sb.auth.getUser(); uid = data?.user?.id || null; } return uid; };
  async function loadImg(force = false) {
    if (G.img !== undefined && !force) return;
    G.img = null;
    try {
      const c = 'caches' in window ? await caches.open(CACHE) : null;
      const hit = !force && c && await c.match('/__gardens/hero');
      if (hit) { G.img = URL.createObjectURL(await hit.blob()); redraw(); return; }
      const id = await folder(); if (!id) return;
      const { data } = await sb.storage.from('library').createSignedUrl(`${id}/${HERO}`, 600);
      if (!data?.signedUrl) { G.img = ''; redraw(); return; }
      const res = await fetch(data.signedUrl); if (!res.ok) { G.img = ''; redraw(); return; }
      const blob = await res.blob();
      if (c) await c.put('/__gardens/hero', new Response(blob, { headers: { 'Content-Type': blob.type || 'image/webp' } }));
      G.img = URL.createObjectURL(blob);
    } catch (e) { console.error(e); G.img = ''; }
    redraw();
  }
  let picker = null;
  function choosePicture() {
    if (!picker) {
      picker = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
      picker.addEventListener('change', async () => {
        G.picking = false; const f = picker.files?.[0]; picker.value = ''; if (!f) return;
        G.msg = 'Saving…'; redraw();
        try {
          const id = await folder(); if (!id) throw new Error('not signed in');
          const { error } = await sb.storage.from('library').upload(`${id}/${HERO}`, f, { upsert: true, contentType: f.type || 'image/jpeg' });
          if (error) throw error;
          if ('caches' in window) { const c = await caches.open(CACHE); await c.put('/__gardens/hero', new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg' } })); }
          G.img = URL.createObjectURL(f); G.msg = '';
        } catch (e) { console.error(e); G.msg = 'Couldn’t save that picture just now.'; }
        redraw();
      });
      document.body.appendChild(picker);
    }
    G.picking = true; picker.click();
  }

  // ---------- the pause ----------
  function startStep(i) {
    G.mode = 'pause'; G.step = i; G.left = STEPS[i].secs; G.running = STEPS[i].secs > 0; last = Date.now();
    if (STEPS[i].id === 'remember') G.reason = pick(content().reasons);
    clearInterval(timer); if (G.running) timer = setInterval(tick, 250);
    redraw(); document.querySelector('.gd')?.scrollTo(0, 0);
  }
  function tick() {
    if (!G.open || G.mode !== 'pause') { clearInterval(timer); return; }
    const now = Date.now(); if (G.running) G.left -= (now - last) / 1000; last = now;
    if (G.left <= 0) { if (navigator.vibrate) navigator.vibrate(20); startStep(Math.min(STEPS.length - 1, G.step + 1)); return; }
    const st = STEPS[G.step];
    const c = document.querySelector('.gd-count'); if (c) c.textContent = `${Math.floor(G.left / 60)}:${String(Math.ceil(G.left) % 60).padStart(2, '0')}`;
    const ring = document.querySelector('.gd-ring-p'); if (ring) ring.style.strokeDashoffset = String(276.5 * (1 - G.left / st.secs));
    if (st.breath) {
      const t = (st.secs - G.left) % 10; const ph = document.querySelector('.gd-phase'); const orb = document.querySelector('.gd-orb');
      if (ph) ph.textContent = t < 4 ? 'Breathe in' : 'Breathe out';
      if (orb) orb.style.transform = `scale(${t < 4 ? 0.6 + 0.4 * (t / 4) : 1 - 0.4 * ((t - 4) / 6)})`;
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.running) { G.running = false; const pp = document.querySelector('.gd-pp'); if (pp) pp.textContent = 'Resume'; } });

  // ---------- views ----------
  const redraw = () => { if (G.open) render(); };
  function entry() {
    const s = getState(); const all = content().nudges;
    if (!all.includes(G.cardNudge)) G.cardNudge = pick(all); const n = G.cardNudge;
    return `<button type="button" class="gd-entry" data-act="gd-open">
      <span class="gd-entry-ic" aria-hidden="true">${SWAN}</span>
      <span class="gd-entry-t">Stay in the gardens<small>${esc(s.live && s.over ? 'A steadying minute, whenever you want one' : n)}</small></span>
      <span class="gd-entry-go" aria-hidden="true">›</span></button>`;
  }
  function tonight() {
    const s = getState(); if (!s.live) return '';
    let lead;
    if (s.over) lead = `<p class="gd-kind">You’re past tonight’s number. That’s information, not a verdict. A glass of water now, let the clock run long, and tomorrow is an ordinary, good day.</p>`;
    else if (!s.drinks) lead = `<p class="gd-lead">Before the first one: your number tonight is <b>${s.target ?? '–'}</b>, and your gap is <b>${s.gap} minutes</b>. Tap <b>Pouring one</b> as it starts, and the clock looks after the rest.</p>`;
    else if (s.waiting) lead = `<p class="gd-lead">Use the wait: a glass of water, step outside for a minute, or take the pause below. The next one is better for the waiting.</p>`;
    else lead = `<p class="gd-lead">Gap reached. You can have one, or let the clock run on and see how you feel in ten minutes. Both are good choices.</p>`;
    return `<section class="gd-panel gd-tonight"><h2>Tonight</h2>${lead}
      <p class="gd-count-line">${s.drinks ? `${s.drinks} of ${s.target ?? '–'} so far${s.paced ? ` · ${s.paced} paced` : ''}` : 'Nothing poured yet'}</p>
      ${pacingHTML()}
      ${G.flash ? `<p class="dw-flash" role="status">${esc(G.flash)}</p>` : ''}
      <div class="gd-row"><button type="button" class="gd-btn" data-act="gd-check">Pouring one</button>
</div></section>`;
  }
  function reasonCard(r, big = false) {
    return `<article class="gd-reason${big ? ' big' : ''}"><h3>${esc(r.title)}</h3><p>${esc(fill(r.text))}</p></article>`;
  }
  function wins() {
    const w = getState().wins; if (!w.length) return '';
    return `<section class="gd-panel"><h2>Already in the bank</h2><p class="gd-hint">Proof of what you’re doing, not what you’re not.</p>
      <div class="gd-wins">${w.map(([n, l]) => `<div><b>${esc(String(n))}</b><span>${esc(l)}</span></div>`).join('')}</div></section>`;
  }
  function editor() {
    const c = content(); const gb = getContent()?.goblin || {};
    return `<p class="gd-kick">Your reasons</p><h2 class="gd-h">In your own words</h2>
      <p class="gd-hint">These are private to your account. Write them the way you’d say them to yourself. Use {saved} to show your money saved.</p>
      <div class="gd-edit">${c.reasons.map((r, i) => `<div class="gd-edit-r" data-i="${i}">
        <input type="text" data-gd="title" value="${esc(r.title)}" aria-label="Reason title">
        <textarea data-gd="text" rows="4" aria-label="Reason">${esc(r.text)}</textarea>
        <button type="button" class="gd-link" data-act="gd-del" data-i="${i}">Remove</button></div>`).join('')}</div>
      <button type="button" class="gd-btn ghost" data-act="gd-add">Add a reason</button>
      <h3 class="gd-sub">Short nudges</h3><p class="gd-hint">One per line. They rotate on the Drinks card and at the top here.</p>
      <textarea class="gd-nudges" data-gd="nudges" rows="8" aria-label="Nudges">${esc(c.nudges.join('\n'))}</textarea>
      <h3 class="gd-sub">The Goblin</h3>
      <p class="gd-hint">His name, your own put-downs, and his lies with the truth that answers them.</p>
      <input type="text" class="gd-nudges" data-gd="gname" value="${esc(gb.name || '')}" placeholder="His name (leave blank for ‘the Goblin’)" aria-label="Goblin's name">
      <p class="gd-hint" style="margin-top:12px">Your put-downs, one per line. They’ll pop up as you knock him about.</p>
      <textarea class="gd-nudges" data-gd="putdowns" rows="5" aria-label="Put-downs">${esc((gb.putdowns || []).join('\n'))}</textarea>
      <p class="gd-hint" style="margin-top:12px">His lies and the truth, one per line, as <b>what he says | the truth</b>.</p>
      <textarea class="gd-nudges" data-gd="glines" rows="5" aria-label="Goblin lines">${esc((gb.lines || []).map((l) => `${l.says} | ${l.truth}`).join('\n'))}</textarea>
      <div class="gd-row"><button type="button" class="gd-btn" data-act="gd-save">Save</button><button type="button" class="gd-btn ghost" data-act="gd-cancel">Cancel</button></div>`;
  }
  function readEditor() {
    const reasons = [...document.querySelectorAll('.gd-edit-r')].map((el, i) => ({
      id: content().reasons[i]?.id || `r${Date.now()}${i}`,
      title: el.querySelector('[data-gd=title]').value.trim(), text: el.querySelector('[data-gd=text]').value.trim() })).filter((r) => r.title || r.text);
    const nudges = (document.querySelector('[data-gd=nudges]')?.value || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const val = (k) => document.querySelector(`[data-gd=${k}]`)?.value || '';
    const lines = (k) => val(k).split('\n').map((x) => x.trim()).filter(Boolean);
    const goblin = { ...(getContent()?.goblin || {}), name: val('gname').trim(), putdowns: lines('putdowns'),
      lines: lines('glines').map((l) => { const [says, ...t] = l.split('|'); return { says: says.trim(), truth: t.join('|').trim() }; }).filter((l) => l.says && l.truth) };
    return { ...(getContent() || {}), reasons, nudges, goblin };
  }
  function hero() {
    if (G.img === null || G.img === undefined) return `<div class="gd-hero empty"><span class="gd-spin"></span></div>`;
    if (!G.img) return `<div class="gd-hero empty"><p>Add a picture that pulls you back to the person you want to be tonight.</p><button type="button" class="gd-btn" data-act="gd-pic">Choose a picture</button></div>`;
    return `<figure class="gd-hero"><img src="${G.img}" alt="Your picture: stay in the gardens"></figure>`;
  }
  function pauseView() {
    const st = STEPS[G.step];
    const body = st.id === 'look' ? hero()
      : st.id === 'breathe' ? `<div class="gd-breath"><span class="gd-orb"></span></div><p class="gd-phase">Breathe in</p>`
      : st.id === 'remember' ? reasonCard(G.reason || content().reasons[0], true)
      : `<div class="gd-choices">${CHOICES.map(([k, l]) => `<button type="button" class="gd-choice${G.reply === k ? ' on' : ''}" data-act="gd-choose" data-v="${k}">${l}</button>`).join('')}</div>
         ${G.reply ? `<p class="gd-reply" role="status">${esc(CHOICES.find((c) => c[0] === G.reply)[2])}</p>` : ''}`;
    return `<p class="gd-kick">A pause · ${G.step + 1} of ${STEPS.length}</p><h2 class="gd-h">${st.title}</h2>
      <p class="gd-text">${esc(st.text)}</p>${body}
      ${st.secs ? `<div class="gd-timer"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="gd-ring-t"/><circle cx="50" cy="50" r="44" class="gd-ring-p" transform="rotate(-90 50 50)" style="stroke-dashoffset:${276.5 * (1 - G.left / st.secs)}"/></svg><span class="gd-count">0:${String(st.secs).padStart(2, '0')}</span></div>` : ''}
      <div class="gd-row center">
        <button type="button" class="gd-btn ghost" data-act="gd-prev" ${G.step === 0 ? 'disabled' : ''} aria-label="Previous">‹</button>
        ${st.secs ? `<button type="button" class="gd-btn ghost gd-pp" data-act="gd-pp">${G.running ? 'Pause' : 'Resume'}</button><button type="button" class="gd-btn ghost" data-act="gd-next" aria-label="Next">›</button>`
          : `<button type="button" class="gd-btn" data-act="gd-home">Back to the gardens</button>`}</div>`;
  }
  function overlay() {
    if (!G.open) return '';
    const c = content(); if (!c.nudges.includes(G.nudge)) G.nudge = pick(c.nudges); const n = G.nudge;
    let body;
    if (G.editing) body = editor();
    else if (G.mode === 'pause') body = pauseView();
    else if (G.mode === 'goblin') body = goblin.view();
    else if (G.mode === 'check') body = dw.checkView();
    else if (G.mode === 'why') body = dw.insightsView();
    else {
      if (!c.reasons.includes(G.reason)) G.reason = pick(c.reasons);
      const shown = G.all ? c.reasons : [G.reason];
      body = `${hero()}
        <p class="gd-nudge">${esc(n)}</p>
        <div class="gd-row center"><button type="button" class="gd-link" data-act="gd-nudge">Another thought</button></div>
        <button type="button" class="gd-btn wide" data-act="gd-pause">Take a three-minute pause</button>
        <button type="button" class="gb-entry" data-act="gd-goblin"><span class="gb-entry-ic" aria-hidden="true">${GOB_ICON}</span>
          <span class="gb-entry-t">Destroy the Goblin<small>Shrink him, mock him, send him packing. He’s wrong about you.</small></span><span aria-hidden="true">›</span></button>
        ${tonight()}
        <section class="gd-panel"><h2>Why you’re doing this</h2>
          <div class="gd-reasons">${shown.map((r) => reasonCard(r, !G.all)).join('')}</div>
          <div class="gd-row">${G.all ? `<button type="button" class="gd-link" data-act="gd-all">Show one at a time</button>`
            : `<button type="button" class="gd-link" data-act="gd-reason">Another reason</button><button type="button" class="gd-link" data-act="gd-all">See all ${c.reasons.length}</button>`}
            <button type="button" class="gd-link" data-act="gd-edit">Edit</button></div></section>
        ${wins()}
        <button type="button" class="gd-btn ghost wide" data-act="gd-why">What’s behind the drinks</button>
        <div class="gd-row center"><button type="button" class="gd-link" data-act="gd-pic">Change picture</button></div>
        ${G.msg ? `<p class="gd-hint center">${esc(G.msg)}</p>` : ''}`;
    }
    return `<div class="gd" role="dialog" aria-modal="true" aria-label="Stay in the gardens">
      <button type="button" class="gd-x" data-act="gd-close" aria-label="Close">×</button>
      <div class="gd-inner">${body}</div></div>`;
  }

  // ---------- events ----------
  function onClick(act, el) {
    switch (act) {
      case 'gd-open': G.open = true; G.mode = 'home'; G.flash = ''; G.nudge = null; G.reason = null; G.all = false; G.editing = false; G.reply = null; G.msg = '';
        document.body.classList.add('rit-open'); loadImg(); render(); document.querySelector('.gd')?.scrollTo(0, 0); return true;
      case 'gd-close': clearInterval(timer); goblin.reset(); G.open = false; G.cardNudge = null; document.body.classList.remove('rit-open'); render(); return true;
      case 'gd-nudge': { const a = content().nudges; let x = pick(a); if (a.length > 1) while (x === G.nudge) x = pick(a); G.nudge = x; redraw(); return true; }
      case 'gd-reason': { const a = content().reasons; let x = pick(a); if (a.length > 1) while (x === G.reason) x = pick(a); G.reason = x; redraw(); return true; }
      case 'gd-all': G.all = !G.all; redraw(); return true;
      case 'gd-pause': G.reply = null; startStep(0); return true;
      case 'gd-check': clearInterval(timer); G.flash = ''; dw.begin(); G.mode = 'check'; redraw(); document.querySelector('.gd')?.scrollTo(0, 0); return true;
      case 'gd-why': G.mode = 'why'; redraw(); document.querySelector('.gd')?.scrollTo(0, 0); return true;
      case 'gd-goblin': clearInterval(timer); G.mode = 'goblin'; goblin.reset(); redraw(); document.querySelector('.gd')?.scrollTo(0, 0); return true;
      case 'gd-next': startStep(Math.min(STEPS.length - 1, G.step + 1)); return true;
      case 'gd-prev': startStep(Math.max(0, G.step - 1)); return true;
      case 'gd-pp': G.running = !G.running; last = Date.now(); redraw(); return true;
      case 'gd-home': clearInterval(timer); G.mode = 'home'; G.reply = null; redraw(); document.querySelector('.gd')?.scrollTo(0, 0); return true;
      case 'gd-choose': G.reply = el.dataset.v; if (navigator.vibrate) navigator.vibrate(12);
        if (el.dataset.v === 'slow') return onClick('gd-check'); // the honest check-in, then the clock
        redraw(); return true;
      case 'gd-pic': choosePicture(); return true;
      case 'gd-edit': G.editing = true; redraw(); document.querySelector('.gd')?.scrollTo(0, 0); return true;
      case 'gd-cancel': G.editing = false; redraw(); return true;
      case 'gd-add': { const cur = readEditor(); cur.reasons.push({ id: `r${Date.now()}`, title: '', text: '' }); setContent(cur, false); redraw(); return true; }
      case 'gd-del': { const cur = readEditor(); cur.reasons.splice(Number(el.dataset.i), 1); setContent(cur, false); redraw(); return true; }
      case 'gd-save': setContent(readEditor(), true); G.editing = false; G.nudge = null; G.reason = null; G.cardNudge = null; redraw(); return true;
      default: return act.startsWith('gb-') ? goblin.onClick(act, el) : act.startsWith('dw-') ? dw.onClick(act, el) : false;
    }
  }
  return { entry, overlay, onClick, isOpen: () => G.open };
}

const SWAN = '<svg viewBox="0 0 32 24" width="26" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6.5c0-2 1.4-3.5 3.2-3.5 1.5 0 2.6.9 3 2.2"/><path d="M16.2 5.2 18 6l-1.8.5"/><path d="M13.2 3c-1.6 2.6-1.8 5.6-.4 8.4 1 2 .4 3.6-1.4 4.6"/><path d="M5 14.5c2.5 3.6 7 5 12 5 5.6 0 9.6-2.4 11-6.5-3.6 1.2-7.4 1-10.6-.6"/><path d="M3 21.5c2-.8 4-.8 6 0s4 .8 6 0 4-.8 6 0 4 .8 6 0"/></svg>';
const GOB_ICON = '<svg viewBox="0 0 40 32" width="30" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 12 2 6l5 11M29 12l9-6-5 11"/><ellipse cx="20" cy="16" rx="11" ry="10"/><path d="M14 13l4 2M26 13l-4 2"/><path d="M16 22q4-3 8 0"/></svg>';
