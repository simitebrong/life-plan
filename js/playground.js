// Life Plan — the Playground: a glittering, Basil-first celebration of the canon.
// Everything quoted here is his own text (checked word for word on the server); reviews and blurbs
// are clearly labelled as imagined. Data lives in the `playground` table, built by the playground function.

const WPM = 250;
const BENCH = [ // well-known word counts, for fun comparisons (approximate)
  [587000, 'War and Peace'], [455000, 'The Lord of the Rings'], [365000, 'Moby-Dick'], [185000, 'Great Expectations'],
];
const SCORE_LABEL = { wit: 'Wit', invention: 'Invention', pace: 'Pace', set_pieces: 'Set pieces', atmosphere: 'Atmosphere', heart: 'Heart' };
const FEEL_LABEL = { tenderness: 'Tenderness', loyalty: 'Loyalty', courage: 'Courage', grief: 'Grief', longing: 'Longing', redemption: 'Redemption', sacrifice: 'Sacrifice', joy: 'Joy', homecoming: 'Homecoming', farewell: 'Farewell' };
const KIND_LABEL = { wit: 'Wit', atmosphere: 'Atmosphere', wisdom: 'Wisdom', menace: 'Menace', tenderness: 'Tenderness', action: 'Action' };
const MOODS = [['laugh', 'A laugh'], ['lift', 'A lift'], ['lump', 'A lump in the throat'], ['courage', 'Courage'], ['swagger', 'Some swagger']];
const hash = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const textOf = (x) => x.passage || x.quote || x.text || '';
const DAY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmt = (n) => Math.round(n).toLocaleString('en-GB');

export function createPlayground({ sb, esc, render, openStory }) {
  const P = { open: false, stories: null, canon: null, loading: false, tab: 'show', hall: 'funniest', feel: 'all', moment: null, vol: 0, sort: 'order',
    lever: null, quote: null, extras: null, favs: new Map(), reg: {}, mood: null, moodItem: null, mirror: null, castOpen: null, card: null, daily: undefined, award: new Set(), expanded: null, building: null, pep: null, review: 0, err: '' };

  // ---------- data ----------
  async function load() {
    if (P.loading) return; P.loading = true; P.err = '';
    try {
      const { data, error } = await sb.from('playground').select('kind,item_id,data,created_at');
      if (error) throw error;
      P.stories = (data || []).filter((r) => r.kind === 'story').map((r) => ({ ...r.data, itemId: r.item_id }))
        .sort((a, b) => a.volNum - b.volNum || a.num - b.num);
      P.canon = (data || []).find((r) => r.kind === 'canon')?.data || null;
      P.extras = (data || []).find((r) => r.kind === 'extras')?.data || null;
      const { data: favs } = await sb.from('playground_favs').select('key,item_id,data,created_at').order('created_at', { ascending: false });
      P.favs = new Map((favs || []).map((f) => [f.key, f]));
      await findMissing();
    } catch (e) { console.error(e); P.err = 'Couldn’t open the Playground just now. Check your connection and try again.'; P.stories = P.stories || []; }
    P.loading = false; redraw();
  }
  // Basil text items that haven't been read for the Playground yet
  async function findMissing() {
    const { data: shelves } = await sb.from('shelves').select('id,parent_id,is_basil');
    const { data: items } = await sb.from('library_items').select('id,shelf_id,kind,title');
    const kids = (id) => (shelves || []).filter((s) => s.parent_id === id);
    const basil = new Set(); const walk = (s) => { basil.add(s.id); kids(s.id).forEach(walk); };
    (shelves || []).filter((s) => s.is_basil && !s.parent_id).forEach(walk);
    const tops = new Set((shelves || []).filter((s) => s.is_basil && !s.parent_id).flatMap((s) => [s.id, ...kids(s.id).map((k) => k.id)]));
    const have = new Set(P.stories.map((s) => s.itemId));
    // individual stories live two levels down (Basil > Volume > Story); skip whole-volume manuscripts
    P.noHeart = P.stories.filter((s) => !s.moving).map((s) => s.itemId);
    P.missing = (items || []).filter((i) => i.kind === 'text' && basil.has(i.shelf_id) && !tops.has(i.shelf_id) && !have.has(i.id)).map((i) => i.id);
  }
  async function build() {
    if (P.building) return;
    const stories = [...P.missing]; const hearts = [...new Set([...P.missing, ...(P.noHeart || [])])];
    const run = async (action, ids, phase) => {
      const todo = [...ids]; if (!todo.length) return;
      P.building = { done: 0, total: todo.length, phase }; redraw();
      const worker = async () => {
        while (todo.length) {
          const id = todo.shift();
          try { await sb.functions.invoke('playground', { body: { action, itemId: id } }); } catch (e) { console.error(e); }
          P.building.done++; redraw();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    };
    await run('story', stories, 'stories');
    await run('heart', hearts, 'hearts');
    P.building = P.building || { done: 0, total: 0 };
    P.building.phase = 'canon'; redraw();
    try { await sb.functions.invoke('playground', { body: { action: 'canon' } }); } catch (e) { console.error(e); }
    P.building.phase = 'extras'; redraw();
    try { await sb.functions.invoke('playground', { body: { action: 'extras' } }); } catch (e) { console.error(e); }
    P.building = null; P.loading = false; P.stories = null; await load(); confetti(60);
  }
  async function refreshExtras() {
    P.building = { done: 0, total: 0, phase: 'extras' }; redraw();
    try { await sb.functions.invoke('playground', { body: { action: 'extras' } }); } catch (e) { console.error(e); }
    P.building = null; P.stories = null; await load(); confetti(40);
  }
  async function refreshCanon() {
    P.building = { done: 0, total: 0, phase: 'canon' }; redraw();
    try { await sb.functions.invoke('playground', { body: { action: 'canon' } }); } catch (e) { console.error(e); }
    P.building = null; P.stories = null; await load(); confetti(40);
  }

  // ---------- derived ----------
  const all = (key) => P.stories.flatMap((s) => (s[key] || []).map((x) => ({ ...(typeof x === 'string' ? { quote: x } : x), story: s.story, vol: s.volNum, itemId: s.itemId })));
  const inVol = (arr) => (P.vol ? arr.filter((x) => x.vol === P.vol) : arr);
  function totals() {
    const S = P.stories; const words = S.reduce((a, s) => a + (s.words || 0), 0);
    const places = new Set(S.flatMap((s) => s.places || []).map((p) => p.split(',')[0].trim()));
    return { words, stories: S.length, chapters: S.reduce((a, s) => a + (s.chapters || 0), 0), epigraphs: S.reduce((a, s) => a + (s.epigraphs?.length || 0), 0),
      laughs: S.reduce((a, s) => a + (s.funniest?.length || 0), 0), places: places.size, hours: words / WPM / 60,
      longest: [...S].sort((a, b) => b.words - a.words)[0] };
  }
  const avg = (s) => { const v = Object.values(s.scores || {}); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };

  // ---------- views ----------
  const TABS = [['show', 'The Show'], ['lines', 'Hall of Lines'], ['heart', 'Heartstrings'], ['cast', 'The Cast'], ['atlas', 'The Atlas'], ['awards', 'Awards'], ['stories', 'The Cases'], ['critic', 'The Critic'], ['mine', '★ My Anthology']];
  function overlay() {
    if (!P.open) return '';
    let body;
    if (!P.stories) body = `<div class="pg-wait"><span class="pg-bulb-spin"></span><p>Raising the curtain…</p></div>`;
    else if (!P.stories.length) body = emptyStage();
    else {
      body = `${marquee()}
        <nav class="pg-tabs" role="tablist">${TABS.map(([id, l]) => `<button type="button" role="tab" class="${P.tab === id ? 'on' : ''}" aria-selected="${P.tab === id}" data-act="pg-tab" data-v="${id}">${l}</button>`).join('')}</nav>
        ${P.tab === 'show' ? viewShow() : P.tab === 'lines' ? viewLines() : P.tab === 'heart' ? viewHeart() : P.tab === 'cast' ? viewCast() : P.tab === 'atlas' ? viewAtlas() : P.tab === 'mine' ? viewMine() : P.tab === 'awards' ? viewAwards() : P.tab === 'stories' ? viewStories() : viewCritic()}
        ${buildBar()}`;
    }
    return `<div class="pg" role="dialog" aria-modal="true" aria-label="The Playground">
      <button type="button" class="pg-x" data-act="pg-close" aria-label="Close">×</button>
      <button type="button" class="pg-hype" data-act="pg-hype" aria-label="Hype me up">✦ Hype me up</button>
      ${P.pep ? `<div class="pg-pep" role="status"><span>✦</span><p>${esc(P.pep)}</p></div>` : ''}
      <div class="pg-inner">${body}</div>${cardSheet()}</div>`;
  }
  function emptyStage() {
    const n = P.missing?.length || 0;
    return `<div class="pg-empty">${bulbs(18)}<h1 class="pg-title">The Playground</h1><p class="pg-sub">Starring Basil Ruffletum</p>
      ${P.building ? progress() : `<p>${n ? `Your ${n} Basil stories are waiting in the wings. Lighting up the Playground reads every one of them in full and gathers your funniest lines, finest moments and greatest set pieces. It takes a few minutes.` : 'Add your Basil stories to the Basil shelf in your library, then come back to light up the Playground.'}</p>
      ${n ? `<button type="button" class="pg-gold" data-act="pg-build">Light up the Playground</button>` : ''}`}${P.err ? `<p class="pg-err">${esc(P.err)}</p>` : ''}</div>`;
  }
  function progress() {
    const b = P.building; const pct = (b.phase === 'canon' || b.phase === 'extras') ? 100 : Math.round((b.done / Math.max(1, b.total)) * 100);
    return `<div class="pg-progress"><p>${b.phase === 'canon' ? 'The critic is writing up the whole canon…' : b.phase === 'extras' ? 'Gathering the cast and plotting the atlas…' : b.phase === 'hearts' ? `Finding the heart of story ${Math.min(b.done + 1, b.total)} of ${b.total}…` : `Reading story ${Math.min(b.done + 1, b.total)} of ${b.total}…`}</p>
      <div class="pg-bar"><span style="width:${pct}%"></span></div></div>`;
  }
  function buildBar() {
    if (P.building) return `<section class="pg-panel">${progress()}</section>`;
    const n = P.missing?.length || 0; const h = P.noHeart?.length || 0;
    return `<footer class="pg-foot">${n ? `<button type="button" class="pg-ghost" data-act="pg-build">Read ${n} new stor${n === 1 ? 'y' : 'ies'} into the Playground</button>` : h ? `<button type="button" class="pg-ghost" data-act="pg-build">Find the heart in ${h} more stor${h === 1 ? 'y' : 'ies'}</button>` : ''}
      <button type="button" class="pg-ghost" data-act="pg-recanon">Ask the critic for a fresh take</button>
      ${P.tab === 'cast' || P.tab === 'atlas' ? `<button type="button" class="pg-ghost" data-act="pg-extras">Refresh the cast and atlas</button>` : ''}
      <p class="pg-fine">Every quotation here is your own text, checked word for word. Reviews and blurbs are imagined, written to show how readers would respond.</p></footer>`;
  }
  const bulbs = (n) => `<div class="pg-bulbs" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>`;
  function marquee() {
    const t = totals();
    return `<header class="pg-marquee">${bulbs(22)}
      <p class="pg-kick">Now showing</p>
      <h1 class="pg-title">The Playground</h1>
      <p class="pg-sub">Starring Basil Ruffletum · Five volumes · ${t.stories} cases</p>
      ${P.canon?.tagline ? `<p class="pg-tag">“${esc(P.canon.tagline)}”</p>` : ''}
      ${bulbs(22)}</header>`;
  }

  // ---------- quote tools: read at the exact spot, favourite, make a card ----------
  function reg(x, kind) {
    const k = `${kind}:${hash(textOf(x))}`; P.reg[k] = { ...x, kind }; return k;
  }
  function tools(x, kind, label = 'Read it ›') {
    const k = reg(x, kind); const on = P.favs.has(k);
    return `<span class="pg-tools">${x.itemId ? `<button type="button" class="pg-link" data-act="pg-read" data-k="${k}">${label}</button>` : ''}
      <button type="button" class="pg-ico${on ? ' on' : ''}" data-act="pg-fav" data-k="${k}" aria-pressed="${on}" aria-label="${on ? 'Remove from' : 'Add to'} My Anthology">${on ? '★' : '☆'}</button>
      <button type="button" class="pg-ico" data-act="pg-card" data-k="${k}" aria-label="Make a quote card">▣</button></span>`;
  }
  async function toggleFav(k) {
    const x = P.reg[k] || P.favs.get(k)?.data; if (!x) return;
    if (P.favs.has(k)) {
      P.favs.delete(k); redraw();
      const { error } = await sb.from('playground_favs').delete().eq('key', k); if (error) console.error(error);
    } else {
      const data = { kind: x.kind, text: textOf(x), story: x.story, vol: x.vol, itemId: x.itemId, by: x.by || null, title: x.title || null, feeling: x.feeling || null, why: x.why || null };
      P.favs = new Map([[k, { key: k, item_id: x.itemId || null, data, created_at: new Date().toISOString() }], ...P.favs]); redraw(); confetti(18);
      const { error } = await sb.from('playground_favs').insert({ key: k, item_id: x.itemId || null, data }); if (error) console.error(error);
    }
  }
  function viewMine() {
    const favs = [...P.favs.values()];
    if (!favs.length) return `<section class="pg-panel"><h2>My Anthology</h2><p>Tap the ☆ on any line or moment and it lands here: your own hand-picked best of Basil.</p></section>`;
    return `<p class="pg-intro">Your hand-picked best of the canon. ${favs.length} piece${favs.length === 1 ? '' : 's'} and counting.</p>
      <div class="pg-wall">${favs.map((f, i) => { const x = { ...f.data, quote: f.data.text }; P.reg[f.key] = x; const on = true;
        return `<figure class="pg-card${f.data.kind === 'moving' ? ' pg-card-heart' : ''}" style="--d:${(i % 12) * 40}ms">
        ${x.title ? `<h3 class="pg-card-t">${esc(x.title)}</h3>` : ''}<blockquote>${esc(x.text)}</blockquote>
        <figcaption>${x.by ? `— ${esc(x.by)}<br>` : ''}${esc(x.story || '')}${x.vol ? ` · Vol. ${x.vol}` : ''}</figcaption>
        <span class="pg-tools">${x.itemId ? `<button type="button" class="pg-link" data-act="pg-read" data-k="${f.key}">Read it ›</button>` : ''}
        <button type="button" class="pg-ico on" data-act="pg-fav" data-k="${f.key}" aria-pressed="true" aria-label="Remove from My Anthology">★</button>
        <button type="button" class="pg-ico" data-act="pg-card" data-k="${f.key}" aria-label="Make a quote card">▣</button></span></figure>`; }).join('')}</div>`;
  }

  // ---------- quote card image ----------
  async function makeCard(x) {
    const W = 1080, H = 1350; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    try { await Promise.all([document.fonts.load('italic 500 60px "Cormorant Garamond"'), document.fonts.load('600 30px "Bricolage Grotesque"')]); } catch { /* fall back */ }
    const heart = x.kind === 'moving';
    const bg = g.createRadialGradient(W / 2, 0, 50, W / 2, 300, 1300);
    bg.addColorStop(0, heart ? '#3a1d10' : '#3a2a0a'); bg.addColorStop(0.55, heart ? '#140a07' : '#120d04'); bg.addColorStop(1, '#050403');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const gold = g.createLinearGradient(0, 0, W, H); gold.addColorStop(0, '#FFF1C1'); gold.addColorStop(0.5, '#D4AF37'); gold.addColorStop(1, '#9c7a17');
    g.strokeStyle = gold; g.lineWidth = 3; g.strokeRect(40, 40, W - 80, H - 80); g.lineWidth = 1; g.strokeRect(56, 56, W - 112, H - 112);
    g.fillStyle = '#D4AF37'; g.textAlign = 'center'; g.font = '600 26px "Bricolage Grotesque", sans-serif';
    const spaced = (t, y) => { g.save(); if ('letterSpacing' in g) g.letterSpacing = '8px'; g.fillText(t, W / 2, y); g.restore(); };
    spaced(heart ? 'HEARTSTRINGS' : 'BASIL RUFFLETUM', 130);
    if (x.title) { g.fillStyle = '#F7D9B5'; g.font = '500 44px "Cormorant Garamond", serif'; g.fillText(x.title, W / 2, 200); }
    // fit the text
    const raw = textOf(x).replace(/\s*\n\s*/g, ' ').trim(); const text = /^[“"]/.test(raw) ? raw : `“${raw}”`;
    const maxW = W - 220; const top = x.title ? 250 : 210; const bottom = H - 250;
    let size = 66, lines = [];
    const wrap = () => { const words = text.split(' '); lines = []; let line = '';
      for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line); };
    for (; size >= 26; size -= 2) { g.font = `italic 500 ${size}px "Cormorant Garamond", serif`; wrap(); if (lines.length * size * 1.32 <= bottom - top) break; }
    const lh = size * 1.32; let y = top + (bottom - top - lines.length * lh) / 2 + size;
    g.fillStyle = '#FFF6DE'; lines.forEach((l) => { g.fillText(l, W / 2, y); y += lh; });
    g.fillStyle = '#E9C766'; g.font = '500 34px "Cormorant Garamond", serif';
    g.fillText(x.by ? `— ${x.by}` : `— ${x.story || 'Basil Ruffletum'}`, W / 2, H - 175);
    g.fillStyle = '#A8956A'; g.font = '600 22px "Bricolage Grotesque", sans-serif';
    spaced(`BRIEF CASES${x.vol ? ` · VOLUME ${x.vol}` : ''}`, H - 120);
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }
  function cardSheet() {
    if (!P.card) return '';
    return `<div class="pg-sheet" role="dialog" aria-modal="true" aria-label="Quote card">
      <div class="pg-sheet-in">${P.card.url ? `<img src="${P.card.url}" alt="Quote card">` : '<div class="pg-wait small"><span class="pg-bulb-spin"></span></div>'}
      <div class="pg-row">${P.card.url ? `${navigator.canShare ? '<button type="button" class="pg-gold" data-act="pg-card-share">Share</button>' : ''}<button type="button" class="pg-ghost" data-act="pg-card-save">Save image</button>` : ''}
      <button type="button" class="pg-ghost" data-act="pg-card-close">Close</button></div></div></div>`;
  }

  // ---------- mood picker ----------
  function moodPool(m) {
    const fin = (kinds) => all('finest').filter((f) => kinds.includes(f.kind)).map((f) => ({ ...f, k: 'finest' }));
    const mv = (fn) => all('moving').filter(fn).map((x) => ({ ...x, k: 'moving' }));
    if (m === 'laugh') return all('funniest').map((x) => ({ ...x, k: 'funniest' }));
    if (m === 'lift') return [...(P.canon?.pep_talks || []).map((t) => ({ text: t, k: 'pep' })), ...fin(['wisdom', 'tenderness'])];
    if (m === 'lump') return mv((x) => x.intensity >= 4);
    if (m === 'courage') return [...mv((x) => ['courage', 'loyalty', 'sacrifice', 'redemption'].includes(x.feeling)), ...fin(['action'])];
    return [...all('basilisms').map((x) => ({ ...x, k: 'basilisms' })), ...all('epigraphs').map((x) => ({ ...x, k: 'epigraphs' }))];
  }
  function moodPanel() {
    const x = P.moodItem;
    return `<section class="pg-panel pg-mood">
      <h2>What do you need right now?</h2>
      <div class="pg-chips">${MOODS.map(([k, l]) => `<button type="button" class="${P.mood === k ? 'on' : ''}" data-act="pg-mood" data-v="${k}">${l}</button>`).join('')}</div>
      ${x ? `<div class="pg-mood-out${x.k === 'moving' ? ' heart' : ''}">
        ${x.k === 'moving' ? moment(x) : x.k === 'pep' ? `<p class="pg-mirror">${esc(x.text)}</p>` : `<blockquote>${x.k === 'epigraphs' ? '“' : ''}${esc(x.quote)}${x.k === 'epigraphs' ? '”' : ''}</blockquote>
          <p class="pg-src">${x.by ? `— ${esc(x.by)} · ` : ''}${esc(x.story)} · Vol. ${x.vol}</p>${x.why ? `<p class="pg-why">${esc(x.why)}</p>` : ''}${tools(x, x.k)}`}
        <div class="pg-row"><button type="button" class="pg-ghost" data-act="pg-mood" data-v="${P.mood}">Another</button></div></div>` : ''}</section>`;
  }

  // ---------- Line of the day (Today page) ----------
  async function loadDaily() {
    const today = DAY();
    try { const c = JSON.parse(localStorage.getItem('lp-pg-daily') || 'null'); if (c?.date === today) { P.daily = c.item; render(); return; } } catch { /* ignore */ }
    try {
      const { data } = await sb.from('playground').select('item_id,story:data->>story,vol:data->>volNum,funniest:data->funniest,basilisms:data->basilisms,finest:data->finest').eq('kind', 'story').order('item_id');
      const pool = (data || []).flatMap((r) => [...(r.funniest || []).map((f) => f.quote), ...(r.basilisms || []), ...(r.finest || []).map((f) => f.quote)]
        .map((q) => ({ quote: q, story: r.story, vol: Number(r.vol), itemId: r.item_id })));
      if (!pool.length) { P.daily = null; return; }
      const n = Math.floor(Date.parse(today) / 864e5);
      P.daily = pool[(n * 7919) % pool.length];
      try { localStorage.setItem('lp-pg-daily', JSON.stringify({ date: today, item: P.daily })); } catch { /* ignore */ }
    } catch (e) { console.error(e); P.daily = null; }
    render();
  }
  function todayLine() {
    if (P.daily === undefined) { P.daily = null; loadDaily(); return ''; }
    const x = P.daily; if (!x) return '';
    return `<section class="pg-today" aria-label="Basil's line for today">
      <p class="pg-today-k">✦ Basil’s line for today</p>
      <blockquote>${esc(x.quote)}</blockquote>
      <p class="pg-today-s">${esc(x.story)} · Vol. ${x.vol}</p>
      <div class="pg-today-b"><button type="button" class="link sm" data-act="pg-today-read">Read it in place</button><button type="button" class="link sm" data-act="pg-open">Visit the Playground</button></div></section>`;
  }

  // ----- The Cast -----
  function linesWith(name) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return [...all('funniest').map((x) => ({ ...x, k: 'funniest' })), ...all('finest').map((x) => ({ ...x, k: 'finest' })), ...all('basilisms').map((x) => ({ ...x, k: 'basilisms' }))]
      .filter((x) => re.test(x.quote));
  }
  function viewCast() {
    const E = P.extras;
    if (!E?.characters?.length) return `<section class="pg-panel"><h2>The Cast</h2><p>The editor hasn’t gathered the recurring cast yet.</p>
      ${P.building ? progress() : `<button type="button" class="pg-gold" data-act="pg-extras">Gather the cast and the atlas</button>`}</section>`;
    // the partnership timeline: each story's strongest moment that is about the two of them
    const best = {};
    all('moving').filter((m) => m.intensity >= 4 && /\bLiss\b/.test(`${m.passage} ${m.setup}`) && /\bBasil\b/.test(`${m.passage} ${m.setup}`))
      .forEach((m) => { if (!best[m.itemId] || m.intensity > best[m.itemId].intensity) best[m.itemId] = m; });
    const numOf = (id) => P.stories.find((s) => s.itemId === id)?.num || 0;
    const liss = Object.values(best).sort((a, b) => a.vol - b.vol || numOf(a.itemId) - numOf(b.itemId));
    return `${E.duo ? `<section class="pg-panel pg-duo"><p class="pg-kick">The partnership</p><h2>${esc(E.duo.title)}</h2><p>${esc(E.duo.overview)}</p>
      ${liss.length ? `<h3 class="pg-tl-h">Their story, moment by moment</h3><ol class="pg-tl">${(P.tlAll ? liss : liss.slice(0, 6)).map((m) => `<li><span class="pg-tl-v">Vol. ${m.vol}</span>
        <b>${esc(m.title)}</b><span class="pg-tl-s">${esc(m.story)} · ${FEEL_LABEL[m.feeling] || m.feeling}</span><p>${esc(m.setup || '')}</p>${tools({ ...m }, 'moving', 'Read the moment ›')}</li>`).join('')}</ol>
      ${liss.length > 6 ? `<button type="button" class="pg-ghost" data-act="pg-tl">${P.tlAll ? 'Show fewer' : `Show all ${liss.length} moments`}</button>` : ''}` : ''}</section>` : ''}
      <div class="pg-castlist">${E.characters.map((c, i) => {
        const open = P.castOpen === i; const lines = open ? linesWith(c.key).slice(0, 4) : [];
        return `<article class="pg-char${open ? ' open' : ''}">
          <button type="button" class="pg-char-h" data-act="pg-char" data-i="${i}" aria-expanded="${open}">
            <span class="pg-char-n">${esc(c.name)}</span><span class="pg-char-r">${esc(c.role)} · ${c.appearances?.length || 0} cases</span>
            <span class="pg-char-t">${esc(c.tagline)}</span></button>
          ${open ? `<div class="pg-char-b"><p>${esc(c.portrait)}</p><h3>Across the canon</h3><p>${esc(c.arc)}</p>
            <h3>${i === 0 ? 'What makes him tick' : 'With Basil'}</h3><p>${esc(c.with_basil)}</p>
            ${lines.length ? `<h3>Lines</h3>${lines.map((x) => `<blockquote>${esc(x.quote)}</blockquote><p class="pg-src">${esc(x.story)} · Vol. ${x.vol}</p>${tools(x, x.k)}`).join('')}` : ''}
            ${c.appearances?.length ? `<h3>Appears in</h3><div class="pg-appear">${c.appearances.map((a) => { const st = P.stories.find((s) => s.story === a.story);
              return st ? `<button type="button" data-act="pg-read" data-id="${st.itemId}">Vol. ${a.vol} · ${esc(a.story.replace(/^Basil Ruff?letum & /, ''))}</button>` : ''; }).join('')}</div>` : ''}</div>` : ''}
        </article>`; }).join('')}</div>`;
  }

  // ----- The Atlas -----
  function viewAtlas() {
    const A = P.extras?.atlas;
    if (!A?.length) return `<section class="pg-panel"><h2>The Atlas</h2><p>The places haven’t been plotted yet.</p>
      ${P.building ? progress() : `<button type="button" class="pg-gold" data-act="pg-extras">Gather the cast and the atlas</button>`}</section>`;
    const byC = {}; A.forEach((p) => { (byC[p.country] ||= []).push(p); });
    const nStories = new Set(A.flatMap((p) => p.items)).size;
    return `<p class="pg-intro">${A.length} places in ${Object.keys(byC).length} countries, across ${nStories} cases. Tap a light.</p>
      <div id="pg-map" class="pg-map" aria-label="Map of every place in the canon"></div>
      <div class="pg-countries">${Object.entries(byC).sort((a, b) => b[1].length - a[1].length).map(([c, ps]) => `<div><b>${esc(c)}</b><span>${ps.map((p) => esc(p.label)).join(' · ')}</span></div>`).join('')}</div>`;
  }
  let leafletP = null;
  function leaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (!leafletP) leafletP = new Promise((res, rej) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
      const js = document.createElement('script'); js.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'; js.onload = () => res(window.L); js.onerror = rej; document.head.appendChild(js);
    });
    return leafletP;
  }
  async function drawMap() {
    const el = document.getElementById('pg-map'); if (!el || el.dataset.ready) return; el.dataset.ready = '1';
    let L; try { L = await leaflet(); } catch { el.innerHTML = '<p class="pg-hint">The map needs a connection.</p>'; return; }
    if (!document.body.contains(el)) return;
    const map = L.map(el, { worldCopyJump: true, zoomControl: true, attributionControl: true }).setView(P.mapView?.c || [30, 10], P.mapView?.z || 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map);
    map.on('moveend', () => { P.mapView = { c: map.getCenter(), z: map.getZoom() }; });
    const spots = {};
    for (const p of P.extras.atlas) { const k = `${p.lat.toFixed(1)},${p.lng.toFixed(1)}`; (spots[k] ||= { lat: p.lat, lng: p.lng, places: [] }).places.push(p); }
    for (const s of Object.values(spots)) {
      const ids = [...new Set(s.places.flatMap((p) => p.items))];
      const m = L.circleMarker([s.lat, s.lng], { radius: 5 + 2.4 * Math.sqrt(ids.length), color: '#FFE7A0', weight: 1.5, fillColor: '#D4AF37', fillOpacity: 0.85, className: 'pg-pin' }).addTo(map);
      const box = document.createElement('div'); box.className = 'pg-pop';
      box.innerHTML = `<b>${esc(s.places.map((p) => p.label).filter((v, i, a) => a.indexOf(v) === i).join(' · '))}</b><small>${esc(s.places[0].country)}</small>`;
      ids.forEach((id) => { const st = P.stories.find((x) => x.itemId === id); if (!st) return;
        const b = document.createElement('button'); b.type = 'button'; b.textContent = `${st.story.replace(/^Basil Ruff?letum & /, '')} · Vol. ${st.volNum}`;
        b.addEventListener('click', () => { P.open = false; document.body.classList.remove('rit-open'); openStory(id); }); box.appendChild(b); });
      m.bindPopup(box, { className: 'pg-popup', maxWidth: 260 });
    }
  }
  function afterRender() { if (P.open && P.tab === 'atlas') drawMap(); }

  // ----- The Show -----
  function viewShow() {
    const t = totals(); const funny = all('funniest');
    const bench = BENCH.find(([w]) => t.words > w);
    const q = P.lever || pick(funny);
    P.lever = q;
    const ep = all('epigraphs');
    const epi = P.epi || (P.epi = pick(ep));
    const blurbs = P.canon?.blurbs || [];
    return `
      <section class="pg-stats">
        ${stat(fmt(t.words), 'words written')}${stat(t.stories, 'cases solved')}${stat(t.chapters, 'chapters')}
        ${stat(Math.round(t.hours), 'hours of reading')}${stat(t.laughs, 'certified laughs')}${stat(t.places, 'places visited')}
      </section>
      ${bench ? `<p class="pg-brag">That’s more words than <b>${bench[1]}</b>. Read aloud at a steady pace, that’s about ${fmt(t.hours)} hours of Basil.</p>` : ''}
      ${blurbs.length ? `<div class="pg-ticker" aria-label="Imagined blurbs"><div class="pg-ticker-in">${[...blurbs, ...blurbs].map((b) => `<span>“${esc(b.text)}” <em>— ${esc(b.persona)}</em></span>`).join('<i>✦</i>')}</div></div>` : ''}

      ${moodPanel()}

      <section class="pg-panel pg-slot">
        <h2>Pull the lever</h2>
        <p class="pg-hint">A random line from somewhere in the canon. Every one a winner.</p>
        <div class="pg-reel${P.spin ? ' spin' : ''}"><blockquote>${esc(q.quote)}</blockquote>
          <p class="pg-src">${esc(q.story)} · Vol. ${q.vol}</p>${q.why ? `<p class="pg-why">${esc(q.why)}</p>` : ''}</div>
        <div class="pg-row"><button type="button" class="pg-gold" data-act="pg-lever">Pull again ✦</button>${tools(q, 'funniest', 'Open it in the story ›')}</div>
      </section>

      ${epi ? `<section class="pg-panel pg-epi">
        <h2>From Basil’s Book of Quotations</h2>
        <blockquote>“${esc(epi.quote)}”</blockquote><p class="pg-src">— ${esc(epi.by)}</p>
        <p class="pg-hint">${esc(epi.story)}, ${esc(epi.chapter || '')}. One of ${ep.length} chapter epigraphs.</p>
        <div class="pg-row"><button type="button" class="pg-ghost" data-act="pg-epi">Another ✦</button>${tools(epi, 'epigraphs')}</div></section>` : ''}

      ${lumpPanel()}

      ${P.canon?.pep_talks?.length ? `<section class="pg-panel pg-dressing">
        <h2>Dressing-room mirror</h2>${(P.mirror || (P.mirror = shuffle(P.canon.pep_talks).slice(0, 3))).map((x) => `<p class="pg-mirror">${esc(x)}</p>`).join('')}
        <div class="pg-row"><button type="button" class="pg-ghost" data-act="pg-mirror">Another ✦</button></div></section>` : ''}

      ${reviewDeck()}
      ${passport()}`;
  }
  function lumpPanel() {
    const all3 = all('moving'); if (!all3.length) return '';
    const strong = all3.filter((m) => m.intensity >= 4);
    const m = P.moment || (P.moment = pick(strong.length ? strong : all3));
    return `<section class="pg-panel pg-candle">
      <h2>A lump in the throat</h2><p class="pg-hint">One of the moments where the comedy stops and something lands.</p>
      ${moment(m, false)}
      <div class="pg-row"><button type="button" class="pg-ghost" data-act="pg-moment">Another</button><button type="button" class="pg-ghost" data-act="pg-tab" data-v="heart">All of Heartstrings</button></div></section>`;
  }
  const embers = (n) => `<span class="pg-embers" aria-label="Intensity ${n} of 5">${'<i class="on"></i>'.repeat(n)}${'<i></i>'.repeat(5 - n)}</span>`;
  function moment(m, full = true) {
    return `<figure class="pg-moment">
      <p class="pg-m-top"><span class="pg-feel">${FEEL_LABEL[m.feeling] || esc(m.feeling)}</span>${embers(m.intensity)}</p>
      <h3>${esc(m.title)}</h3>
      ${m.setup ? `<p class="pg-m-setup">${esc(m.setup)}</p>` : ''}
      <blockquote>${esc(m.passage)}</blockquote>
      <figcaption>${esc(m.story)} · Vol. ${m.vol}${full && m.why ? `<em>${esc(m.why)}</em>` : ''}</figcaption>
      ${tools(m, 'moving', 'Read it in the story ›')}</figure>`;
  }
  function viewHeart() {
    const list = all('moving');
    if (!list.length) return `<section class="pg-panel pg-candle"><h2>Heartstrings</h2><p>The editor hasn’t read the stories for their most moving moments yet.</p>
      ${P.building ? progress() : `<button type="button" class="pg-gold" data-act="pg-build">Find the heart in every story</button>`}</section>`;
    const counts = {}; list.forEach((m) => { counts[m.feeling] = (counts[m.feeling] || 0) + 1; });
    let shown = inVol(list); if (P.feel !== 'all') shown = shown.filter((m) => m.feeling === P.feel);
    shown = [...shown].sort((a, b) => b.intensity - a.intensity);
    return `<div class="pg-heart">
      <header class="pg-heart-h"><p class="pg-kick">Heartstrings</p><h2 class="pg-h2">The moments that land</h2>
        <p class="pg-hint">Where the caper falls quiet and something real gets through. Strongest first.</p></header>
      ${P.canon?.heart?.length ? `<article class="pg-essay pg-heart-essay">${P.canon.heart.map((x) => `<p>${esc(x)}</p>`).join('')}</article>` : ''}
      <div class="pg-chips"><button type="button" class="${P.feel === 'all' ? 'on' : ''}" data-act="pg-feel" data-v="all">Every feeling <small>${list.length}</small></button>
        ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<button type="button" class="${P.feel === k ? 'on' : ''}" data-act="pg-feel" data-v="${k}">${FEEL_LABEL[k] || k} <small>${n}</small></button>`).join('')}</div>
      ${volChips()}
      <div class="pg-moments">${shown.map((m) => moment(m)).join('') || '<p class="pg-hint">Nothing here for this choice yet.</p>'}</div></div>`;
  }
  const stat = (n, l) => `<div class="pg-stat"><b data-count>${n}</b><span>${l}</span></div>`;
  function reviewDeck() {
    const revs = all('reviews'); if (!revs.length) return '';
    const r = revs[P.review % revs.length];
    return `<section class="pg-panel pg-review">
      <h2>The reviews are in</h2><p class="pg-hint">Imagined readers, written to show how your stories land.</p>
      <div class="pg-stars" aria-label="${r.stars} stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</div>
      <blockquote>${esc(r.text)}</blockquote><p class="pg-src">— ${esc(r.persona)}, on <b>${esc(r.story)}</b></p>
      <div class="pg-row"><button type="button" class="pg-ghost" data-act="pg-rev" data-n="-1" aria-label="Previous review">‹</button>
      <span class="pg-count">${(P.review % revs.length) + 1} of ${revs.length}</span>
      <button type="button" class="pg-ghost" data-act="pg-rev" data-n="1" aria-label="Next review">›</button></div></section>`;
  }
  function passport() {
    const places = [...new Set(P.stories.flatMap((s) => s.places || []))].slice(0, 60);
    const chars = P.stories.flatMap((s) => (s.characters || []).map((c) => ({ ...c, story: s.story }))).filter((c) => !/^basil/i.test(c.name));
    const cast = [...new Map(chars.map((c) => [c.name, c])).values()].sort(() => Math.random() - 0.5).slice(0, 8);
    return `<section class="pg-panel"><h2>Basil’s passport</h2><p class="pg-hint">Everywhere the canon has taken him.</p>
      <div class="pg-stamps">${places.map((p, i) => `<span class="pg-stamp" style="--r:${(i * 37) % 11 - 5}deg">${esc(p)}</span>`).join('')}</div></section>
      ${cast.length ? `<section class="pg-panel"><h2>Supporting cast</h2><p class="pg-hint">A handful of the characters you’ve conjured. Shuffles every visit.</p>
      <div class="pg-cast">${cast.map((c) => `<div><b>${esc(c.name)}</b><span>${esc(c.note)}</span><em>${esc(c.story)}</em></div>`).join('')}</div></section>` : ''}`;
  }

  // ----- Hall of Lines -----
  function viewLines() {
    const sets = { funniest: ['Funniest', all('funniest')], finest: ['Finest', all('finest')], basil: ['Pure Basil', all('basilisms')], epigraphs: ['Epigraphs', all('epigraphs')] };
    const [, list] = sets[P.hall];
    const shown = inVol(list);
    return `<div class="pg-chips">${Object.entries(sets).map(([k, [l, a]]) => `<button type="button" class="${P.hall === k ? 'on' : ''}" data-act="pg-hall" data-v="${k}">${l} <small>${a.length}</small></button>`).join('')}</div>
      ${volChips()}
      <div class="pg-wall">${shown.map((x, i) => `<figure class="pg-card" style="--d:${(i % 12) * 40}ms">
        <blockquote>${P.hall === 'epigraphs' ? '“' : ''}${esc(x.quote)}${P.hall === 'epigraphs' ? '”' : ''}</blockquote>
        <figcaption>${x.by ? `— ${esc(x.by)}<br>` : ''}${x.kind ? `<span class="pg-kind">${KIND_LABEL[x.kind] || x.kind}</span> ` : ''}${esc(x.story)} · Vol. ${x.vol}${x.why ? `<em>${esc(x.why)}</em>` : ''}</figcaption>
        ${tools(x, P.hall === 'basil' ? 'basilisms' : P.hall)}</figure>`).join('') || '<p class="pg-hint">Nothing here for this volume yet.</p>'}</div>`;
  }
  const volChips = () => `<div class="pg-chips small">${[0, 1, 2, 3, 4, 5].map((v) => `<button type="button" class="${P.vol === v ? 'on' : ''}" data-act="pg-vol" data-v="${v}">${v ? `Vol. ${v}` : 'All volumes'}</button>`).join('')}</div>`;

  // ----- Awards -----
  function viewAwards() {
    const canon = P.canon?.awards || [];
    const perStory = P.stories.map((s) => ({ category: s.award, story: s.story, why: s.logline }));
    const top = (k) => [...P.stories].sort((a, b) => (b.scores?.[k] || 0) - (a.scores?.[k] || 0))[0];
    const data = [
      ...canon.map((a) => ({ ...a, big: true })),
      ...Object.keys(SCORE_LABEL).map((k) => { const s = top(k); return s && { category: `Highest marks for ${SCORE_LABEL[k].toLowerCase()}`, story: s.story, why: `${s.scores[k]}/10 from the editor`, big: false }; }).filter(Boolean),
    ];
    return `<p class="pg-intro">The Ruffletum Awards. Tap an envelope to reveal the winner.</p>
      <div class="pg-awards">${data.map((a, i) => {
        const open = P.award.has(i);
        return `<button type="button" class="pg-env${open ? ' open' : ''}${a.big ? ' big' : ''}" data-act="pg-award" data-i="${i}" aria-expanded="${open}">
          <span class="pg-cat">${esc(a.category)}</span>
          ${open ? `<span class="pg-win">${esc(a.story)}</span><span class="pg-cite">${esc(a.why || '')}</span>` : '<span class="pg-seal">✦ And the winner is…</span>'}</button>`;
      }).join('')}</div>
      <h2 class="pg-h2">Every case’s own trophy</h2>
      <div class="pg-trophies">${perStory.map((a) => `<div><b>${esc(a.category)}</b><span>${esc(a.story)}</span></div>`).join('')}</div>`;
  }

  // ----- The Cases -----
  function viewStories() {
    let list = inVol(P.stories.map((s) => ({ ...s, vol: s.volNum })));
    if (P.sort !== 'order') list = [...list].sort((a, b) => (P.sort === 'avg' ? avg(b) - avg(a) : (b.scores?.[P.sort] || 0) - (a.scores?.[P.sort] || 0)));
    return `${volChips()}
      <label class="pg-sort">Rank by <select data-pg="sort"><option value="order"${P.sort === 'order' ? ' selected' : ''}>Running order</option><option value="avg"${P.sort === 'avg' ? ' selected' : ''}>Overall</option>${Object.entries(SCORE_LABEL).map(([k, l]) => `<option value="${k}"${P.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="pg-cases">${list.map((s) => {
        const open = P.expanded === s.itemId;
        return `<article class="pg-case${open ? ' open' : ''}">
          <button type="button" class="pg-case-h" data-act="pg-case" data-id="${s.itemId}" aria-expanded="${open}">
            <span class="pg-case-n">Vol. ${s.volNum} · No. ${s.num}</span><b>${esc(s.story)}</b><span class="pg-ribbon">${esc(s.award)}</span>
            <span class="pg-logline">${esc(s.logline)}</span>
            <span class="pg-meters">${Object.entries(SCORE_LABEL).map(([k, l]) => `<span><i style="--v:${(s.scores?.[k] || 0) * 10}%"></i><small>${l} ${s.scores?.[k] ?? '–'}</small></span>`).join('')}</span></button>
          ${open ? `<div class="pg-case-b">
            <p class="pg-meta">${fmt(s.words)} words · ${s.chapters} chapters${s.places?.length ? ` · ${esc(s.places.slice(0, 4).join(', '))}` : ''}</p>
            <h3>Show-stopper: ${esc(s.set_piece?.title || '')}</h3><p>${esc(s.set_piece?.description || '')}</p>
            ${s.heart_note ? `<h3>Where its heart is</h3><p>${esc(s.heart_note)}</p>` : ''}
            ${s.moving?.[0] ? `<blockquote class="pg-case-heart">${esc(s.moving[0].passage)}</blockquote>` : ''}
            ${s.strengths?.length ? `<h3>Why it works</h3><ul>${s.strengths.map((x) => `<li><b>${esc(x.title)}.</b> ${esc(x.detail)}</li>`).join('')}</ul>` : ''}
            ${s.funniest?.length ? `<h3>Laugh lines</h3>${s.funniest.slice(0, 4).map((f) => `<blockquote>${esc(f.quote)}</blockquote>`).join('')}` : ''}
            ${s.characters?.length ? `<h3>Cast</h3><p>${s.characters.map((c) => `<b>${esc(c.name)}</b>: ${esc(c.note)}`).join(' · ')}</p>` : ''}
            ${s.reviews?.length ? `<h3>Imagined reviews</h3>${s.reviews.map((r) => `<p class="pg-mini-rev"><span class="pg-stars">${'★'.repeat(r.stars)}</span> ${esc(r.text)} <em>— ${esc(r.persona)}</em></p>`).join('')}` : ''}
            <button type="button" class="pg-gold small" data-act="pg-read" data-id="${s.itemId}">Read ${esc(s.story)}</button></div>` : ''}
        </article>`;
      }).join('')}</div>`;
  }

  // ----- The Critic -----
  function viewCritic() {
    const c = P.canon;
    if (!c) return `<section class="pg-panel"><p>The critic hasn’t filed yet.</p><button type="button" class="pg-gold" data-act="pg-recanon">Commission the review</button></section>`;
    return `<article class="pg-essay">
      <p class="pg-kick">The definitive appraisal</p><h2 class="pg-h2">On the Brief Cases</h2>
      ${(c.essay || []).map((p, i) => `<p${i === 0 ? ' class="pg-drop"' : ''}>${esc(p)}</p>`).join('')}</article>
      ${c.signature_moves?.length ? `<section class="pg-panel"><h2>Signature moves</h2><div class="pg-moves">${c.signature_moves.map((m) => `<div><b>${esc(m.name)}</b><span>${esc(m.description)}</span></div>`).join('')}</div></section>` : ''}
      ${c.evolution ? `<section class="pg-panel"><h2>How the canon grew</h2><p>${esc(c.evolution)}</p></section>` : ''}
      ${c.lineage ? `<section class="pg-panel"><h2>In good company</h2><p>${esc(c.lineage)}</p></section>` : ''}`;
  }

  // ---------- flourishes ----------
  function confetti(n = 40) {
    const host = document.querySelector('.pg'); if (!host || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div'); box.className = 'pg-confetti';
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      s.style.cssText = `left:${Math.random() * 100}%;--dx:${(Math.random() - 0.5) * 160}px;--rot:${Math.random() * 720}deg;--t:${1.6 + Math.random() * 1.4}s;--del:${Math.random() * 0.3}s;background:${pick(['#F6E7B0', '#D4AF37', '#FFF8E7', '#C9A227', '#E8C88C', '#B31942'])}`;
      box.appendChild(s);
    }
    host.appendChild(box); setTimeout(() => box.remove(), 3400);
  }
  function countUp() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('.pg-stat b[data-count]').forEach((el) => {
      const target = Number(el.textContent.replace(/,/g, '')); if (!target) return;
      const t0 = performance.now(); const dur = 1400;
      const step = (now) => { const k = Math.min(1, (now - t0) / dur); el.textContent = fmt(target * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
  const redraw = () => { if (P.open) render(); };
  let pepTimer = null;

  // ---------- events ----------
  function onClick(act, el) {
    switch (act) {
      case 'pg-open': P.open = true; P.tab = 'show'; P.lever = null; P.epi = null; P.moment = null; P.mirror = null; P.mood = null; P.moodItem = null; P.review = Math.floor(Math.random() * 50);
        document.body.classList.add('rit-open'); if (!P.stories) load(); render(); setTimeout(() => { countUp(); confetti(30); }, 60); return true;
      case 'pg-close': P.open = false; P.pep = null; P.card = null; document.body.classList.remove('rit-open'); render(); return true;
      case 'pg-tab': { P.tab = el.dataset.v; render(); const pg = document.querySelector('.pg'); const mq = document.querySelector('.pg-marquee'); if (pg && mq && pg.scrollTop > mq.offsetHeight) pg.scrollTop = mq.offsetHeight + 40; } if (P.tab === 'show') setTimeout(countUp, 30); return true;
      case 'pg-lever': {
        P.spin = true; render();
        setTimeout(() => { P.lever = pick(all('funniest')); P.spin = false; render(); if (Math.random() < 0.25) confetti(25); }, 650);
        return true;
      }
      case 'pg-moment': { const a = all('moving'); const st = a.filter((m) => m.intensity >= 4); P.moment = pick(st.length > 1 ? st : a); render(); return true; }
      case 'pg-feel': P.feel = el.dataset.v; render(); return true;
      case 'pg-epi': P.epi = pick(all('epigraphs')); render(); return true;
      case 'pg-rev': P.review = (P.review + Number(el.dataset.n) + 1000) % 1000; render(); return true;
      case 'pg-hall': P.hall = el.dataset.v; render(); return true;
      case 'pg-vol': P.vol = Number(el.dataset.v); render(); return true;
      case 'pg-award': { const i = Number(el.dataset.i); if (!P.award.has(i)) { P.award.add(i); render(); confetti(35); } else { P.award.delete(i); render(); } return true; }
      case 'pg-case': P.expanded = P.expanded === el.dataset.id ? null : el.dataset.id; render(); return true;
      case 'pg-read': { const x = el.dataset.k ? (P.reg[el.dataset.k] || P.favs.get(el.dataset.k)?.data) : null;
        P.open = false; document.body.classList.remove('rit-open'); openStory(x ? x.itemId : el.dataset.id, x ? textOf(x) : null); return true; }
      case 'pg-back': P.open = true; document.body.classList.add('rit-open'); if (!P.stories) load(); render(); return true;
      case 'pg-today-read': if (P.daily) openStory(P.daily.itemId, P.daily.quote); return true;
      case 'pg-fav': toggleFav(el.dataset.k); return true;
      case 'pg-card': { const x = P.reg[el.dataset.k] || P.favs.get(el.dataset.k)?.data; if (!x) return true;
        P.card = { x }; render(); makeCard(x).then((blob) => { if (!P.card) return; P.card.blob = blob; P.card.url = URL.createObjectURL(blob); render(); }); return true; }
      case 'pg-card-close': if (P.card?.url) URL.revokeObjectURL(P.card.url); P.card = null; render(); return true;
      case 'pg-card-save': { const a = document.createElement('a'); a.href = P.card.url; a.download = `basil-${Date.now()}.png`; document.body.appendChild(a); a.click(); a.remove(); return true; }
      case 'pg-card-share': { const f = new File([P.card.blob], 'basil.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [f] })) navigator.share({ files: [f] }).catch(() => {}); else onClick('pg-card-save'); return true; }
      case 'pg-mood': { const pool = moodPool(el.dataset.v); P.mood = el.dataset.v; let x = pick(pool);
        if (pool.length > 1) while (x && P.moodItem && textOf(x) === textOf(P.moodItem)) x = pick(pool);
        P.moodItem = x || null; render(); return true; }
      case 'pg-mirror': { const prev = new Set(P.mirror || []); const fresh = shuffle((P.canon?.pep_talks || []).filter((t) => !prev.has(t)));
        P.mirror = (fresh.length >= 3 ? fresh : shuffle(P.canon?.pep_talks || [])).slice(0, 3); render(); return true; }
      case 'pg-char': { const i = Number(el.dataset.i); P.castOpen = P.castOpen === i ? null : i; render(); return true; }
      case 'pg-extras': refreshExtras(); return true;
      case 'pg-tl': P.tlAll = !P.tlAll; render(); return true;
      case 'pg-build': build(); return true;
      case 'pg-recanon': refreshCanon(); return true;
      case 'pg-hype': {
        const pool = [...(P.canon?.pep_talks || []), ...all('basilisms').map((b) => `Remember writing this? ${/^[“"]/.test(b.quote) ? b.quote : `“${b.quote}”`} That’s you.`)];
        if (!pool.length) return true;
        P.pep = pick(pool); render(); confetti(45);
        clearTimeout(pepTimer); pepTimer = setTimeout(() => { P.pep = null; redraw(); }, 7000);
        return true;
      }
      default: return false;
    }
  }
  function onChange(el) {
    if (el.dataset.pg === 'sort') { P.sort = el.value; render(); return true; }
    return false;
  }
  function entry() {
    return `<button type="button" class="pg-entry" data-act="pg-open">
      <span class="pg-entry-bulbs" aria-hidden="true">${'<i></i>'.repeat(9)}</span>
      <span class="pg-entry-t">Visit the Playground</span><span class="pg-entry-s">Starring Basil Ruffletum ✦</span></button>`;
  }
  return { entry, overlay, onClick, onChange, afterRender, todayLine, isOpen: () => P.open };
}
