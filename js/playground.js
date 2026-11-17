// Life Plan — the Playground: a glittering, Basil-first celebration of the canon.
// Everything quoted here is his own text (checked word for word on the server); reviews and blurbs
// are clearly labelled as imagined. Data lives in the `playground` table, built by the playground function.

const WPM = 250;
const BENCH = [ // well-known word counts, for fun comparisons (approximate)
  [587000, 'War and Peace'], [455000, 'The Lord of the Rings'], [365000, 'Moby-Dick'], [185000, 'Great Expectations'],
];
const SCORE_LABEL = { wit: 'Wit', invention: 'Invention', pace: 'Pace', set_pieces: 'Set pieces', atmosphere: 'Atmosphere', heart: 'Heart' };
const KIND_LABEL = { wit: 'Wit', atmosphere: 'Atmosphere', wisdom: 'Wisdom', menace: 'Menace', tenderness: 'Tenderness', action: 'Action' };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmt = (n) => Math.round(n).toLocaleString('en-GB');

export function createPlayground({ sb, esc, render, openStory }) {
  const P = { open: false, stories: null, canon: null, loading: false, tab: 'show', hall: 'funniest', vol: 0, sort: 'order',
    lever: null, quote: null, award: new Set(), expanded: null, building: null, pep: null, review: 0, err: '' };

  // ---------- data ----------
  async function load() {
    if (P.loading) return; P.loading = true; P.err = '';
    try {
      const { data, error } = await sb.from('playground').select('kind,item_id,data,created_at');
      if (error) throw error;
      P.stories = (data || []).filter((r) => r.kind === 'story').map((r) => ({ ...r.data, itemId: r.item_id }))
        .sort((a, b) => a.volNum - b.volNum || a.num - b.num);
      P.canon = (data || []).find((r) => r.kind === 'canon')?.data || null;
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
    P.missing = (items || []).filter((i) => i.kind === 'text' && basil.has(i.shelf_id) && !tops.has(i.shelf_id) && !have.has(i.id)).map((i) => i.id);
  }
  async function build() {
    if (P.building) return;
    const todo = [...P.missing]; const total = todo.length;
    P.building = { done: 0, total, phase: 'stories' }; redraw();
    const worker = async () => {
      while (todo.length) {
        const id = todo.shift();
        try { await sb.functions.invoke('playground', { body: { action: 'story', itemId: id } }); } catch (e) { console.error(e); }
        P.building.done++; redraw();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    P.building.phase = 'canon'; redraw();
    try { await sb.functions.invoke('playground', { body: { action: 'canon' } }); } catch (e) { console.error(e); }
    P.building = null; P.loading = false; P.stories = null; await load(); confetti(60);
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
  const TABS = [['show', 'The Show'], ['lines', 'Hall of Lines'], ['awards', 'Awards'], ['stories', 'The Cases'], ['critic', 'The Critic']];
  function overlay() {
    if (!P.open) return '';
    let body;
    if (!P.stories) body = `<div class="pg-wait"><span class="pg-bulb-spin"></span><p>Raising the curtain…</p></div>`;
    else if (!P.stories.length) body = emptyStage();
    else {
      body = `${marquee()}
        <nav class="pg-tabs" role="tablist">${TABS.map(([id, l]) => `<button type="button" role="tab" class="${P.tab === id ? 'on' : ''}" aria-selected="${P.tab === id}" data-act="pg-tab" data-v="${id}">${l}</button>`).join('')}</nav>
        ${P.tab === 'show' ? viewShow() : P.tab === 'lines' ? viewLines() : P.tab === 'awards' ? viewAwards() : P.tab === 'stories' ? viewStories() : viewCritic()}
        ${buildBar()}`;
    }
    return `<div class="pg" role="dialog" aria-modal="true" aria-label="The Playground">
      <button type="button" class="pg-x" data-act="pg-close" aria-label="Close">×</button>
      <button type="button" class="pg-hype" data-act="pg-hype" aria-label="Hype me up">✦ Hype me up</button>
      ${P.pep ? `<div class="pg-pep" role="status"><span>✦</span><p>${esc(P.pep)}</p></div>` : ''}
      <div class="pg-inner">${body}</div></div>`;
  }
  function emptyStage() {
    const n = P.missing?.length || 0;
    return `<div class="pg-empty">${bulbs(18)}<h1 class="pg-title">The Playground</h1><p class="pg-sub">Starring Basil Ruffletum</p>
      ${P.building ? progress() : `<p>${n ? `Your ${n} Basil stories are waiting in the wings. Lighting up the Playground reads every one of them in full and gathers your funniest lines, finest moments and greatest set pieces. It takes a few minutes.` : 'Add your Basil stories to the Basil shelf in your library, then come back to light up the Playground.'}</p>
      ${n ? `<button type="button" class="pg-gold" data-act="pg-build">Light up the Playground</button>` : ''}`}${P.err ? `<p class="pg-err">${esc(P.err)}</p>` : ''}</div>`;
  }
  function progress() {
    const b = P.building; const pct = b.phase === 'canon' ? 100 : Math.round((b.done / Math.max(1, b.total)) * 100);
    return `<div class="pg-progress"><p>${b.phase === 'canon' ? 'The critic is writing up the whole canon…' : `Reading story ${Math.min(b.done + 1, b.total)} of ${b.total}…`}</p>
      <div class="pg-bar"><span style="width:${pct}%"></span></div></div>`;
  }
  function buildBar() {
    if (P.building) return `<section class="pg-panel">${progress()}</section>`;
    const n = P.missing?.length || 0;
    return `<footer class="pg-foot">${n ? `<button type="button" class="pg-ghost" data-act="pg-build">Read ${n} new stor${n === 1 ? 'y' : 'ies'} into the Playground</button>` : ''}
      <button type="button" class="pg-ghost" data-act="pg-recanon">Ask the critic for a fresh take</button>
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

      <section class="pg-panel pg-slot">
        <h2>Pull the lever</h2>
        <p class="pg-hint">A random line from somewhere in the canon. Every one a winner.</p>
        <div class="pg-reel${P.spin ? ' spin' : ''}"><blockquote>${esc(q.quote)}</blockquote>
          <p class="pg-src">${esc(q.story)} · Vol. ${q.vol}</p>${q.why ? `<p class="pg-why">${esc(q.why)}</p>` : ''}</div>
        <div class="pg-row"><button type="button" class="pg-gold" data-act="pg-lever">Pull again ✦</button><button type="button" class="pg-ghost" data-act="pg-read" data-id="${q.itemId}">Open the story</button></div>
      </section>

      ${epi ? `<section class="pg-panel pg-epi">
        <h2>From Basil’s Book of Quotations</h2>
        <blockquote>“${esc(epi.quote)}”</blockquote><p class="pg-src">— ${esc(epi.by)}</p>
        <p class="pg-hint">${esc(epi.story)}, ${esc(epi.chapter || '')}. One of ${ep.length} chapter epigraphs.</p>
        <button type="button" class="pg-ghost" data-act="pg-epi">Another ✦</button></section>` : ''}

      ${P.canon?.pep_talks?.length ? `<section class="pg-panel pg-dressing">
        <h2>Dressing-room mirror</h2>${P.canon.pep_talks.slice(0, 3).map((x) => `<p class="pg-mirror">${esc(x)}</p>`).join('')}
        <p class="pg-hint">Tap “Hype me up” any time for more.</p></section>` : ''}

      ${reviewDeck()}
      ${passport()}`;
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
        <button type="button" class="pg-link" data-act="pg-read" data-id="${x.itemId}">Read it ›</button></figure>`).join('') || '<p class="pg-hint">Nothing here for this volume yet.</p>'}</div>`;
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
      case 'pg-open': P.open = true; P.tab = 'show'; P.lever = null; P.epi = null; P.review = Math.floor(Math.random() * 50);
        document.body.classList.add('rit-open'); if (!P.stories) load(); render(); setTimeout(() => { countUp(); confetti(30); }, 60); return true;
      case 'pg-close': P.open = false; P.pep = null; document.body.classList.remove('rit-open'); render(); return true;
      case 'pg-tab': { P.tab = el.dataset.v; render(); const pg = document.querySelector('.pg'); const mq = document.querySelector('.pg-marquee'); if (pg && mq && pg.scrollTop > mq.offsetHeight) pg.scrollTop = mq.offsetHeight + 40; } if (P.tab === 'show') setTimeout(countUp, 30); return true;
      case 'pg-lever': {
        P.spin = true; render();
        setTimeout(() => { P.lever = pick(all('funniest')); P.spin = false; render(); if (Math.random() < 0.25) confetti(25); }, 650);
        return true;
      }
      case 'pg-epi': P.epi = pick(all('epigraphs')); render(); return true;
      case 'pg-rev': P.review = (P.review + Number(el.dataset.n) + 1000) % 1000; render(); return true;
      case 'pg-hall': P.hall = el.dataset.v; render(); return true;
      case 'pg-vol': P.vol = Number(el.dataset.v); render(); return true;
      case 'pg-award': { const i = Number(el.dataset.i); if (!P.award.has(i)) { P.award.add(i); render(); confetti(35); } else { P.award.delete(i); render(); } return true; }
      case 'pg-case': P.expanded = P.expanded === el.dataset.id ? null : el.dataset.id; render(); return true;
      case 'pg-read': P.open = false; document.body.classList.remove('rit-open'); openStory(el.dataset.id); return true;
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
  return { entry, overlay, onClick, onChange, isOpen: () => P.open };
}
