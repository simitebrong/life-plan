// Life Plan — morning and night grounding rituals.
// A quiet full-screen page opened from the Morning and Night cards: her picture front and centre,
// then a few minutes of breath, stretches and kneeling stillness, with an optional guided timer.
// The picture lives privately in the user's own storage folder, never on the public site.

const ROUTINES = {
  morning: {
    title: 'Morning ritual',
    theme: 'Focus & energy',
    intention: 'Today I bring steady strength, patience and attention to her happiness.',
    steps: [
      { title: 'Arrive', img: 'm-arrive', secs: 30, how: ['Stand tall, feet hip-width apart. Look at her picture.', 'Set today’s intention, quietly or out loud: “Today I bring steady strength, patience and attention to her happiness.”'] },
      { title: 'Rising breath', img: 'm-rise', secs: 60, breath: [4, 0, 6, 0], how: ['Breathe in through your nose as your arms sweep up overhead.', 'Breathe out slowly as they float back down. Let the body wake up.'] },
      { title: 'Cat–cow', img: 'm-catcow', secs: 60, how: ['On hands and knees. Breathing in, let the belly drop and lift your chest and gaze.', 'Breathing out, round your spine and tuck your chin. Move with the breath, about eight rounds.'] },
      { title: 'Kneeling stillness', img: 'm-kneel', secs: 75, kneel: true, breath: [4, 4, 4, 4], how: ['Kneel and sit back on your heels, hands resting on your thighs, spine tall, shoulders soft.', 'Rest your gaze on her picture. Breathe in a steady square, and repeat inwardly: “Steady. Present. Of service.”'] },
      { title: 'Kneeling lunge', img: 'm-lunge', secs: 60, kneel: true, switchAt: 30, how: ['From kneeling, step your right foot forward, knee over ankle, back knee down.', 'Ease your hips forward to open the front of the back hip; lift your arms if it feels good. Switch sides halfway.'] },
      { title: 'Close', img: 'm-close', secs: 30, how: ['Stand and take three full breaths.', 'Choose one concrete thing you’ll do today to make her day easier or lighter, and hold it in mind as you go.'] },
    ],
  },
  night: {
    title: 'Night ritual',
    theme: 'Gratitude & rest',
    intention: 'I’m grateful for her, for today, and for the chance to show up for her again tomorrow.',
    steps: [
      { title: 'Settle', img: 'n-settle', secs: 30, how: ['Lights low. Sit comfortably and look at her picture.', 'Let your shoulders drop and your jaw soften.'] },
      { title: 'Kneeling gratitude', img: 'n-gratitude', secs: 90, kneel: true, breath: [4, 7, 8, 0], how: ['Kneel and sit back on your heels, palms resting upward on your thighs.', 'Bring three moments to mind: something she did today, something you’re grateful to share with her, and one way you showed up for her.'] },
      { title: 'Child’s pose', img: 'n-child', secs: 60, kneel: true, how: ['From kneeling, fold forward, forehead to the floor or a cushion, arms reaching out towards her picture.', 'With every breath out, let a little more of the day go.'] },
      { title: 'Lying twist', img: 'n-twist', secs: 60, switchAt: 30, how: ['Lie on your back and hug your knees in. Let them fall to the right, arms wide, and look left.', 'Switch sides halfway.'] },
      { title: 'Legs up the wall', img: 'n-wall', secs: 90, breath: [4, 0, 6, 0], how: ['Lie with your legs resting up a wall or the headboard.', 'Breathe slowly and soften each part of you from your feet up to your face.'] },
      { title: 'Close', img: 'n-rest', secs: 30, how: ['One line to end the day: “Thank you for today. Tomorrow I will … for her.”', 'Then rest.'] },
    ],
  },
};
const total = (r) => r.steps.reduce((s, x) => s + x.secs, 0);
const mins = (s) => `${Math.round(s / 60)} min`;
const IMG_KEY = '/__lp-ritual-image';
const POSE = (id) => `/guides/ritual/${id}.webp`;
const PTS = 75;
const CACHE = 'lp-ritual';

export function createRitual({ S, sb, esc, render, isDone, setDone, dayLabel }) {
  const R = { kind: null, step: -1, left: 0, running: false, img: null, imgState: 'idle', msg: '' };
  let timer = null; let lock = null; let audio = null; let last = 0;

  // ---------- the picture (private storage + on-device cache) ----------
  const pathFor = async () => { const { data } = await sb.auth.getUser(); return data?.user ? `${data.user.id}/ritual/devotion.jpg` : null; };
  async function loadImage() {
    if (R.img || R.imgState === 'loading') return;
    R.imgState = 'loading';
    try {
      const c = 'caches' in window ? await caches.open(CACHE) : null;
      const hit = c && await c.match(IMG_KEY);
      if (hit) { R.img = URL.createObjectURL(await hit.blob()); R.imgState = 'ready'; return redraw(); }
      const path = await pathFor();
      const { data, error } = path ? await sb.storage.from('library').createSignedUrl(path, 600) : { error: true };
      if (error || !data?.signedUrl) { R.imgState = 'missing'; return redraw(); }
      const res = await fetch(data.signedUrl);
      if (!res.ok) { R.imgState = 'missing'; return redraw(); }
      const blob = await res.blob();
      if (c) await c.put(IMG_KEY, new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } }));
      R.img = URL.createObjectURL(blob); R.imgState = 'ready';
    } catch (e) { console.error(e); R.imgState = R.img ? 'ready' : 'missing'; }
    redraw();
  }
  async function upload(file) {
    R.msg = 'Saving your picture…'; redraw();
    try {
      const path = await pathFor();
      const { error } = await sb.storage.from('library').upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
      if (error) throw error;
      if ('caches' in window) { const c = await caches.open(CACHE); await c.put(IMG_KEY, new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } })); }
      if (R.img) URL.revokeObjectURL(R.img);
      R.img = URL.createObjectURL(file); R.imgState = 'ready'; R.msg = '';
    } catch (e) { console.error(e); R.msg = 'That didn’t save. Check your connection and try again.'; }
    redraw();
  }

  // ---------- timer ----------
  const routine = () => ROUTINES[R.kind];
  function chime() {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(); const g = audio.createGain();
      o.type = 'sine'; o.frequency.value = 528;
      g.gain.setValueAtTime(0.0001, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 1.6);
      o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 1.7);
    } catch { /* sound is optional */ }
    if (navigator.vibrate) navigator.vibrate(30);
  }
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !lock) lock = await navigator.wakeLock.request('screen');
      if (!on && lock) { await lock.release(); lock = null; }
    } catch { /* not supported */ }
  }
  function startStep(i) {
    R.step = i; R.left = routine().steps[i].secs; R.running = true; last = Date.now();
    clearInterval(timer); timer = setInterval(tick, 200); keepAwake(true); redraw();
    document.querySelector('.rit')?.scrollTo(0, 0);
  }
  function tick() {
    if (!R.running) return;
    const now = Date.now(); R.left -= (now - last) / 1000; last = now;
    const st = routine().steps[R.step];
    if (st.switchAt && !R.switched && st.secs - R.left >= st.switchAt) { R.switched = true; chime(); }
    if (R.left <= 0) {
      chime(); R.switched = false;
      if (R.step + 1 < routine().steps.length) startStep(R.step + 1);
      else { R.step = routine().steps.length; R.running = false; clearInterval(timer); keepAwake(false); redraw(); document.querySelector('.rit')?.scrollTo(0, 0); }
      return;
    }
    paint();
  }
  // update the countdown and breath pacer in place, without re-rendering the page
  function paint() {
    const st = routine().steps[R.step]; if (!st) return;
    const el = document.querySelector('.rit-guide'); if (!el) return;
    const left = Math.max(0, Math.ceil(R.left));
    el.querySelector('.rit-count').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const ring = el.querySelector('.rit-ring-p');
    if (ring) ring.style.strokeDashoffset = String(276.5 * (R.left / st.secs));
    const sw = el.querySelector('.rit-switch');
    if (sw) sw.hidden = !(st.switchAt && st.secs - R.left >= st.switchAt);
    if (st.breath) {
      const [a, b, c, d] = st.breath; const cyc = a + b + c + d;
      const t = (st.secs - R.left) % cyc;
      const [phase, scale] = t < a ? ['Breathe in', 0.55 + 0.45 * (t / a)] : t < a + b ? ['Hold', 1] : t < a + b + c ? ['Breathe out', 1 - 0.45 * ((t - a - b) / c)] : ['Hold', 0.55];
      const dot = el.querySelector('.rit-breath'); const lab = el.querySelector('.rit-phase');
      if (dot) dot.style.transform = `scale(${scale.toFixed(3)})`;
      if (lab && lab.textContent !== phase) lab.textContent = phase;
    }
  }
  function stop() { clearInterval(timer); R.running = false; keepAwake(false); }
  const redraw = () => { if (R.kind) { render(); paint(); } };

  // ---------- views ----------
  function entry(kind, done) {
    const r = ROUTINES[kind]; if (!r) return '';
    return `<button type="button" class="rit-entry${done ? ' done' : ''}" data-act="rit-open" data-v="${kind}">
      <span class="rit-entry-ic" aria-hidden="true">${done ? '✓' : kind === 'morning' ? SUN : MOON}</span>
      <span class="rit-entry-t">${r.title}<small>${done ? `Done · +${PTS} points` : `${r.theme} · ${mins(total(r))}`}</small></span><span class="rit-entry-go" aria-hidden="true">›</span></button>`;
  }
  function doneTick() {
    const on = isDone(R.kind); const when = dayLabel();
    return `<button type="button" class="rit-done${on ? ' on' : ''}" data-act="rit-done" aria-pressed="${on}">
      <span class="rit-tick" aria-hidden="true">${on ? '✓' : ''}</span>
      <span>${on ? `Done ${when === 'today' ? 'today' : `for ${esc(when)}`} · +${PTS} points` : `I’ve done my ${R.kind} ritual${when === 'today' ? '' : ` (${esc(when)})`}`}<small>${on ? 'Tap to undo' : `Adds ${PTS} points to the day`}</small></span></button>`;
  }

  function picture(small) {
    if (R.imgState === 'ready' && R.img) return `<img class="rit-img${small ? ' small' : ''}" src="${R.img}" alt="Her picture">`;
    if (R.imgState === 'missing') return `<div class="rit-img empty"><p>Add the picture you want to centre this ritual on. It’s stored privately in your account and kept on this phone.</p>
      <label class="rit-upload">Choose picture<input type="file" accept="image/*" data-rit-file hidden></label>${R.msg ? `<p class="rit-msg">${esc(R.msg)}</p>` : ''}</div>`;
    return `<div class="rit-img empty"><span class="rit-spin"></span></div>`;
  }

  function overlay() {
    if (!R.kind) return '';
    const r = routine(); const n = r.steps.length;
    let body;
    if (R.step < 0) {
      body = `${picture(false)}
        <p class="rit-kicker">${r.title} · ${r.theme}</p>
        <p class="rit-intent">${esc(r.intention)}</p>
        <ol class="rit-steps">${r.steps.map((s, i) => `<li><button type="button" data-act="rit-step" data-i="${i}"><span class="rit-thumb"><img src="${POSE(s.img)}" alt="" loading="lazy"><span class="rit-n">${i + 1}</span></span>
          <span class="rit-st"><b>${esc(s.title)}${s.kneel ? ' <em>kneel</em>' : ''}</b><span>${esc(s.how.join(' '))}</span></span><span class="rit-sec">${s.secs >= 60 ? `${Math.round(s.secs / 6) / 10} min` : `${s.secs}s`}</span></button></li>`).join('')}</ol>
        <button type="button" class="rit-begin" data-act="rit-begin">Begin · ${mins(total(r))}</button>
        ${doneTick()}
        <p class="rit-care">Use a cushion under your knees, and ease off anything that pinches. Slow and steady is the point.</p>
        ${R.imgState === 'ready' ? `<label class="rit-change">Change picture<input type="file" accept="image/*" data-rit-file hidden></label>${R.msg ? `<p class="rit-msg">${esc(R.msg)}</p>` : ''}` : ''}`;
    } else if (R.step >= n) {
      body = `${picture(false)}
        <p class="rit-kicker">${r.title} complete</p>
        <p class="rit-intent">${R.kind === 'morning' ? 'Go gently and go well. Your one thing for her is waiting.' : 'Well done. Rest now, you’ve given today your best.'}</p>
        ${doneTick()}
        <button type="button" class="rit-begin ghost" data-act="rit-close">Close</button>`;
    } else {
      const st = r.steps[R.step];
      body = `<div class="rit-pair">${picture(true)}<img class="rit-pose" src="${POSE(st.img)}" alt="How ${esc(st.title.toLowerCase())} looks"></div>
        <div class="rit-guide">
          <p class="rit-kicker">Step ${R.step + 1} of ${n}${st.kneel ? ' · kneel' : ''}</p>
          <h2>${esc(st.title)}</h2>
          <div class="rit-timer">
            <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="rit-ring-t"/><circle cx="50" cy="50" r="44" class="rit-ring-p" transform="rotate(-90 50 50)"/></svg>
            ${st.breath ? `<span class="rit-breath"></span>` : ''}
            <span class="rit-count">0:00</span>
          </div>
          ${st.breath ? `<p class="rit-phase">Breathe in</p>` : ''}
          ${st.switchAt ? `<p class="rit-switch" hidden>Switch sides</p>` : ''}
          ${st.how.map((h) => `<p class="rit-how">${esc(h)}</p>`).join('')}
          <div class="rit-ctrl">
            <button type="button" data-act="rit-prev" ${R.step === 0 ? 'disabled' : ''} aria-label="Previous step">‹</button>
            <button type="button" class="rit-pp" data-act="rit-pause">${R.running ? 'Pause' : 'Resume'}</button>
            <button type="button" data-act="rit-next" aria-label="Next step">›</button>
          </div>
        </div>`;
    }
    return `<div class="rit rit-${R.kind}" role="dialog" aria-modal="true" aria-label="${r.title}">
      <button type="button" class="rit-x" data-act="rit-close" aria-label="Close">×</button>
      <div class="rit-inner">${body}</div></div>`;
  }

  // ---------- events ----------
  function onClick(act, el) {
    switch (act) {
      case 'rit-open': R.kind = el.dataset.v; R.step = -1; R.msg = ''; document.body.classList.add('rit-open'); loadImage(); render(); return true;
      case 'rit-close': stop(); R.kind = null; R.step = -1; document.body.classList.remove('rit-open'); render(); return true;
      case 'rit-begin': if (audio?.state === 'suspended') audio.resume(); startStep(0); return true;
      case 'rit-step': startStep(Number(el.dataset.i)); return true;
      case 'rit-next': R.switched = false; if (R.step + 1 < routine().steps.length) startStep(R.step + 1); else { stop(); R.step = routine().steps.length; redraw(); } return true;
      case 'rit-prev': R.switched = false; startStep(Math.max(0, R.step - 1)); return true;
      case 'rit-done': setDone(R.kind, !isDone(R.kind)); if (navigator.vibrate) navigator.vibrate(isDone(R.kind) ? [20, 40, 20] : 10); return true;
      case 'rit-pause': R.running = !R.running; last = Date.now(); keepAwake(R.running); redraw(); return true;
      default: return false;
    }
  }
  function onChange(el) {
    if (!el.matches('[data-rit-file]')) return false;
    const f = el.files?.[0]; if (f) upload(f);
    return true;
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && R.kind) onClick('rit-close'); });
  return { entry, overlay, onClick, onChange, isOpen: () => !!R.kind };
}

const SUN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/><path d="M17 3.5v3M15.5 5h3"/></svg>';
