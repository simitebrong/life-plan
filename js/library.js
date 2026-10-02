// Life Plan — Library: shelves, items (Word/PDF/text/link/note), the reader, and reading notes.

const MAMMOTH_URL = 'https://cdn.jsdelivr.net/npm/mammoth@1.11.0/mammoth.browser.min.js';
const BASIL_SECS = 300; // 5 minutes of reading ticks "Read" on Basil

// ---------- tiny IndexedDB cache for manuscript text (works offline) ----------
const mem = new Map();
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('life-plan', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('content');
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async get(k) {
    if (mem.has(k)) return mem.get(k);
    try {
      const db = await this.open();
      return await new Promise((res) => { const q = db.transaction('content').objectStore('content').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); });
    } catch { return undefined; }
  },
  async set(k, v) {
    mem.set(k, v);
    try { const db = await this.open(); db.transaction('content', 'readwrite').objectStore('content').put(v, k); } catch { /* memory only */ }
  },
  async del(k) {
    mem.delete(k);
    try { const db = await this.open(); db.transaction('content', 'readwrite').objectStore('content').delete(k); } catch { /* ignore */ }
  },
};

// ---------- Word / text conversion ----------
const CHAPTER_RE = /^\s*(chapter|part|book)\s+([a-z-]+|\d+|[ivxlc]+)\b[\s:.\-–—]*(.{0,60})$/i;
const NAMED_RE = /^\s*(prologue|epilogue|introduction|foreword|afterword|preface|interlude|acknowledgements?)\s*$/i;
const SCENE_RE = /^\s*([*#~\-–—•·]\s*){1,7}$/;

const escText = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function inlineHTML(node) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) out += escText(n.nodeValue);
    else if (n.nodeType === 1) {
      const tag = n.tagName;
      const inner = inlineHTML(n);
      if (tag === 'EM' || tag === 'I') out += inner.trim() ? `<em>${inner}</em>` : inner;
      else if (tag === 'STRONG' || tag === 'B') out += inner.trim() ? `<strong>${inner}</strong>` : inner;
      else if (tag === 'BR') out += '<br>';
      else out += inner;
    }
  }
  return out;
}
const titleCase = (s) => s.replace(/\s+/g, ' ').trim();
const stripTags = (h) => h.replace(/<[^>]+>/g, '');

// blocks: [{text, html, heading}] -> {chapters:[{title, paras:[html]}]}
export function buildChapters(blocks, fallbackTitle = 'Opening') {
  const chapters = [];
  let cur = null;
  const start = (title) => { cur = { title, paras: [] }; chapters.push(cur); };
  for (const b of blocks) {
    const text = (b.text || '').replace(/ /g, ' ').trim();
    if (!text) continue;
    const isChapter = text.length <= 80 && (CHAPTER_RE.test(text) || NAMED_RE.test(text));
    if (isChapter || (b.heading && text.length <= 80)) { start(titleCase(text)); continue; }
    if (!cur) start(fallbackTitle);
    cur.paras.push(SCENE_RE.test(text) ? '<span class="scene">* * *</span>' : b.html);
  }
  let out = chapters.filter((c) => c.paras.length || chapters.length === 1);
  // A short run of lines before the first chapter is the title page
  if (out.length > 1 && out[0].title === fallbackTitle && out[0].paras.reduce((n, p) => n + stripTags(p).length, 0) < 400) out[0].title = 'Title page';
  // No chapter markers at all in a long text: split into readable sections
  if (out.length === 1 && out[0].paras.length > 200) {
    const all = out[0].paras; out = [];
    for (let i = 0; i < all.length; i += 120) out.push({ title: `Section ${out.length + 1}`, paras: all.slice(i, i + 120) });
  }
  return { chapters: out };
}


export const contentChars = (content) => (content?.chapters || []).reduce((s, c) => s + c.paras.reduce((t, p) => t + stripTags(p).length, 0), 0);

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.mammoth) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the Word converter'));
    document.head.appendChild(s);
  });
}

async function convertDocx(file) {
  await loadScript(MAMMOTH_URL);
  const { value: html } = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { ignoreEmptyParagraphs: true });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = [];
  const walk = (el) => {
    for (const n of el.children) {
      const tag = n.tagName;
      if (/^H[1-6]$/.test(tag)) blocks.push({ text: n.textContent, html: inlineHTML(n), heading: true });
      else if (tag === 'P' || tag === 'LI') blocks.push({ text: n.textContent, html: inlineHTML(n) });
      else walk(n);
    }
  };
  walk(doc.body);
  return buildChapters(blocks);
}

async function convertText(file) {
  const raw = await file.text();
  const blocks = raw.split(/\r?\n\s*\r?\n|\r?\n/).map((t) => ({ text: t, html: escText(t.trim()) }));
  return buildChapters(blocks);
}

// ---------- module ----------
export function createLibrary(api) {
  const { S, sb, store, esc, todayIso } = api;
  const render = () => api.render();
  const L = S.lib = {
    shelves: [], items: [], notes: [],
    shelf: null, item: null, reading: false, chapter: 0, content: null,
    panel: null, sel: null, noteEdit: null, adding: null, confirm: null, msg: '', busy: false, signed: null,
    newShelf: false, pendingScroll: null,
    ...store.get('lp-lib', {}),
  };
  Object.assign(L, { shelf: null, item: null, reading: false, content: null, panel: null, sel: null, noteEdit: null, adding: null, confirm: null, msg: '', busy: false, signed: null, newShelf: false, pendingScroll: null });
  const prefs = { size: 19, theme: 'auto', font: 'serif', ...store.get('lp-reader', {}) };

  const persist = () => store.set('lp-lib', { shelves: L.shelves, items: L.items, notes: L.notes });
  const uid = () => crypto.randomUUID();
  const shelfById = (id) => L.shelves.find((s) => s.id === id);
  const itemById = (id) => L.items.find((i) => i.id === id);
  const sortedShelves = () => [...L.shelves].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const itemsOn = (shelfId) => L.items.filter((i) => i.shelf_id === shelfId).sort((a, b) => a.title.localeCompare(b.title));
  const notesFor = (itemId) => L.notes.filter((n) => n.item_id === itemId);
  const ITEM_COLS = 'id,shelf_id,goal_id,title,kind,url,file_path,chars,progress,last_read_at,created_at';
  const KIND = { text: 'Manuscript', pdf: 'PDF', link: 'Link', note: 'Note' };
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const quoted = (q) => (/^[“"‘']/.test(q) ? esc(q) : `“${esc(q)}”`);

  let loading = null;
  const load = () => (loading ||= doLoad().finally(() => { loading = null; }));
  async function doLoad() {
    const [{ data: shelves }, { data: items }, { data: notes }] = await Promise.all([
      sb.from('shelves').select('*'),
      sb.from('library_items').select(ITEM_COLS),
      sb.from('reading_notes').select('*'),
    ]);
    if (shelves) {
      L.shelves = shelves;
      if (!shelves.length) {
        const { data: made } = await sb.from('shelves').insert([
          { name: 'Basil', position: 0, is_basil: true },
          { name: 'Other drafts', position: 1, is_basil: false },
          { name: 'Goal guides', position: 2, is_basil: false },
        ]).select('*');
        if (made) L.shelves = made;
      }
    }
    if (items) {
      // keep whichever reading position is newer (phone may be ahead of the server)
      L.items = items.map((it) => {
        const local = itemById(it.id);
        if (local?.progress?.ts && (!it.progress?.ts || local.progress.ts > it.progress.ts)) return { ...it, progress: local.progress, last_read_at: local.last_read_at };
        return it;
      });
    }
    if (notes) {
      const pending = L.notes.filter((n) => n._pending);
      L.notes = [...notes.filter((n) => !pending.find((p) => p.id === n.id)), ...pending];
      flushNotes();
    }
    persist();
  }

  async function flushNotes() {
    for (const n of L.notes.filter((x) => x._pending)) {
      const { _pending, ...row } = n;
      const { error } = await sb.from('reading_notes').upsert(row);
      if (!error) delete n._pending;
    }
    const dels = store.get('lp-note-dels', []);
    if (dels.length) { const { error } = await sb.from('reading_notes').delete().in('id', dels); if (!error) store.set('lp-note-dels', []); }
    persist();
  }
  window.addEventListener('online', flushNotes);

  async function getContent(item) {
    let c = await idb.get(item.id);
    if (!c) {
      const { data } = await sb.from('library_items').select('content').eq('id', item.id).single();
      c = data?.content || null;
      if (c) idb.set(item.id, c);
    }
    return c;
  }

  // ---------- progress ----------
  function pctAt(content, c, p) {
    let before = 0; let total = 0;
    content.chapters.forEach((ch, ci) => ch.paras.forEach((para, pi) => {
      const n = stripTags(para).length; total += n;
      if (ci < c || (ci === c && pi < p)) before += n;
    }));
    return total ? Math.min(100, Math.round((before / total) * 100)) : 0;
  }
  let progTimer = null;
  function saveProgress(item, c, p, finished = false) {
    const pct = finished ? 100 : pctAt(L.content, c, p);
    item.progress = { c, p, pct, ts: Date.now() };
    item.last_read_at = new Date().toISOString();
    persist();
    clearTimeout(progTimer);
    progTimer = setTimeout(() => { sb.from('library_items').update({ progress: item.progress, last_read_at: item.last_read_at }).eq('id', item.id).then(() => {}); }, 1500);
  }

  let scrollTick = 0;
  window.addEventListener('scroll', () => {
    if (!L.reading || !L.content) return;
    const now = Date.now(); if (now - scrollTick < 400) return; scrollTick = now;
    const el = document.elementFromPoint(window.innerWidth / 2, 130)?.closest?.('[data-p]');
    if (el) saveProgress(itemById(L.item), L.chapter, Number(el.dataset.p));
  }, { passive: true });

  // ---------- reading timer (ticks "Read" on Basil after 5 minutes) ----------
  let secs = 0;
  let lastActive = Date.now();
  const active = () => { lastActive = Date.now(); };
  const lastActiveReset = active;
  ['scroll', 'touchstart', 'pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, active, { passive: true }));
  setInterval(() => {
    if (!L.reading || document.visibilityState !== 'visible') return;
    if (Date.now() - lastActive > 120000) return; // no scrolling or taps for 2 minutes: not counted as reading
    secs += 1;
    if (secs < 15) return;
    const add = secs; secs = 0;
    const day = todayIso();
    const d = api.entryFor(day);
    d.readSecs = (d.readSecs || 0) + add;
    const item = itemById(L.item);
    if (item && shelfById(item.shelf_id)?.is_basil) {
      const before = d.basilReadSecs || 0;
      d.basilReadSecs = before + add;
      const has = Array.isArray(d.basil) && d.basil.includes('read');
      if (d.basilReadSecs >= BASIL_SECS && !has) {
        d.basil = [...(Array.isArray(d.basil) ? d.basil : []).filter((x) => x !== 'none'), 'read'];
        toast('Five minutes with Basil. “Read” is ticked for today.');
      }
    }
    api.queueSave(day);
  }, 1000);

  let toastTimer = null;
  function toast(msg) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
  }

  // ---------- open / navigate ----------
  async function openReader(itemId, opts = {}) {
    const item = itemById(itemId); if (!item) return;
    S.view = 'library'; L.item = itemId; L.shelf = item.shelf_id; L.busy = true; L.msg = ''; render();
    const content = await getContent(item);
    L.busy = false;
    if (!content) { L.msg = 'This needs a connection the first time you open it. Try again when you have signal.'; render(); return; }
    L.content = content; L.reading = true; L.panel = null; L.sel = null; lastActiveReset();
    const pr = item.progress || { c: 0, p: 0 };
    L.chapter = Math.min(opts.c ?? pr.c ?? 0, content.chapters.length - 1);
    L.pendingScroll = opts.p ?? (opts.c == null ? pr.p : 0) ?? 0;
    if (opts.p != null) L.sel = opts.p;
    render();
  }
  function afterRender() {
    if (L.reading && L.pendingScroll != null) {
      const p = L.pendingScroll; L.pendingScroll = null;
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-p="${p}"]`);
        if (el && p > 0) el.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
      });
    }
  }
  function gotoChapter(c) {
    const item = itemById(L.item);
    L.chapter = Math.max(0, Math.min(c, L.content.chapters.length - 1));
    L.sel = null; L.panel = null; L.pendingScroll = 0;
    saveProgress(item, L.chapter, 0);
    render();
  }

  // ---------- upload ----------
  async function handleFile(file, shelfId) {
    const name = file.name || 'Untitled';
    const ext = name.split('.').pop().toLowerCase();
    const title = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'Untitled';
    L.busy = true; L.adding = null; L.msg = ext === 'pdf' ? 'Uploading…' : 'Converting…'; render();
    try {
      if (ext === 'doc') throw new Error('That is an older Word format. Open it in Word, choose Save As → Word Document (.docx), then add it again.');
      let row;
      if (ext === 'docx' || ext === 'txt' || ext === 'md') {
        const content = ext === 'docx' ? await convertDocx(file) : await convertText(file);
        if (!content.chapters.length) throw new Error('No text was found in that file.');
        row = { shelf_id: shelfId, title, kind: 'text', content, chars: contentChars(content) };
      } else if (ext === 'pdf') {
        const { data: u } = await sb.auth.getUser();
        const path = `${u.user.id}/${uid()}.pdf`;
        const { error } = await sb.storage.from('library').upload(path, file, { contentType: 'application/pdf' });
        if (error) throw new Error('The PDF could not be uploaded. Check your connection and try again.');
        row = { shelf_id: shelfId, title, kind: 'pdf', file_path: path };
      } else throw new Error('Use a Word document (.docx), a PDF or a text file.');
      const { data, error } = await sb.from('library_items').insert(row).select(ITEM_COLS).single();
      if (error) throw new Error('It could not be saved. Check your connection and try again.');
      if (row.content) await idb.set(data.id, row.content);
      L.items.push(data); persist();
      L.msg = row.kind === 'text' ? `Added “${title}”: ${row.content.chapters.length} chapter${row.content.chapters.length > 1 ? 's' : ''}, about ${Math.round(row.chars / 5.7 / 100) * 100} words.` : `Added “${title}”.`;
    } catch (err) { L.msg = err.message || 'Something went wrong adding that file.'; }
    L.busy = false; render();
  }

  // ---------- views ----------
  function continueItem(basilOnly) {
    const pool = L.items.filter((i) => i.kind === 'text' && (!basilOnly || shelfById(i.shelf_id)?.is_basil));
    if (!pool.length) return null;
    const read = pool.filter((i) => i.last_read_at && (i.progress?.pct ?? 0) < 100).sort((a, b) => b.last_read_at.localeCompare(a.last_read_at));
    return read[0] || pool.filter((i) => !i.last_read_at).sort((a, b) => a.created_at.localeCompare(b.created_at))[0] || pool.sort((a, b) => (b.last_read_at || '').localeCompare(a.last_read_at || ''))[0];
  }

  // Compact prompt shown at the top of Today
  function todayCard() {
    const basil = L.shelves.find((s) => s.is_basil);
    const it = continueItem(true);
    const d = api.entryFor(todayIso(), true);
    const mins = Math.floor((d?.basilReadSecs || 0) / 60);
    if (!it) {
      return `<button type="button" class="basil-card empty" data-act="tab" data-v="library">
        <span class="bc-k">${esc(basil?.name || 'Basil')}</span><span class="bc-t">Add your manuscript to the Library to read it here</span><span class="bc-go">›</span></button>`;
    }
    const pr = it.progress;
    const where = pr?.ts ? `${pr.pct}% through` : 'Ready to start';
    return `<button type="button" class="basil-card" data-act="l-read" data-id="${it.id}">
      <span class="bc-k">${esc(basil?.name || 'Basil')}${mins ? ` · ${mins} min today` : ''}</span>
      <span class="bc-t">${esc(it.title)}</span>
      <span class="bc-s">${where}. ${pr?.ts ? 'Continue reading' : 'Start reading'}</span>
      <span class="bc-bar"><span style="width:${pr?.pct || 0}%"></span></span>
      <span class="bc-go" aria-hidden="true">›</span>
    </button>`;
  }

  function goalSection(goalId) {
    const linked = L.items.filter((i) => i.goal_id === goalId);
    if (!linked.length) return `<p class="micro">Nothing linked yet. Open any Library item and choose this goal under “Linked goal”.</p>`;
    return `<ul class="goal-list">${linked.map((i) => `<li class="goal lib-item" data-act="l-item" data-id="${i.id}"><span class="kind k-${i.kind}">${KIND[i.kind]}</span>
      <div class="goal-body"><span class="goal-title">${esc(i.title)}</span></div><span class="chev" aria-hidden="true">›</span></li>`).join('')}</ul>`;
  }

  function itemRow(i) {
    const n = notesFor(i.id).filter((x) => !x.resolved).length;
    const meta = [];
    if (i.kind === 'text') meta.push(i.progress?.ts ? `${i.progress.pct}% read` : 'Not started');
    if (n) meta.push(`${n} note${n > 1 ? 's' : ''}`);
    return `<li class="goal lib-item" data-act="l-item" data-id="${i.id}">
      <span class="kind k-${i.kind}">${KIND[i.kind]}</span>
      <div class="goal-body"><span class="goal-title">${esc(i.title)}</span>${meta.length ? `<span class="goal-cats">${meta.join(' · ')}</span>` : ''}</div>
      <span class="chev" aria-hidden="true">›</span></li>`;
  }

  function viewShelves() {
    const cont = continueItem(false);
    return `<section class="page">
      <h1>Library</h1>
      ${cont && cont.progress?.ts ? `<button type="button" class="basil-card" data-act="l-read" data-id="${cont.id}">
        <span class="bc-k">Continue reading</span><span class="bc-t">${esc(cont.title)}</span>
        <span class="bc-s">${cont.progress.pct}% through</span><span class="bc-bar"><span style="width:${cont.progress.pct}%"></span></span><span class="bc-go" aria-hidden="true">›</span></button>` : ''}
      <ul class="goal-list shelves">${sortedShelves().map((s) => {
        const n = itemsOn(s.id).length;
        return `<li class="goal shelf" data-act="l-shelf" data-id="${s.id}">
          <div class="goal-body"><span class="goal-title">${esc(s.name)}</span><span class="goal-cats">${n ? `${n} item${n > 1 ? 's' : ''}` : 'Empty'}${s.is_basil ? ' · shown on Today' : ''}</span></div>
          <span class="chev" aria-hidden="true">›</span></li>`;
      }).join('')}</ul>
      ${L.newShelf ? `<form id="shelf-form" class="step-add"><input name="name" maxlength="60" placeholder="Shelf name" aria-label="Shelf name" autocomplete="off"><button class="primary small" type="submit">Add</button></form>`
        : `<button type="button" class="add-goal" data-act="l-newshelf">+ New shelf</button>`}
      <p class="micro">Shelves hold manuscripts, guides, PDFs, links and notes. Open a shelf to rename it or add to it.</p>
    </section>`;
  }

  function viewShelf(s) {
    const items = itemsOn(s.id);
    const order = sortedShelves(); const idx = order.findIndex((x) => x.id === s.id);
    const confirming = L.confirm === s.id;
    return `<section class="page goal-page">
      <button type="button" class="back" data-act="l-home">‹ Library</button>
      <input class="goal-title-in shelf-name" data-lfield="shelf-name" value="${esc(s.name)}" maxlength="60" aria-label="Shelf name">
      <p class="micro">Tap the name to rename this shelf.${s.is_basil ? ' Manuscripts here appear on Today and count towards Basil.' : ''}</p>
      ${L.msg ? `<p class="lib-msg${L.busy ? ' busy' : ''}">${esc(L.msg)}</p>` : ''}
      <ul class="goal-list">${items.map(itemRow).join('') || '<li class="micro">Nothing here yet.</li>'}</ul>

      ${L.adding === 'link' ? `<form id="link-form" class="goal-form lib-form">
          <label>Title<input name="title" required maxlength="120" autocomplete="off"></label>
          <label>Web address<input name="url" type="url" required placeholder="https://" autocomplete="off"></label>
          <div class="btn-row"><button class="primary small" type="submit">Add link</button><button type="button" class="secondary small" data-act="l-add-cancel">Cancel</button></div></form>`
      : L.adding === 'note' ? `<form id="libnote-form" class="goal-form lib-form">
          <label>Title<input name="title" required maxlength="120" autocomplete="off"></label>
          <label>Note<textarea name="text" rows="6" required></textarea></label>
          <div class="btn-row"><button class="primary small" type="submit">Save note</button><button type="button" class="secondary small" data-act="l-add-cancel">Cancel</button></div></form>`
      : L.adding === 'menu' ? `<div class="add-menu">
          <label class="add-opt">Upload a file<small>Word (.docx), PDF or text</small>
            <input type="file" class="file-in" data-lfile="${s.id}" accept=".docx,.pdf,.txt,.md,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"></label>
          <button type="button" class="add-opt" data-act="l-add" data-v="link">Add a link<small>A web page or video</small></button>
          <button type="button" class="add-opt" data-act="l-add" data-v="note">Write a note<small>Your own reference text</small></button>
          <button type="button" class="link" data-act="l-add-cancel">Cancel</button></div>`
      : `<button type="button" class="add-goal" data-act="l-add" data-v="menu" ${L.busy ? 'disabled' : ''}>+ Add to this shelf</button>`}

      <div class="shelf-tools">
        <button type="button" class="secondary small" data-act="l-shelf-move" data-n="-1" ${idx === 0 ? 'disabled' : ''}>Move up</button>
        <button type="button" class="secondary small" data-act="l-shelf-move" data-n="1" ${idx === order.length - 1 ? 'disabled' : ''}>Move down</button>
        ${s.is_basil ? '' : `<button type="button" class="secondary small" data-act="l-shelf-basil">Show this shelf on Today</button>`}
      </div>
      <div class="goal-actions">
        ${items.length ? `<p class="micro">To delete this shelf, move or delete its items first.</p>`
          : `<button type="button" class="danger small${confirming ? ' armed' : ''}" data-act="l-shelf-del">${confirming ? 'Tap again to delete this shelf' : 'Delete shelf'}</button>`}
      </div>
    </section>`;
  }

  function viewItem(i) {
    const s = shelfById(i.shelf_id);
    const notes = notesFor(i.id);
    const open = notes.filter((n) => !n.resolved).length;
    const confirming = L.confirm === i.id;
    let body = '';
    if (i.kind === 'text') {
      const pr = i.progress;
      body = `<div class="w-score">
          <div class="w-facts"><span>${i.chars ? `About ${(Math.round(i.chars / 5.7 / 100) * 100).toLocaleString('en-GB')} words` : ''}</span><span>${pr?.ts ? `<strong>${pr.pct}%</strong> read` : 'Not started'}</span></div>
          <div class="w-bar"><span style="width:${pr?.pct || 0}%"></span></div>
          ${i.last_read_at ? `<p class="micro">Last read ${fmtDate(i.last_read_at)}.</p>` : ''}
        </div>
        ${L.msg ? `<p class="lib-msg${L.busy ? ' busy' : ''}">${esc(L.msg)}</p>` : ''}
        <button type="button" class="primary" data-act="l-read" data-id="${i.id}" ${L.busy ? 'disabled' : ''}>${L.busy ? 'Opening…' : pr?.ts ? 'Continue reading' : 'Start reading'}</button>
        <button type="button" class="secondary wide" data-act="l-notes">Notes for redrafting${notes.length ? ` (${open} open${notes.length - open ? `, ${notes.length - open} done` : ''})` : ''}</button>`;
    } else if (i.kind === 'pdf') {
      body = L.signed?.id === i.id ? `<a class="primary as-link" href="${esc(L.signed.url)}" target="_blank" rel="noopener">Open PDF</a>` : `<p class="lib-msg busy">Getting the PDF ready…</p>`;
    } else if (i.kind === 'link') {
      body = `<a class="primary as-link" href="${esc(i.url)}" target="_blank" rel="noopener">Open link</a><p class="micro url">${esc(i.url)}</p>`;
    } else if (i.kind === 'note') {
      body = L.noteText == null ? `<p class="lib-msg busy">Loading…</p>` : `<textarea data-lfield="note-text" rows="12" placeholder="Write here">${esc(L.noteText)}</textarea>`;
    }
    return `<section class="page goal-page">
      <button type="button" class="back" data-act="l-shelf" data-id="${i.shelf_id}">‹ ${esc(s?.name || 'Library')}</button>
      <span class="kind k-${i.kind}">${KIND[i.kind]}</span>
      <textarea class="goal-title-in" data-lfield="item-title" rows="2" maxlength="160" aria-label="Title">${esc(i.title)}</textarea>
      ${body}
      <h2 class="sub">Organise</h2>
      <div class="row2">
        <label>Shelf<select data-lfield="item-shelf">${sortedShelves().map((x) => `<option value="${x.id}"${x.id === i.shelf_id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label>Linked goal<select data-lfield="item-goal"><option value="">None</option>${S.goals.filter((g) => g.status !== 'achieved' || g.id === i.goal_id).sort((a, b) => a.title.localeCompare(b.title)).map((g) => `<option value="${g.id}"${g.id === i.goal_id ? ' selected' : ''}>${esc(g.title)}</option>`).join('')}</select></label>
      </div>
      <div class="goal-actions"><button type="button" class="danger small${confirming ? ' armed' : ''}" data-act="l-item-del">${confirming ? 'Tap again to delete for good' : 'Delete from library'}</button></div>
    </section>`;
  }

  function noteCard(n, content) {
    const ch = content?.chapters?.[n.chapter];
    return `<li class="rnote${n.resolved ? ' is-done' : ''}">
      <button type="button" class="tick${n.resolved ? ' on' : ''}" data-act="l-note-resolve" data-id="${n.id}" aria-pressed="${!!n.resolved}" aria-label="${n.resolved ? 'Mark as open' : 'Mark as dealt with'}"></button>
      <div class="rnote-body">
        ${n.quote ? `<button type="button" class="rnote-quote" data-act="l-note-jump" data-id="${n.id}">${quoted(n.quote)}</button>` : ''}
        <p class="rnote-text">${esc(n.note)}</p>
        <div class="rnote-meta"><span>${n.para == null ? 'General note' : esc(ch?.title || `Chapter ${n.chapter + 1}`)}</span>
          <button type="button" class="link sm" data-act="l-note-edit" data-id="${n.id}">Edit</button>
          <button type="button" class="link sm" data-act="l-note-del" data-id="${n.id}">Delete</button></div>
      </div></li>`;
  }

  function viewNotes(i) {
    const notes = notesFor(i.id).sort((a, b) => (a.para == null) - (b.para == null) || a.chapter - b.chapter || (a.para ?? 0) - (b.para ?? 0) || a.created_at.localeCompare(b.created_at));
    const open = notes.filter((n) => !n.resolved); const done = notes.filter((n) => n.resolved);
    const group = (list) => {
      let out = ''; let last = null;
      for (const n of list) {
        const key = n.para == null ? 'General notes' : (L.content?.chapters?.[n.chapter]?.title || `Chapter ${n.chapter + 1}`);
        if (key !== last) { out += `${last ? '</ul>' : ''}<h3 class="step-h">${esc(key)}</h3><ul class="rnotes">`; last = key; }
        out += noteCard(n, L.content);
      }
      return out ? out + '</ul>' : '';
    };
    return `<section class="page goal-page">
      <button type="button" class="back" data-act="${L.reading ? 'l-panel' : 'l-item'}" data-v="" data-id="${i.id}">‹ ${L.reading ? 'Back to reading' : esc(i.title)}</button>
      <h1>Notes for redrafting</h1>
      <p class="lead">${esc(i.title)}</p>
      <div class="btn-row">
        <button type="button" class="secondary small" data-act="l-note-new">Add a general note</button>
        ${notes.length ? `<button type="button" class="secondary small" data-act="l-notes-dl">Download notes</button>` : ''}
      </div>
      ${notes.length ? '' : `<p class="micro">While reading, tap any paragraph to pin a note to it. They collect here, chapter by chapter, ready for your next draft.</p>`}
      ${group(open)}
      ${done.length ? `<h2 class="sub">Dealt with (${done.length})</h2>${group(done)}` : ''}
    </section>`;
  }

  function noteSheet() {
    const e = L.noteEdit;
    return `<div class="sheet-back" data-act="l-note-cancel"></div>
      <div class="sheet note-sheet" role="dialog" aria-modal="true" aria-label="Note">
        ${e.quote ? `<p class="rnote-quote static">${quoted(e.quote)}</p>` : `<h2>General note</h2>`}
        <form id="rnote-form"><textarea name="note" rows="5" placeholder="What do you want to change, keep or check?" required>${esc(e.note || '')}</textarea>
          <div class="btn-row"><button class="primary small" type="submit">Save note</button><button type="button" class="secondary small" data-act="l-note-cancel">Cancel</button></div></form>
      </div>`;
  }

  function viewReader(i) {
    const content = L.content; const ch = content.chapters[L.chapter];
    const notes = notesFor(i.id);
    const byPara = {};
    notes.filter((n) => n.chapter === L.chapter && n.para != null).forEach((n) => { (byPara[n.para] ||= []).push(n); });
    const theme = prefs.theme === 'auto' ? '' : ` rt-${prefs.theme}`;
    const paras = ch.paras.map((html, p) => {
      const ns = byPara[p]; const sel = L.sel === p;
      return `<p data-p="${p}" data-act="l-para" class="rp${ns ? ' has-note' : ''}${sel ? ' sel' : ''}${html.startsWith('<span class="scene"') ? ' scene-p' : ''}">${html}</p>${sel ? `<div class="para-tools">
          ${(ns || []).map((n) => `<div class="pnote${n.resolved ? ' is-done' : ''}"><p>${esc(n.note)}</p><div class="rnote-meta">
            <button type="button" class="link sm" data-act="l-note-edit" data-id="${n.id}">Edit</button>
            <button type="button" class="link sm" data-act="l-note-resolve" data-id="${n.id}">${n.resolved ? 'Reopen' : 'Dealt with'}</button>
            <button type="button" class="link sm" data-act="l-note-del" data-id="${n.id}">Delete</button></div></div>`).join('')}
          <button type="button" class="primary small" data-act="l-note-add" data-p="${p}">${ns ? 'Add another note' : 'Add a note here'}</button></div>` : ''}`;
    }).join('');
    const pct = i.progress?.pct ?? 0;
    const last = L.chapter === content.chapters.length - 1;
    const panel = L.panel === 'toc' ? `<div class="sheet-back" data-act="l-panel" data-v=""></div><div class="sheet toc" role="dialog" aria-modal="true" aria-label="Contents"><h2>Contents</h2><ol>${content.chapters.map((c, ci) => {
        const n = notes.filter((x) => x.chapter === ci && x.para != null && !x.resolved).length;
        return `<li><button type="button" class="${ci === L.chapter ? 'on' : ''}" data-act="l-chapter" data-n="${ci}">${esc(c.title)}${n ? `<span class="toc-n">${n} note${n > 1 ? 's' : ''}</span>` : ''}</button></li>`;
      }).join('')}</ol></div>`
      : L.panel === 'aa' ? `<div class="sheet-back" data-act="l-panel" data-v=""></div><div class="sheet aa" role="dialog" aria-modal="true" aria-label="Reading settings"><h2>Reading settings</h2>
        <div class="aa-row"><span>Text size</span><div class="aa-ctl"><button type="button" class="step sm" data-act="l-size" data-n="-1" aria-label="Smaller">A−</button><span class="aa-val">${prefs.size}</span><button type="button" class="step sm" data-act="l-size" data-n="1" aria-label="Larger">A+</button></div></div>
        <div class="aa-row"><span>Page</span><div class="opts">${[['auto', 'Auto'], ['light', 'Light'], ['sepia', 'Sepia'], ['dark', 'Dark']].map(([v, l]) => `<button type="button" class="opt slim${prefs.theme === v ? ' on' : ''}" data-act="l-theme" data-v="${v}">${l}</button>`).join('')}</div></div>
        <div class="aa-row"><span>Typeface</span><div class="opts">${[['serif', 'Book'], ['sans', 'Plain']].map(([v, l]) => `<button type="button" class="opt slim${prefs.font === v ? ' on' : ''}" data-act="l-font" data-v="${v}">${l}</button>`).join('')}</div></div>
        <button type="button" class="primary" data-act="l-panel" data-v="">Done</button></div>` : '';
    const openNotes = notes.filter((n) => !n.resolved).length;
    return `<article class="reader${theme} rf-${prefs.font}" style="--rsize:${prefs.size}px">
      <header class="rbar">
        <button type="button" class="rbtn" data-act="l-close" aria-label="Close book">‹</button>
        <button type="button" class="rtitle" data-act="l-panel" data-v="toc"><span>${esc(ch.title)}</span><small>${esc(i.title)} · ${pct}%</small></button>
        <button type="button" class="rbtn txt" data-act="l-panel" data-v="aa" aria-label="Reading settings">Aa</button>
        <button type="button" class="rbtn txt" data-act="l-panel" data-v="notes" aria-label="Notes">${openNotes ? `<span class="rcount">${openNotes}</span>` : ''}Notes</button>
      </header>
      <div class="rtext">
        <h2 class="rch">${esc(ch.title)}</h2>
        ${paras}
        <nav class="rnav">
          <button type="button" class="secondary small" data-act="l-chapter" data-n="${L.chapter - 1}" ${L.chapter === 0 ? 'disabled' : ''}>‹ Previous</button>
          <span>${L.chapter + 1} of ${content.chapters.length}</span>
          ${last ? `<button type="button" class="primary small" data-act="l-finish">Finished</button>` : `<button type="button" class="primary small" data-act="l-chapter" data-n="${L.chapter + 1}">Next ›</button>`}
        </nav>
      </div>
      ${panel}
    </article>`;
  }

  function view() {
    const item = L.item && itemById(L.item);
    let html;
    if (item && L.panel === 'notes') html = viewNotes(item);
    else if (item && L.reading && L.content) html = viewReader(item);
    else if (item) html = viewItem(item);
    else if (L.shelf && shelfById(L.shelf)) html = viewShelf(shelfById(L.shelf));
    else html = viewShelves();
    return html + (L.noteEdit ? noteSheet() : '');
  }
  const immersive = () => !!(L.item && L.reading && L.content && L.panel !== 'notes');

  // ---------- notes ----------
  function saveNote(n) {
    n._pending = true; n.updated_at = new Date().toISOString();
    if (!L.notes.includes(n)) L.notes.push(n);
    persist(); flushNotes();
  }
  function deleteNote(id) {
    L.notes = L.notes.filter((n) => n.id !== id);
    store.set('lp-note-dels', [...store.get('lp-note-dels', []), id]);
    persist(); flushNotes();
  }
  function downloadNotes(i) {
    const notes = notesFor(i.id).sort((a, b) => (a.para == null) - (b.para == null) || a.chapter - b.chapter || (a.para ?? 0) - (b.para ?? 0));
    let out = `Notes for redrafting: ${i.title}\n${new Date().toLocaleDateString('en-GB')}\n`;
    let last = null;
    for (const n of notes) {
      const key = n.para == null ? 'General notes' : (L.content?.chapters?.[n.chapter]?.title || `Chapter ${n.chapter + 1}`);
      if (key !== last) { out += `\n\n${key.toUpperCase()}\n${'-'.repeat(key.length)}\n`; last = key; }
      out += `\n${n.resolved ? '[done] ' : ''}${n.quote ? `“${n.quote}”\n  ` : ''}${n.note}\n`;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out], { type: 'text/plain;charset=utf-8' }));
    a.download = `${i.title} - notes.txt`; a.click();
  }

  // ---------- events ----------
  async function openItem(id) {
    const i = itemById(id); if (!i) return;
    S.view = 'library'; L.item = id; L.shelf = i.shelf_id; L.reading = false; L.panel = null; L.msg = ''; L.confirm = null; L.signed = null; L.noteText = null;
    render(); window.scrollTo(0, 0);
    if (i.kind === 'pdf') {
      const { data } = await sb.storage.from('library').createSignedUrl(i.file_path, 3600);
      if (data?.signedUrl && L.item === id) { L.signed = { id, url: data.signedUrl }; render(); }
    } else if (i.kind === 'note') {
      const c = await getContent(i);
      if (L.item === id) { L.noteText = c?.text || ''; render(); }
    } else if (i.kind === 'text' && !L.content) {
      getContent(i).then((c) => { if (L.item === id && !L.reading) L.content = c; });
    }
  }

  async function onClick(act, el) {
    if (!act.startsWith('l-')) return false;
    const item = L.item && itemById(L.item);
    switch (act) {
      case 'l-home': L.shelf = null; L.item = null; L.adding = null; L.msg = ''; L.newShelf = false; render(); window.scrollTo(0, 0); break;
      case 'l-shelf': S.view = 'library'; L.shelf = el.dataset.id; L.item = null; L.reading = false; L.content = null; L.panel = null; L.adding = null; L.confirm = null; L.msg = ''; render(); window.scrollTo(0, 0); break;
      case 'l-item': L.content = L.item === el.dataset.id ? L.content : null; await openItem(el.dataset.id); break;
      case 'l-read': if (L.item !== el.dataset.id) L.content = null; await openReader(el.dataset.id); break;
      case 'l-close': L.reading = false; L.panel = null; L.sel = null; render(); window.scrollTo(0, 0); break;
      case 'l-newshelf': L.newShelf = true; render(); document.querySelector('#shelf-form input')?.focus(); break;
      case 'l-add': L.adding = el.dataset.v; L.msg = ''; render(); break;
      case 'l-add-cancel': L.adding = null; render(); break;
      case 'l-shelf-move': {
        const order = sortedShelves(); const idx = order.findIndex((x) => x.id === L.shelf); const j = idx + Number(el.dataset.n);
        if (j < 0 || j >= order.length) break;
        [order[idx], order[j]] = [order[j], order[idx]];
        order.forEach((s, k) => { s.position = k; });
        persist(); render();
        await Promise.all(order.map((s) => sb.from('shelves').update({ position: s.position }).eq('id', s.id)));
        break;
      }
      case 'l-shelf-basil': {
        const prev = L.shelves.find((s) => s.is_basil);
        if (prev) { prev.is_basil = false; await sb.from('shelves').update({ is_basil: false }).eq('id', prev.id); }
        const s = shelfById(L.shelf); s.is_basil = true; persist(); render();
        await sb.from('shelves').update({ is_basil: true }).eq('id', s.id);
        break;
      }
      case 'l-shelf-del': {
        const id = L.shelf;
        if (L.confirm !== id) { L.confirm = id; render(); setTimeout(() => { if (L.confirm === id) { L.confirm = null; render(); } }, 4000); break; }
        L.shelves = L.shelves.filter((s) => s.id !== id); L.shelf = null; L.confirm = null; persist(); render();
        await sb.from('shelves').delete().eq('id', id);
        break;
      }
      case 'l-item-del': {
        const id = L.item;
        if (L.confirm !== id) { L.confirm = id; render(); setTimeout(() => { if (L.confirm === id) { L.confirm = null; render(); } }, 4000); break; }
        const it = itemById(id);
        L.items = L.items.filter((x) => x.id !== id); L.notes = L.notes.filter((n) => n.item_id !== id);
        L.item = null; L.confirm = null; L.content = null; persist(); idb.del(id); render();
        if (it.file_path) await sb.storage.from('library').remove([it.file_path]);
        await sb.from('library_items').delete().eq('id', id);
        break;
      }
      case 'l-notes': L.panel = 'notes'; if (!L.content && item) L.content = await getContent(item); render(); window.scrollTo(0, 0); break;
      case 'l-panel': {
        const v = el.dataset.v || null;
        const wasNotes = L.panel === 'notes';
        L.panel = v; L.sel = null;
        if (wasNotes && L.reading) L.pendingScroll = item?.progress?.p ?? 0;
        render(); if (v === 'notes') window.scrollTo(0, 0);
        break;
      }
      case 'l-chapter': gotoChapter(Number(el.dataset.n)); break;
      case 'l-finish': saveProgress(item, L.chapter, 0, true); L.reading = false; L.sel = null; toast(`You finished “${item.title}”.`); render(); window.scrollTo(0, 0); break;
      case 'l-para': {
        if (window.getSelection && String(window.getSelection())) break; // don't hijack text selection
        const p = Number(el.dataset.p); L.sel = L.sel === p ? null : p; render(); break;
      }
      case 'l-note-add': {
        const p = Number(el.dataset.p);
        const text = stripTags(L.content.chapters[L.chapter].paras[p]);
        L.noteEdit = { id: null, chapter: L.chapter, para: p, quote: text.length > 160 ? text.slice(0, 157).trimEnd() + '…' : text, note: '' };
        render(); document.querySelector('#rnote-form textarea')?.focus(); break;
      }
      case 'l-note-new': L.noteEdit = { id: null, chapter: 0, para: null, quote: null, note: '' }; render(); document.querySelector('#rnote-form textarea')?.focus(); break;
      case 'l-note-edit': { const n = L.notes.find((x) => x.id === el.dataset.id); L.noteEdit = { ...n }; render(); document.querySelector('#rnote-form textarea')?.focus(); break; }
      case 'l-note-cancel': L.noteEdit = null; render(); break;
      case 'l-note-resolve': { const n = L.notes.find((x) => x.id === el.dataset.id); n.resolved = !n.resolved; saveNote(n); render(); break; }
      case 'l-note-del': deleteNote(el.dataset.id); render(); break;
      case 'l-note-jump': {
        const n = L.notes.find((x) => x.id === el.dataset.id);
        L.panel = null; await openReader(n.item_id, { c: n.chapter, p: n.para });
        break;
      }
      case 'l-notes-dl': if (!L.content) L.content = await getContent(item); downloadNotes(item); break;
      case 'l-size': prefs.size = Math.max(15, Math.min(28, prefs.size + Number(el.dataset.n))); store.set('lp-reader', prefs); render(); break;
      case 'l-theme': prefs.theme = el.dataset.v; store.set('lp-reader', prefs); render(); break;
      case 'l-font': prefs.font = el.dataset.v; store.set('lp-reader', prefs); render(); break;
      default: return false;
    }
    return true;
  }

  async function onChange(el) {
    if (el.dataset.lfile) { const f = el.files?.[0]; if (f) await handleFile(f, el.dataset.lfile); return true; }
    const k = el.dataset.lfield; if (!k) return false;
    const item = L.item && itemById(L.item);
    if (k === 'shelf-name') {
      const s = shelfById(L.shelf); const v = el.value.trim();
      if (!v) { el.value = s.name; return true; }
      s.name = v; persist(); await sb.from('shelves').update({ name: v }).eq('id', s.id);
    } else if (k === 'item-title') {
      const v = el.value.trim(); if (!v) { el.value = item.title; return true; }
      item.title = v; persist(); await sb.from('library_items').update({ title: v, updated_at: new Date().toISOString() }).eq('id', item.id);
    } else if (k === 'item-shelf') {
      item.shelf_id = el.value; L.shelf = el.value; persist(); render(); await sb.from('library_items').update({ shelf_id: el.value }).eq('id', item.id);
    } else if (k === 'item-goal') {
      item.goal_id = el.value || null; persist(); await sb.from('library_items').update({ goal_id: item.goal_id }).eq('id', item.id);
    } else if (k === 'note-text') {
      L.noteText = el.value; const content = { text: el.value }; idb.set(item.id, content);
      await sb.from('library_items').update({ content, updated_at: new Date().toISOString() }).eq('id', item.id);
    }
    return true;
  }

  async function onSubmit(e) {
    const id = e.target.id;
    if (!['shelf-form', 'link-form', 'libnote-form', 'rnote-form'].includes(id)) return false;
    e.preventDefault();
    const fd = new FormData(e.target);
    if (id === 'shelf-form') {
      const name = String(fd.get('name') || '').trim(); if (!name) return true;
      const position = Math.max(-1, ...L.shelves.map((s) => s.position)) + 1;
      const { data, error } = await sb.from('shelves').insert({ name, position }).select('*').single();
      if (!error) { L.shelves.push(data); persist(); }
      L.newShelf = false; render();
    } else if (id === 'link-form' || id === 'libnote-form') {
      const title = String(fd.get('title') || '').trim();
      const row = id === 'link-form' ? { shelf_id: L.shelf, title, kind: 'link', url: String(fd.get('url')).trim() }
        : { shelf_id: L.shelf, title, kind: 'note', content: { text: String(fd.get('text') || '') } };
      const { data, error } = await sb.from('library_items').insert(row).select(ITEM_COLS).single();
      if (error) { L.msg = 'It could not be saved. Check your connection and try again.'; }
      else { if (row.content) idb.set(data.id, row.content); L.items.push(data); persist(); L.adding = null; L.msg = ''; }
      render();
    } else if (id === 'rnote-form') {
      const text = String(fd.get('note') || '').trim(); if (!text) return true;
      const e2 = L.noteEdit;
      const existing = e2.id && L.notes.find((n) => n.id === e2.id);
      if (existing) { existing.note = text; saveNote(existing); }
      else saveNote({ id: uid(), item_id: L.item, chapter: e2.chapter, para: e2.para, quote: e2.quote, note: text, resolved: false, created_at: new Date().toISOString() });
      L.noteEdit = null; render();
    }
    return true;
  }

  function reset() { L.shelf = null; L.item = null; L.reading = false; L.content = null; L.panel = null; L.sel = null; L.adding = null; L.confirm = null; L.msg = ''; L.newShelf = false; L.noteEdit = null; }

  return { load, view, immersive, afterRender, onClick, onChange, onSubmit, todayCard, goalSection, reset, openItem };
}
