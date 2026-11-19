// Life Plan — Hearth: a private, immersive space for stamina training.
// His own photos (private storage, veiled until tapped), then a guided journey through the senses
// and three slow "waves" of building and easing desire. The outcome logs straight into Stamina training.

const STEPS = [
  { title: 'Arrive', secs: 60, breath: [4, 2, 6, 0], how: [
    'Somewhere private, phone on silent, lights low. Get comfortable and let your breathing slow right down.',
    'There’s nothing to hide here. Wanting your wife is one of the best things about you. Let the heat begin, unhurried.'] },
  { title: 'Sight', secs: 90, gallery: true, how: [
    'Look at her. Take your time with each picture.',
    'The curve of her neck and shoulders, her mouth, her eyes, the way she looks at you when she wants you. Notice exactly what pulls at you, and let it.'] },
  { title: 'Sound', secs: 60, how: [
    'Close your eyes and hear her.',
    'Her breathing changing when you kiss her neck. The soft sounds she makes when she’s lost in it. Her laugh against your skin. Your name, said low.'] },
  { title: 'Scent & taste', secs: 60, how: [
    'Bring back her scent: her hair on the pillow, her perfume warming on her skin, the smell of her after a bath.',
    'The taste of her kiss, slow and deep, and the salt of her skin on your lips.'] },
  { title: 'Touch & heat', secs: 90, gallery: true, how: [
    'Remember the heat of her. Her skin under your palms, the weight of her body against yours, her fingers in your hair.',
    'Feel the warmth spread through your chest, belly and hips. Let it build, and don’t rush anything.'] },
  { title: 'First wave', secs: 90, wave: true, gallery: true, how: [
    'Let the desire rise slowly until it’s strong, around 7 out of 10.',
    'When the chime sounds, breathe out long, soften your belly and pelvic floor, and let it ease back to a 4 or 5. That’s the training.'] },
  { title: 'Second wave', secs: 90, wave: true, gallery: true, how: [
    'Build again, a little higher if you can hold it. Stay with the sensations: heat, pulse, breath.',
    'At the chime, breathe out long and slow, release the tension, and ride it back down. You’re in control of the fire.'] },
  { title: 'Third wave', secs: 90, wave: true, gallery: true, how: [
    'The last climb. Let her fill every sense: how she looks, sounds, smells, tastes and feels.',
    'Hold the peak as long as you can stay steady, then breathe it back down. Every wave you ride makes you stronger for her.'] },
  { title: 'Keep the fire', secs: 60, breath: [4, 0, 8, 0], how: [
    'Long breaths out. Let the heat settle into a warm glow rather than letting it go.',
    'This desire is hers. Decide one way you’ll let her feel it today: a look across the room, a hand on her waist, a message only she sees.'] },
];
const TOTAL = STEPS.reduce((s, x) => s + x.secs, 0);
const CACHE = 'lp-hearth';
const META = '.arrangement.json';
const OUTCOMES = [['successful', 'Held it', 'Rode every wave'], ['brief', 'Brief', 'A shorter session'], ['ruin', 'Tipped over', 'It happens. Next time.']];

export function createHearth({ sb, esc, render, getOutcome, setOutcome, dayLabel }) {
  const H = { open: false, step: -1, left: 0, running: false, pics: null, idx: 0, veiled: true, msg: '', busy: false, arrange: false, pos: {}, order: [] };
  let timer = null; let lock = null; let audio = null; let last = 0; let uid = null;

  // ---------- photos (private storage, cached on this phone) ----------
  const folder = async () => { if (!uid) { const { data } = await sb.auth.getUser(); uid = data?.user?.id || null; } return uid ? `${uid}/hearth` : null; };
  async function loadPics() {
    if (H.pics) return;
    H.pics = [];
    try {
      const dir = await folder(); if (!dir) return;
      const { data, error } = await sb.storage.from('library').list(dir, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      let names = (data || []).filter((f) => f.name && !f.name.startsWith('.')).map((f) => f.name);
      if ((data || []).some((f) => f.name === META)) {
        try { const { data: blob } = await sb.storage.from('library').download(`${dir}/${META}`); const m = JSON.parse(await blob.text()); H.pos = m.pos || {}; H.order = m.order || []; } catch { /* keep defaults */ }
      }
      const rank = (n) => { const i = H.order.indexOf(n); return i < 0 ? -1 : i; }; // new photos (not yet arranged) come first, newest first
      names = names.map((n, i) => [n, i]).sort((a, b) => (rank(a[0]) - rank(b[0])) || (a[1] - b[1])).map(([n]) => n);
      const c = 'caches' in window ? await caches.open(CACHE) : null;
      const out = []; const need = [];
      for (const n of names) {
        const hit = c && await c.match(`/__hearth/${n}`);
        if (hit) out.push({ name: n, url: URL.createObjectURL(await hit.blob()) }); else need.push(n);
      }
      if (need.length) {
        const { data: signed } = await sb.storage.from('library').createSignedUrls(need.map((n) => `${dir}/${n}`), 600);
        for (const sgn of signed || []) {
          if (!sgn.signedUrl) continue;
          const res = await fetch(sgn.signedUrl); if (!res.ok) continue;
          const blob = await res.blob(); const n = sgn.path.split('/').pop();
          if (c) await c.put(`/__hearth/${n}`, new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } }));
          out.push({ name: n, url: URL.createObjectURL(blob) });
        }
      }
      H.pics = names.map((n) => out.find((o) => o.name === n)).filter(Boolean);
    } catch (e) { console.error(e); H.msg = 'Couldn’t load your photos just now.'; }
    redraw();
  }
  async function addPics(files) {
    H.busy = true; H.msg = `Saving ${files.length} photo${files.length > 1 ? 's' : ''}…`; redraw();
    try {
      const dir = await folder(); if (!dir) throw new Error('not signed in'); const c = 'caches' in window ? await caches.open(CACHE) : null;
      for (const f of files) {
        const n = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${(f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
        const { error } = await sb.storage.from('library').upload(`${dir}/${n}`, f, { contentType: f.type || 'image/jpeg' });
        if (error) throw error;
        if (c) await c.put(`/__hearth/${n}`, new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg' } }));
        (H.pics ||= []).unshift({ name: n, url: URL.createObjectURL(f) });
      }
      H.idx = 0; H.msg = ''; saveMeta();
    } catch (e) { console.error(e); H.msg = 'Some photos didn’t save. Check your connection and try again.'; }
    H.busy = false; redraw();
  }
  async function removePic(i) {
    const p = H.pics[i]; if (!p) return;
    try {
      const dir = await folder();
      await sb.storage.from('library').remove([`${dir}/${p.name}`]);
      if ('caches' in window) await (await caches.open(CACHE)).delete(`/__hearth/${p.name}`);
      URL.revokeObjectURL(p.url); H.pics.splice(i, 1); H.idx = Math.min(H.idx, Math.max(0, H.pics.length - 1)); H.confirm = null; delete H.pos[p.name]; saveMeta();
    } catch (e) { console.error(e); H.msg = 'Couldn’t remove that one just now.'; }
    redraw();
  }

  // ---------- arrangement: order + framing, kept as a small private file beside the photos ----------
  let metaT = null;
  function saveMeta() {
    clearTimeout(metaT);
    metaT = setTimeout(async () => {
      try {
        const dir = await folder(); if (!dir || !H.pics) return;
        H.order = H.pics.map((p) => p.name);
        const pos = Object.fromEntries(Object.entries(H.pos).filter(([n]) => H.order.includes(n)));
        const body = new Blob([JSON.stringify({ order: H.order, pos })], { type: 'application/json' });
        const { error } = await sb.storage.from('library').upload(`${dir}/${META}`, body, { upsert: true, contentType: 'application/json' });
        if (error) throw error;
      } catch (e) { console.error(e); H.msg = 'Couldn’t save the arrangement just now.'; redraw(); }
    }, 500);
  }
  const posOf = (n) => H.pos[n] || { x: 50, y: 50, z: 1 };
  const frame = (n) => { const { x, y, z } = posOf(n); return `object-position:${x}% ${y}%;transform-origin:${x}% ${y}%;transform:scale(${z})`; };
  function move(i, to) {
    if (to < 0 || to >= H.pics.length || to === i) return;
    const [p] = H.pics.splice(i, 1); H.pics.splice(to, 0, p); H.idx = to; saveMeta();
  }
  // tap the big photo to centre on that spot; the zoom slider updates live without a redraw
  document.addEventListener('click', (e) => {
    const ed = e.target.closest('.hearth-edit'); if (!ed || !H.arrange) return;
    const r = ed.getBoundingClientRect(); const p = H.pics[H.idx]; if (!p) return;
    const z = posOf(p.name).z;
    const x = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
    const y = Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)));
    H.pos[p.name] = { x, y, z }; saveMeta(); redraw();
  });
  document.addEventListener('input', (e) => {
    if (!e.target.matches('[data-hearth-zoom]') || !H.arrange) return;
    const p = H.pics[H.idx]; if (!p) return;
    H.pos[p.name] = { ...posOf(p.name), z: Number(e.target.value) };
    const img = document.querySelector('.hearth-edit img'); if (img) img.style.cssText = frame(p.name);
    saveMeta();
  });

  // one picker that lives outside the app's redrawn area, so a redraw can never swallow the chosen photos
  let picker = null;
  function choose() {
    if (!picker) {
      picker = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: true, hidden: true });
      picker.addEventListener('change', () => { const files = [...(picker.files || [])]; picker.value = ''; if (files.length) addPics(files); });
      document.body.appendChild(picker);
    }
    picker.click();
  }

  // ---------- timer (same rhythm as the rituals) ----------
  function chime(soft) {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(); const g = audio.createGain();
      o.type = 'sine'; o.frequency.value = soft ? 396 : 432;
      g.gain.setValueAtTime(0.0001, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.16, audio.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 1.8);
      o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 1.9);
    } catch { /* optional */ }
    if (navigator.vibrate) navigator.vibrate(soft ? 20 : [30, 50, 30]);
  }
  async function keepAwake(on) {
    try { if (on && 'wakeLock' in navigator && !lock) lock = await navigator.wakeLock.request('screen'); if (!on && lock) { await lock.release(); lock = null; } } catch { /* fine */ }
  }
  function startStep(i) {
    H.step = i; H.left = STEPS[i].secs; H.running = true; H.eased = false; H.slide = null; last = Date.now();
    clearInterval(timer); timer = setInterval(tick, 200); keepAwake(true); redraw();
    document.querySelector('.hearth')?.scrollTo(0, 0);
  }
  function tick() {
    if (!H.running) return;
    const now = Date.now(); H.left -= (now - last) / 1000; last = now;
    const st = STEPS[H.step];
    // on picture steps, drift to the next photo every 15 seconds
    if (st.gallery && !H.veiled && H.pics?.length > 1 && Math.floor((st.secs - H.left) / 15) !== H.slide) {
      const s = Math.floor((st.secs - H.left) / 15); if (H.slide != null && s > H.slide) { H.idx = (H.idx + 1) % H.pics.length; H.slide = s; redraw(); return; } H.slide = s;
    }
    // waves: build for two thirds, then the chime says ease back
    if (st.wave && !H.eased && H.left <= st.secs / 3) { H.eased = true; chime(true); paint(); }
    if (H.left <= 0) {
      chime();
      if (H.step + 1 < STEPS.length) startStep(H.step + 1);
      else { H.step = STEPS.length; H.running = false; clearInterval(timer); keepAwake(false); redraw(); }
      return;
    }
    paint();
  }
  function paint() {
    const st = STEPS[H.step]; const el = document.querySelector('.hearth-guide'); if (!st || !el) return;
    const left = Math.max(0, Math.ceil(H.left));
    el.querySelector('.rit-count').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const ring = el.querySelector('.rit-ring-p'); if (ring) ring.style.strokeDashoffset = String(276.5 * (H.left / st.secs));
    const ph = el.querySelector('.rit-phase');
    if (st.wave && ph) ph.textContent = H.eased ? 'Ease back · breathe out long' : 'Build slowly…';
    else if (st.breath && ph) {
      const [a, b, c, d] = st.breath; const t = (st.secs - H.left) % (a + b + c + d);
      const phase = t < a ? 'Breathe in' : t < a + b ? 'Hold' : t < a + b + c ? 'Breathe out' : 'Hold';
      if (ph.textContent !== phase) ph.textContent = phase;
      const dot = el.querySelector('.rit-breath');
      if (dot) dot.style.transform = `scale(${(t < a ? 0.55 + 0.45 * (t / a) : t < a + b ? 1 : t < a + b + c ? 1 - 0.45 * ((t - a - b) / c) : 0.55).toFixed(3)})`;
    }
  }
  function stop() { clearInterval(timer); H.running = false; keepAwake(false); }
  const redraw = () => { if (H.open) { render(); paint(); } };

  // hide everything again if the phone is put down or the app is switched away
  // (no full redraw here: Android fires this when the photo picker opens, and redrawing would throw the picker's input away)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !H.open) return;
    H.veiled = true; document.querySelectorAll('.hearth-gal').forEach((g) => g.classList.add('veiled'));
    if (H.running) { H.running = false; keepAwake(false); const pp = document.querySelector('.hearth .rit-pp'); if (pp) pp.textContent = 'Resume'; }
  });

  // ---------- views ----------
  function entry() {
    const out = getOutcome();
    return `<button type="button" class="hearth-entry" data-act="hearth-open">
      <span class="hearth-ic" aria-hidden="true">${FLAME}</span>
      <span class="rit-entry-t">Hearth<small>${out ? `Logged: ${esc(OUTCOMES.find((o) => o[0] === out)?.[1] || out)}` : `Desire, unhurried · ${Math.round(TOTAL / 60)} min`}</small></span>
      <span class="rit-entry-go" aria-hidden="true">›</span></button>`;
  }
  function gallery(small) {
    if (H.pics === null) return `<div class="hearth-gal empty"><span class="rit-spin"></span></div>`;
    if (!H.pics.length) return `<div class="hearth-gal empty"><p>Add the photos of her that stir you most. They’re kept privately in your account, never on the website, and stay hidden until you tap.</p>
      <button type="button" class="rit-upload" data-act="hearth-add">Add photos</button>${H.msg ? `<p class="rit-msg">${esc(H.msg)}</p>` : ''}</div>`;
    const p = H.pics[H.idx];
    return `<div class="hearth-gal${small ? ' small' : ''}${H.veiled ? ' veiled' : ''}">
      <button type="button" class="hearth-photo" data-act="hearth-veil" aria-label="${H.veiled ? 'Reveal photo' : 'Hide photo'}"><img src="${p.url}" alt="" style="${frame(p.name)}">${H.veiled ? '<span class="hearth-veil">Tap to reveal</span>' : ''}</button>
      ${H.pics.length > 1 ? `<button type="button" class="hearth-nav prev" data-act="hearth-pic" data-n="-1" aria-label="Previous photo">‹</button><button type="button" class="hearth-nav next" data-act="hearth-pic" data-n="1" aria-label="Next photo">›</button>
      <span class="hearth-count">${H.idx + 1} / ${H.pics.length}</span>` : ''}
    </div>`;
  }
  function overlay() {
    if (!H.open) return '';
    const n = STEPS.length; let body;
    if (H.step < 0 && H.arrange && H.pics?.length) {
      const p = H.pics[H.idx]; const { x, y, z } = posOf(p.name);
      body = `<p class="rit-kicker">Hearth · Arrange photos</p>
        <div class="hearth-edit" role="img" aria-label="Photo ${H.idx + 1}. Tap where you want it centred.">
          <img src="${p.url}" alt="" style="${frame(p.name)}">
          <span class="hearth-focus" style="left:${x}%;top:${y}%"></span>
        </div>
        <p class="hearth-tip">Tap the photo where you want it centred.</p>
        <label class="hearth-zoom">Zoom <input type="range" min="1" max="2.5" step="0.05" value="${z}" data-hearth-zoom aria-label="Zoom"></label>
        <div class="hearth-moves">
          <button type="button" data-act="hearth-move" data-to="0" ${H.idx === 0 ? 'disabled' : ''}>Make first</button>
          <button type="button" data-act="hearth-move" data-to="${H.idx - 1}" ${H.idx === 0 ? 'disabled' : ''} aria-label="Move earlier">‹ Earlier</button>
          <button type="button" data-act="hearth-move" data-to="${H.idx + 1}" ${H.idx === H.pics.length - 1 ? 'disabled' : ''} aria-label="Move later">Later ›</button>
          <button type="button" data-act="hearth-reset">Reset framing</button>
        </div>
        <div class="hearth-thumbs">${H.pics.map((q, i) => `<button type="button" class="${i === H.idx ? 'on' : ''}" data-act="hearth-pick" data-i="${i}" aria-label="Photo ${i + 1}">
          <img src="${q.url}" alt="" style="${frame(q.name)}"><span>${i + 1}</span></button>`).join('')}</div>
        ${H.msg ? `<p class="rit-msg">${esc(H.msg)}</p>` : ''}
        <button type="button" class="rit-begin" data-act="hearth-arrange">Done</button>`;
    } else if (H.step < 0) {
      body = `${gallery(false)}
        <p class="rit-kicker">Hearth · Desire, unhurried</p>
        <p class="rit-intent">Wanting her is nothing to hide. Here, you lean all the way in, and learn to hold the fire.</p>
        <ol class="rit-steps hearth-steps">${STEPS.map((s, i) => `<li><button type="button" data-act="hearth-step" data-i="${i}"><span class="hearth-n">${i + 1}</span>
          <span class="rit-st"><b>${esc(s.title)}</b><span>${esc(s.how[0])}</span></span><span class="rit-sec">${s.secs >= 60 ? `${Math.round(s.secs / 6) / 10} min` : `${s.secs}s`}</span></button></li>`).join('')}</ol>
        <button type="button" class="rit-begin" data-act="hearth-begin">Begin · ${Math.round(TOTAL / 60)} min</button>
        ${H.pics?.length ? `<div class="rit-pics"><button type="button" class="rit-change" data-act="hearth-add">Add photos</button><button type="button" class="rit-change" data-act="hearth-arrange">Arrange &amp; frame</button>
          ${H.confirm === H.idx ? `<button type="button" class="rit-change warn" data-act="hearth-del">Tap again to remove this photo</button>` : `<button type="button" class="rit-change" data-act="hearth-del-ask">Remove this photo</button>`}</div>` : ''}
        ${H.msg && H.pics?.length ? `<p class="rit-msg">${esc(H.msg)}</p>` : ''}
        <p class="rit-care">The screen hides your photos again whenever you leave the app.</p>`;
    } else if (H.step >= n) {
      const cur = getOutcome();
      body = `${gallery(false)}
        <p class="rit-kicker">Hearth complete</p>
        <p class="rit-intent">Keep the warmth with you, and let her feel it today.</p>
        <p class="hearth-q">How did the session go?</p>
        <div class="hearth-out">${OUTCOMES.map(([v, l, sub]) => `<button type="button" class="${cur === v ? 'on' : ''}" data-act="hearth-out" data-v="${v}">${l}<small>${sub}</small></button>`).join('')}</div>
        <p class="rit-care">This sets Stamina training for ${esc(dayLabel())}.</p>
        <button type="button" class="rit-begin ghost" data-act="hearth-close">Close</button>`;
    } else {
      const st = STEPS[H.step];
      body = `${gallery(true)}
        <div class="rit-guide hearth-guide">
          <p class="rit-kicker">${st.wave ? 'Wave' : 'Step'} ${H.step + 1} of ${n}</p>
          <h2>${esc(st.title)}</h2>
          <div class="rit-timer">
            <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="rit-ring-t"/><circle cx="50" cy="50" r="44" class="rit-ring-p" transform="rotate(-90 50 50)"/></svg>
            ${st.breath ? `<span class="rit-breath"></span>` : ''}
            <span class="rit-count">0:00</span>
          </div>
          ${st.breath || st.wave ? `<p class="rit-phase">${st.wave ? 'Build slowly…' : 'Breathe in'}</p>` : ''}
          ${st.how.map((h) => `<p class="rit-how">${esc(h)}</p>`).join('')}
          <div class="rit-ctrl">
            <button type="button" data-act="hearth-prev" ${H.step === 0 ? 'disabled' : ''} aria-label="Previous step">‹</button>
            <button type="button" class="rit-pp" data-act="hearth-pause">${H.running ? 'Pause' : 'Resume'}</button>
            <button type="button" data-act="hearth-next" aria-label="Next step">›</button>
          </div>
        </div>`;
    }
    return `<div class="rit hearth" role="dialog" aria-modal="true" aria-label="Hearth">
      <button type="button" class="rit-x" data-act="hearth-close" aria-label="Close">×</button>
      <div class="rit-inner">${body}</div></div>`;
  }

  // ---------- events ----------
  function onClick(act, el) {
    switch (act) {
      case 'hearth-open': H.open = true; H.step = -1; H.veiled = true; H.msg = ''; document.body.classList.add('rit-open'); loadPics(); render(); return true;
      case 'hearth-close': stop(); H.open = false; H.arrange = false; H.step = -1; H.veiled = true; H.confirm = null; document.body.classList.remove('rit-open'); render(); return true;
      case 'hearth-begin': if (audio?.state === 'suspended') audio.resume(); H.veiled = false; startStep(0); return true;
      case 'hearth-step': startStep(Number(el.dataset.i)); return true;
      case 'hearth-next': if (H.step + 1 < STEPS.length) startStep(H.step + 1); else { stop(); H.step = STEPS.length; redraw(); } return true;
      case 'hearth-prev': startStep(Math.max(0, H.step - 1)); return true;
      case 'hearth-pause': H.running = !H.running; last = Date.now(); keepAwake(H.running); redraw(); return true;
      case 'hearth-add': choose(); return true;
      case 'hearth-arrange': H.arrange = !H.arrange; H.confirm = null; redraw(); document.querySelector('.hearth')?.scrollTo(0, 0); return true;
      case 'hearth-pick': H.idx = Number(el.dataset.i); redraw(); return true;
      case 'hearth-move': move(H.idx, Number(el.dataset.to)); redraw(); return true;
      case 'hearth-reset': if (H.pics?.[H.idx]) { delete H.pos[H.pics[H.idx].name]; saveMeta(); } redraw(); return true;
      case 'hearth-veil': H.veiled = !H.veiled; redraw(); return true;
      case 'hearth-pic': if (H.pics?.length) { H.idx = (H.idx + Number(el.dataset.n) + H.pics.length) % H.pics.length; H.confirm = null; } redraw(); return true;
      case 'hearth-del-ask': H.confirm = H.idx; redraw(); return true;
      case 'hearth-del': removePic(H.idx); return true;
      case 'hearth-out': setOutcome(getOutcome() === el.dataset.v ? null : el.dataset.v); if (navigator.vibrate) navigator.vibrate(15); return true;
      default: return false;
    }
  }
  function onChange(el) {
    if (!el.matches('[data-hearth-file]')) return false;
    const files = [...(el.files || [])]; if (files.length) addPics(files);
    return true;
  }
  return { entry, overlay, onClick, onChange };
}

const FLAME = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-3.9 0-6.5-2.7-6.5-6.2 0-3.4 2.4-5.4 3.6-8.3.4 2 1.4 3.2 2.6 3.9C11.5 7 13 4.6 15.2 3c-.2 3 1.2 4.7 2.4 6.5 1 1.5 1.4 3 1.4 4.7 0 3.6-2.8 6.8-7 6.8Z"/><path d="M12 21c-1.7 0-3-1.3-3-3 0-1.9 1.6-2.7 2.2-4.4.9 1 2.2 1.6 2.7 3 .2.5.3 1 .3 1.4 0 1.7-1.2 3-2.2 3Z"/></svg>';
