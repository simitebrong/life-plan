// Life Plan — morning and night grounding rituals.
// A quiet full-screen page opened from the Morning and Night cards: her picture front and centre,
// then a few minutes of breath, stretches and kneeling stillness, with an optional guided timer.
// The picture lives privately in the user's own storage folder, never on the public site.

// Four ways to do each ritual, about four minutes each, every one with a kneeling section.
const RITUALS = {
  morning: {
    title: 'Morning ritual',
    variants: [
      { id: 'rise', name: 'Rise', theme: 'Focus & energy',
        intention: 'Today I bring steady strength, patience and attention to her happiness.',
        close: 'Go gently and go well. Your one thing for her is waiting.',
        steps: [
          { title: 'Arrive', img: 'm-arrive', secs: 30, how: ['Stand tall, hands at your heart, and look at her picture.', 'Set the intention: “Today I bring steady strength, patience and attention to her happiness.”'] },
          { title: 'Rising breath', img: 'm-rise', secs: 45, breath: [4, 0, 6, 0], how: ['Breathe in as your arms sweep up overhead; breathe out as they float down.', 'Let each breath wake the body a little more.'] },
          { title: 'Cat–cow', img: 'm-catcow', secs: 45, how: ['On hands and knees: belly drops and chest lifts as you breathe in; spine rounds as you breathe out.', 'About six slow rounds.'] },
          { title: 'Kneeling stillness', img: 'm-kneel', secs: 75, kneel: true, breath: [4, 4, 4, 4], how: ['Kneel and sit back on your heels, hands on thighs, spine tall.', 'Rest your gaze on her picture, breathe in a steady square and repeat: “Steady. Present. Of service.”'] },
          { title: 'Close', img: 'm-close', secs: 45, how: ['Stand, three full breaths.', 'Choose one concrete thing you’ll do today to make her day easier or lighter.'] },
        ] },
      { id: 'offering', name: 'Offering', theme: 'Openly devoted',
        intention: 'My strength, my attention and my day are offered to her.',
        close: 'Carry the offering with you. Let her feel it in small things today.',
        steps: [
          { title: 'Lotus, hands at heart', img: 'lotus-heart', secs: 60, breath: [4, 2, 6, 0], how: ['Sit in lotus or half-lotus (or simply cross-legged), hands together at your heart.', 'Look at her picture. On each breath out, silently say her name.'] },
          { title: 'Kneeling offering', img: 'kneel-heart', secs: 75, kneel: true, how: ['Kneel tall, hands at your heart, eyes on her picture.', 'Offer the day to her, out loud or inwardly: “My strength is yours today. My attention is yours today.” Then bow your head.'] },
          { title: 'Kneeling lunge', img: 'm-lunge', secs: 50, kneel: true, switchAt: 25, how: ['From kneeling, step one foot forward, back knee down, and ease the hips forward.', 'Arms up if it feels good. Switch sides halfway.'] },
          { title: 'Rising breath', img: 'm-rise', secs: 30, breath: [4, 0, 6, 0], how: ['Stand. Arms sweep up as you breathe in, float down as you breathe out.', 'Feel ready to serve.'] },
          { title: 'Close', img: 'm-close', secs: 25, how: ['Name one act of devotion you’ll give her today.', 'Then go and make it real.'] },
        ] },
      { id: 'steady', name: 'Steady Ground', theme: 'After a hard day together',
        intention: 'I can be right, or I can be close. Today I choose close.',
        close: 'Lead with warmth. One kind act will say more than the right words.',
        steps: [
          { title: 'Ground', img: 'm-arrive', secs: 30, how: ['Stand with your feet heavy, hands at your heart.', 'Notice any tension from yesterday without telling yourself the story of it.'] },
          { title: 'Lotus, long exhale', img: 'lotus', secs: 60, breath: [4, 0, 6, 0], how: ['Sit in lotus or cross-legged, hands resting on your knees.', 'Let each breath out be longer than the breath in. Repeat: “I can be right, or I can be close.”'] },
          { title: 'Kneeling humility', img: 'm-kneel', secs: 60, kneel: true, how: ['Kneel and sit back on your heels, palms down on your thighs, eyes on her picture.', 'Ask honestly: what did she need from me that I didn’t give? Let pride soften.'] },
          { title: 'Child’s pose', img: 'n-child', secs: 45, kneel: true, how: ['Fold forward, forehead down, arms reaching towards her picture.', 'Let go of keeping score.'] },
          { title: 'Close', img: 'm-close', secs: 45, how: ['Stand and decide on one repairing gesture: a sorry, a kind word, a helping hand.', 'Say it aloud now, so it’s ready for her.'] },
        ] },
      { id: 'kindle', name: 'Kindle', theme: 'Warmth & desire',
        intention: 'My desire is a gift I keep for her, and it makes me attentive all day.',
        close: 'Let her feel wanted today, in a look, a touch, or a word.',
        steps: [
          { title: 'Lotus, warming breath', img: 'lotus', secs: 45, breath: [4, 2, 6, 0], how: ['Sit in lotus or cross-legged, hands on your knees, and look at her picture.', 'Breathe slowly into your belly and notice the warmth of wanting her. Let it rise without acting on it.'] },
          { title: 'Kneeling desire', img: 'm-kneel', secs: 60, kneel: true, breath: [4, 4, 6, 0], how: ['Kneel and sit back on your heels, spine tall, gaze holding her picture.', 'Draw the breath low into the pelvis and up the spine. Hold your desire as something you offer her, never something you take.'] },
          { title: 'Kneeling hip opener', img: 'm-lunge', secs: 50, kneel: true, switchAt: 25, how: ['From kneeling, step one foot forward and sink the hips, opening the front of the hip.', 'Breathe into the hips and pelvis. Switch sides halfway.'] },
          { title: 'Hands at heart', img: 'kneel-heart', secs: 40, kneel: true, how: ['Come back to kneeling, hands at your heart.', 'Inwardly: “Her pleasure is my purpose.”'] },
          { title: 'Close', img: 'm-close', secs: 45, how: ['Stand and plan one way she’ll feel desired today: a note, a lingering touch, a compliment that’s only for her.', 'Carry the warmth with you, quietly.'] },
        ] },
    ],
  },
  night: {
    title: 'Night ritual',
    variants: [
      { id: 'settle', name: 'Settle', theme: 'Gratitude & rest',
        intention: 'I’m grateful for her, for today, and for the chance to show up for her again tomorrow.',
        close: 'Well done. Rest now, you’ve given today your best.',
        steps: [
          { title: 'Settle', img: 'n-settle', secs: 30, how: ['Lights low. Sit comfortably and look at her picture.', 'Let your shoulders drop and your jaw soften.'] },
          { title: 'Kneeling gratitude', img: 'n-gratitude', secs: 75, kneel: true, breath: [4, 7, 8, 0], how: ['Kneel and sit back on your heels, palms up on your thighs.', 'Bring three moments to mind: something she did, something you’re grateful to share with her, and one way you showed up for her.'] },
          { title: 'Child’s pose', img: 'n-child', secs: 45, kneel: true, how: ['Fold forward, forehead down, arms reaching towards her picture.', 'With every breath out, let the day go.'] },
          { title: 'Legs up the wall', img: 'n-wall', secs: 60, breath: [4, 0, 6, 0], how: ['Legs resting up a wall or the headboard.', 'Soften each part of you from your feet up to your face.'] },
          { title: 'Close', img: 'n-rest', secs: 30, how: ['“Thank you for today. Tomorrow I will … for her.”', 'Then rest.'] },
        ] },
      { id: 'vigil', name: 'Vigil', theme: 'Openly devoted',
        intention: 'Everything I did today, I offer to her.',
        close: 'Your devotion is complete for today. Sleep well beside it.',
        steps: [
          { title: 'Lotus, gazing', img: 'lotus-heart', secs: 60, breath: [4, 2, 6, 0], how: ['Sit in lotus or cross-legged, hands at your heart, with a soft gaze on her picture.', 'On each breath out, silently say her name.'] },
          { title: 'Kneeling homage', img: 'n-child', secs: 75, kneel: true, how: ['Kneel, then bow forward until your forehead rests on the floor, arms reaching towards her picture.', 'Offer her your day: everything you did well, and everything you’ll do better.'] },
          { title: 'Kneeling heart', img: 'kneel-heart', secs: 40, kneel: true, how: ['Rise to kneeling, hands at your heart.', 'Silently thank her for three things she is, not just things she did.'] },
          { title: 'Lying twist', img: 'n-twist', secs: 40, switchAt: 20, how: ['On your back, knees fall to one side, arms wide. Switch halfway.', 'Let the spine unwind.'] },
          { title: 'Rest', img: 'n-rest', secs: 25, how: ['Lie still, hands on your heart.', '“All of it, for her.”'] },
        ] },
      { id: 'soft', name: 'Soft Return', theme: 'After a hard day together',
        intention: 'Nothing that happened today is bigger than us.',
        close: 'Sleep on kindness. Tomorrow starts with your one sentence.',
        steps: [
          { title: 'Settle and name it', img: 'n-settle', secs: 30, how: ['Sit and look at her picture.', 'Name the feeling (hurt, frustrated, tired) without blaming anyone for it.'] },
          { title: 'Kneeling understanding', img: 'n-gratitude', secs: 75, kneel: true, breath: [4, 7, 8, 0], how: ['Kneel and sit back on your heels, palms up.', 'Picture her face when she’s happy. Ask: what was she really asking me for today?'] },
          { title: 'Lotus, letting go', img: 'lotus', secs: 45, breath: [4, 0, 6, 0], how: ['Sit in lotus or cross-legged, hands on your knees.', 'On every breath out: “I let go of keeping score.”'] },
          { title: 'Legs up the wall', img: 'n-wall', secs: 60, breath: [4, 0, 6, 0], how: ['Legs up the wall or the headboard.', 'Let your body settle even if your mind hasn’t yet.'] },
          { title: 'Close', img: 'n-rest', secs: 30, how: ['Choose one sentence to say to her, tonight or first thing tomorrow.', 'Make it warm, and make it yours.'] },
        ] },
      { id: 'velvet', name: 'Velvet', theme: 'Warmth & desire',
        intention: 'My desire belongs to her, and I keep it warm for her.',
        close: 'Rest with that warmth. Fall asleep thinking of how to delight her.',
        steps: [
          { title: 'Lotus, slow warmth', img: 'lotus', secs: 30, breath: [4, 2, 6, 0], how: ['Sit in lotus or cross-legged, lights low, and look at her picture.', 'Let your breath slow down and your body warm.'] },
          { title: 'Kneeling desire', img: 'n-gratitude', secs: 75, kneel: true, breath: [4, 4, 6, 0], how: ['Kneel and sit back on your heels, palms up, eyes on her.', 'Breathe low into the pelvis. Let the wanting build, and hold it as an offering to her, not a demand.'] },
          { title: 'Surrender', img: 'n-child', secs: 45, kneel: true, how: ['Fold forward into child’s pose, arms reaching towards her picture.', 'Surrender the day, and the wanting, to her.'] },
          { title: 'Bridge', img: 'bridge', secs: 45, how: ['On your back, knees bent, feet flat. Lift your hips slowly as you breathe in, lower as you breathe out.', 'Feel strength and warmth through the hips.'] },
          { title: 'Close', img: 'n-rest', secs: 45, how: ['Lie still, one hand on your heart and one on your belly.', 'Imagine one way you’ll make her feel adored, and drift off with it.'] },
        ] },
    ],
  },
};
const total = (r) => r.steps.reduce((s, x) => s + x.secs, 0);
const mins = (s) => `${Math.round(s / 60)} min`;
const MAIN = 'devotion'; // the original picture, used by any variant without its own
const cacheKey = (slot) => (slot === MAIN ? '/__lp-ritual-image' : `/__lp-ritual-${slot}`);
const POSE = (id) => `/guides/ritual/${id}.webp`;
const PTS = 75;
const CACHE = 'lp-ritual';

export function createRitual({ S, sb, esc, render, isDone, setDone, dayLabel }) {
  const R = { kind: null, v: null, step: -1, left: 0, running: false, msg: '' };
  const PIC = {}; // slot -> { url, state: 'loading' | 'ready' | 'missing' }
  let timer = null; let lock = null; let audio = null; let last = 0;
  const lastVariant = (kind) => { try { return localStorage.getItem(`lp-rit-${kind}`); } catch { return null; } };
  const remember = (kind, v) => { try { localStorage.setItem(`lp-rit-${kind}`, v); } catch { /* fine */ } };
  const variants = (kind) => RITUALS[kind].variants;
  const slotOf = () => `${R.kind}-${R.v}`;

  // ---------- pictures (private storage + on-device cache), one per variant ----------
  let uid = null;
  const pathFor = async (slot) => { if (!uid) { const { data } = await sb.auth.getUser(); uid = data?.user?.id || null; } return uid ? `${uid}/ritual/${slot}.jpg` : null; };
  async function fetchSlot(slot) {
    if (PIC[slot]?.state === 'ready' || PIC[slot]?.state === 'loading') return;
    PIC[slot] = { state: 'loading' };
    try {
      const c = 'caches' in window ? await caches.open(CACHE) : null;
      const hit = c && await c.match(cacheKey(slot));
      if (hit) { PIC[slot] = { state: 'ready', url: URL.createObjectURL(await hit.blob()) }; return redraw(); }
      const path = await pathFor(slot);
      const { data, error } = path ? await sb.storage.from('library').createSignedUrl(path, 600) : { error: true };
      if (error || !data?.signedUrl) { PIC[slot] = { state: 'missing' }; return redraw(); }
      const res = await fetch(data.signedUrl);
      if (!res.ok) { PIC[slot] = { state: 'missing' }; return redraw(); }
      const blob = await res.blob();
      if (c) await c.put(cacheKey(slot), new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } }));
      PIC[slot] = { state: 'ready', url: URL.createObjectURL(blob) };
    } catch (e) { console.error(e); PIC[slot] = { state: 'missing' }; }
    redraw();
  }
  function loadImages() { fetchSlot(slotOf()); fetchSlot(MAIN); }
  // the variant's own picture, else the main one
  function currentPic() {
    const own = PIC[slotOf()]; const main = PIC[MAIN];
    if (own?.state === 'ready') return { ...own, own: true };
    if (own?.state === 'loading') return { state: 'loading' };
    if (main?.state === 'ready') return { ...main, own: false };
    if (main?.state === 'loading') return { state: 'loading' };
    return { state: 'missing' };
  }
  async function upload(file, slot) {
    R.msg = 'Saving your picture…'; redraw();
    try {
      const path = await pathFor(slot);
      const { error } = await sb.storage.from('library').upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
      if (error) throw error;
      if ('caches' in window) { const c = await caches.open(CACHE); await c.put(cacheKey(slot), new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } })); }
      if (PIC[slot]?.url) URL.revokeObjectURL(PIC[slot].url);
      PIC[slot] = { state: 'ready', url: URL.createObjectURL(file) }; R.msg = '';
    } catch (e) { console.error(e); R.msg = 'That didn’t save. Check your connection and try again.'; }
    redraw();
  }
  async function useMain() {
    const slot = slotOf();
    try {
      const path = await pathFor(slot);
      if (path) await sb.storage.from('library').remove([path]);
      if ('caches' in window) { const c = await caches.open(CACHE); await c.delete(cacheKey(slot)); }
    } catch (e) { console.error(e); }
    if (PIC[slot]?.url) URL.revokeObjectURL(PIC[slot].url);
    PIC[slot] = { state: 'missing' }; redraw();
  }

  // ---------- timer ----------
  const routine = () => variants(R.kind).find((x) => x.id === R.v) || variants(R.kind)[0];
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
  function entry(kind, done, style) {
    const r = RITUALS[kind]; if (!r) return '';
    const used = style && r.variants.find((x) => x.id === style);
    return `<button type="button" class="rit-entry${done ? ' done' : ''}" data-act="rit-open" data-v="${kind}">
      <span class="rit-entry-ic" aria-hidden="true">${done ? '✓' : kind === 'morning' ? SUN : MOON}</span>
      <span class="rit-entry-t">${r.title}<small>${done ? `${used ? `${used.name} · ` : ''}Done · +${PTS} points` : `${r.variants.map((x) => x.name).join(' · ')} · 4 min`}</small></span><span class="rit-entry-go" aria-hidden="true">›</span></button>`;
  }
  function doneTick() {
    const on = isDone(R.kind); const when = dayLabel();
    return `<button type="button" class="rit-done${on ? ' on' : ''}" data-act="rit-done" aria-pressed="${on}">
      <span class="rit-tick" aria-hidden="true">${on ? '✓' : ''}</span>
      <span>${on ? `Done ${when === 'today' ? 'today' : `for ${esc(when)}`} · +${PTS} points` : `I’ve done ${esc(routine().name)}${when === 'today' ? '' : ` (${esc(when)})`}`}<small>${on ? 'Tap to undo' : `Adds ${PTS} points to the day`}</small></span></button>`;
  }

  function picture(small) {
    const p = currentPic();
    if (p.state === 'ready') return `<img class="rit-img${small ? ' small' : ''}" src="${p.url}" alt="Her picture">`;
    if (p.state === 'missing') return `<div class="rit-img empty"><p>Add the picture you want to centre ${esc(routine().name)} on. It’s stored privately in your account and kept on this phone.</p>
      <label class="rit-upload">Choose picture<input type="file" accept="image/*" data-rit-file hidden></label>${R.msg ? `<p class="rit-msg">${esc(R.msg)}</p>` : ''}</div>`;
    return `<div class="rit-img empty"><span class="rit-spin"></span></div>`;
  }
  function chooser() {
    return `<div class="rit-vars" role="group" aria-label="Choose a ritual">${variants(R.kind).map((x) => `<button type="button" class="rit-var${x.id === R.v ? ' on' : ''}" data-act="rit-var" data-v="${x.id}" aria-pressed="${x.id === R.v}">${esc(x.name)}<small>${esc(x.theme)}</small></button>`).join('')}</div>`;
  }

  function overlay() {
    if (!R.kind) return '';
    const r = routine(); const n = r.steps.length;
    let body;
    if (R.step < 0) {
      const p = currentPic();
      body = `${chooser()}${picture(false)}
        <p class="rit-kicker">${esc(r.name)} · ${esc(r.theme)}</p>
        <p class="rit-intent">${esc(r.intention)}</p>
        <ol class="rit-steps">${r.steps.map((s, i) => `<li><button type="button" data-act="rit-step" data-i="${i}"><span class="rit-thumb"><img src="${POSE(s.img)}" alt="" loading="lazy"><span class="rit-n">${i + 1}</span></span>
          <span class="rit-st"><b>${esc(s.title)}${s.kneel ? ' <em>kneel</em>' : ''}</b><span>${esc(s.how.join(' '))}</span></span><span class="rit-sec">${s.secs >= 60 ? `${Math.round(s.secs / 6) / 10} min` : `${s.secs}s`}</span></button></li>`).join('')}</ol>
        <button type="button" class="rit-begin" data-act="rit-begin">Begin · ${mins(total(r))}</button>
        ${doneTick()}
        <p class="rit-care">Use a cushion under your knees, and ease off anything that pinches. Slow and steady is the point.</p>
        ${p.state === 'ready' ? `<div class="rit-pics"><label class="rit-change">${p.own ? `Change ${esc(r.name)}’s picture` : `Give ${esc(r.name)} its own picture`}<input type="file" accept="image/*" data-rit-file hidden></label>
          ${p.own ? `<button type="button" class="rit-change" data-act="rit-usemain">Use the main picture</button>` : ''}</div>${R.msg ? `<p class="rit-msg">${esc(R.msg)}</p>` : ''}` : ''}`;
    } else if (R.step >= n) {
      body = `${picture(false)}
        <p class="rit-kicker">${esc(r.name)} complete</p>
        <p class="rit-intent">${esc(r.close)}</p>
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
    return `<div class="rit rit-${R.kind} v-${R.v}" role="dialog" aria-modal="true" aria-label="${RITUALS[R.kind].title}: ${esc(r.name)}">
      <button type="button" class="rit-x" data-act="rit-close" aria-label="Close">×</button>
      <div class="rit-inner">${body}</div></div>`;
  }

  // ---------- events ----------
  function onClick(act, el) {
    switch (act) {
      case 'rit-open': {
        R.kind = el.dataset.v; const lv = lastVariant(R.kind);
        R.v = variants(R.kind).some((x) => x.id === lv) ? lv : variants(R.kind)[0].id;
        R.step = -1; R.msg = ''; document.body.classList.add('rit-open'); loadImages(); render(); return true;
      }
      case 'rit-var': R.v = el.dataset.v; remember(R.kind, R.v); R.msg = ''; loadImages(); redraw(); return true;
      case 'rit-usemain': useMain(); return true;
      case 'rit-close': stop(); R.kind = null; R.step = -1; document.body.classList.remove('rit-open'); render(); return true;
      case 'rit-begin': if (audio?.state === 'suspended') audio.resume(); startStep(0); return true;
      case 'rit-step': startStep(Number(el.dataset.i)); return true;
      case 'rit-next': R.switched = false; if (R.step + 1 < routine().steps.length) startStep(R.step + 1); else { stop(); R.step = routine().steps.length; redraw(); } return true;
      case 'rit-prev': R.switched = false; startStep(Math.max(0, R.step - 1)); return true;
      case 'rit-done': setDone(R.kind, !isDone(R.kind), R.v); if (navigator.vibrate) navigator.vibrate(isDone(R.kind) ? [20, 40, 20] : 10); return true;
      case 'rit-pause': R.running = !R.running; last = Date.now(); keepAwake(R.running); redraw(); return true;
      default: return false;
    }
  }
  function onChange(el) {
    if (!el.matches('[data-rit-file]')) return false;
    const f = el.files?.[0]; if (f) upload(f, currentPic().state === 'missing' && !PIC[MAIN]?.url ? MAIN : slotOf());
    return true;
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && R.kind) onClick('rit-close'); });
  return { entry, overlay, onClick, onChange, isOpen: () => !!R.kind };
}

const SUN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/><path d="M17 3.5v3M15.5 5h3"/></svg>';
