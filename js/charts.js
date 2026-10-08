// Life Plan — small SVG chart kit. Every chart is drawn at its real pixel width
// (so text stays crisp), uses thin marks, hairline grids, and taps for detail.
// Identity never relies on colour alone: series are labelled in text.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f1 = (n) => Math.round(n * 10) / 10;

// ---------- tooltip registry ----------
const REG = new Map();
let seq = 0;
export function resetCharts() { REG.clear(); seq = 0; }
const reg = (tips, open) => { const id = `c${++seq}`; REG.set(id, { tips, open }); return id; };

// ---------- scales ----------
function niceStep(span, count) {
  const raw = span / Math.max(1, count); const mag = 10 ** Math.floor(Math.log10(raw)); const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}
export function niceDomain(vals, { zero = false, domain = null, time = false, count = 4 } = {}) {
  if (domain) return { min: domain[0], max: domain[1], ticks: ticksFor(domain[0], domain[1], count, time) };
  const v = vals.filter((x) => x != null && Number.isFinite(x));
  let min = v.length ? Math.min(...v) : 0; let max = v.length ? Math.max(...v) : 1;
  if (zero) { min = Math.min(0, min); max = Math.max(0, max); }
  if (min === max) { min -= time ? 30 : 1; max += time ? 30 : 1; if (zero && min < 0 && v.every((x) => x >= 0)) min = 0; }
  const step = time ? [15, 30, 60, 120, 180].find((s) => (max - min) / s <= count) || 240 : niceStep(max - min, count);
  min = Math.floor(min / step) * step; max = Math.ceil(max / step) * step;
  if (max === min) max = min + step;
  return { min, max, ticks: ticksFor(min, max, count, time, step) };
}
function ticksFor(min, max, count, time, step) {
  step ||= time ? 60 : niceStep(max - min, count);
  const t = []; for (let x = min; x <= max + 1e-9; x += step) t.push(f1(x));
  return t;
}

// x labels: every day for a week, otherwise spaced so they never collide
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dObj = (day) => new Date(day + 'T12:00:00Z');
export const shortDate = (day) => { const d = dObj(day); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
export const longDate = (day) => { const d = dObj(day); return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
function xLabels(pts, cw) {
  const n = pts.length;
  if (n <= 8 && cw >= 34) return pts.map((p, i) => [i, pts[i].week ? shortDate(p.day) : WD[dObj(p.day).getUTCDay()].slice(0, n <= 7 && cw > 40 ? 3 : 1)]);
  const every = Math.max(1, Math.ceil(46 / cw));
  const out = [];
  for (let i = n - 1; i >= 0; i -= every) out.push([i, shortDate(pts[i].day)]);
  return out;
}

function frame(W, H, dom, fmt, { L = null, R = 10, T = 12, B = 24 } = {}) {
  // left margin fits the longest y label
  L ??= Math.max(30, Math.round(Math.max(...dom.ticks.map((t) => String(fmt(t)).length)) * 6.4 + 10));
  const pw = W - L - R; const ph = H - T - B;
  const y = (v) => T + ph - ((v - dom.min) / (dom.max - dom.min)) * ph;
  const grid = dom.ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${f1(y(t))}" y2="${f1(y(t))}" class="g"/>
    <text x="${L - 6}" y="${f1(y(t)) + 4}" class="yl" text-anchor="end">${esc(fmt(t))}</text>`).join('');
  return { L, R, T, B, pw, ph, y, grid };
}

function hits(id, n, L, T, cw, ph) {
  let s = '';
  for (let i = 0; i < n; i++) s += `<rect class="hit" data-c="${id}" data-i="${i}" x="${f1(L + i * cw)}" y="${T}" width="${f1(cw)}" height="${ph}"/>`;
  return s + `<line class="xh" x1="0" x2="0" y1="${T}" y2="${T + ph}"/>`;
}
function xAxis(pts, L, cw, H) {
  return xLabels(pts, cw).map(([i, t]) => `<text x="${f1(L + (i + 0.5) * cw)}" y="${H - 6}" class="xl" text-anchor="middle">${esc(t)}</text>`).join('');
}
const svg = (W, H, body, cls = '', label = '') => `<svg class="ch ${cls}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"${label ? ` aria-label="${esc(label)}"` : ''}>${body}</svg>`;

// path through points, broken at gaps
function linePath(xs, ys) {
  let d = ''; let pen = false;
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] == null) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${f1(xs[i])},${f1(ys[i])}`; pen = true;
  }
  return d;
}
function stepPath(xs, ys, cw) {
  let d = ''; let prev = null;
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] == null) { prev = null; continue; }
    const a = xs[i] - cw / 2; const b = xs[i] + cw / 2;
    d += prev == null ? `M${f1(a)},${f1(ys[i])}` : `L${f1(a)},${f1(ys[i])}`;
    d += `L${f1(b)},${f1(ys[i])}`; prev = ys[i];
  }
  return d;
}

// ---------- line ----------
// pts: [{day, v, t?}]; avg: draw a 7-point rolling average when there's enough data
export function lineChart(o) {
  const { pts, W, H = 180, fmt = String, color = 'var(--primary)', tip, open = false, label = '' } = o;
  const n = pts.length; if (!n) return '';
  const vals = pts.map((p) => p.v);
  const roll = o.avg && n >= 14 ? rolling7(vals) : null;
  const dom = niceDomain([...vals, ...(o.target ? pts.map((p) => p.t) : [])], { domain: o.domain, zero: o.zero, time: o.time });
  const fr = frame(W, H, dom, o.tickFmt || fmt); const cw = fr.pw / n;
  const xs = pts.map((_, i) => fr.L + (i + 0.5) * cw);
  const ys = vals.map((v) => (v == null ? null : fr.y(v)));
  let body = fr.grid;
  if (o.target) body += `<path d="${stepPath(xs, pts.map((p) => (p.t == null ? null : fr.y(p.t))), cw)}" class="tgt"/>`;
  const dots = n <= 45;
  body += `<path d="${linePath(xs, ys)}" class="ln${roll ? ' faint' : ''}" style="stroke:${color}"/>`;
  ys.forEach((y, i) => {
    if (y == null) return;
    const lonely = (i === 0 || ys[i - 1] == null) && (i === n - 1 || ys[i + 1] == null);
    if (dots) body += `<circle cx="${f1(xs[i])}" cy="${f1(y)}" r="4" class="dot${roll ? ' faint' : ''}" style="fill:${color}"/>`;
    else if (lonely) body += `<circle cx="${f1(xs[i])}" cy="${f1(y)}" r="2.5" style="fill:${color}"/>`;
  });
  if (roll) {
    body += `<path d="${linePath(xs, roll.map((v) => (v == null ? null : fr.y(v))))}" class="ln avg" style="stroke:${color}"/>`;
    const li = roll.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop();
    if (li != null && li >= 0) body += `<text x="${f1(Math.min(xs[li], W - 12))}" y="${f1(fr.y(roll[li]) - 9)}" class="lbl" text-anchor="end">7-day avg</text>`;
  }
  if (o.target) {
    const lt = pts.map((p) => p.t).filter((x) => x != null).pop();
    if (lt != null) body += `<text x="${W - fr.R}" y="${f1(fr.y(lt) - 5)}" class="lbl" text-anchor="end">Target</text>`;
  }
  const id = reg(pts.map((p, i) => tip ? tip(p, i, roll?.[i]) : { title: longDate(p.day), rows: [['', fmt(p.v)]], day: p.day }), open);
  body += xAxis(pts, fr.L, cw, H) + hits(id, n, fr.L, fr.T, cw, fr.ph);
  return chartWrap(svg(W, H, body, 'ch-line', label));
}
function rolling7(v) {
  return v.map((_, i) => { const w = v.slice(Math.max(0, i - 6), i + 1).filter((x) => x != null); return w.length >= 3 ? w.reduce((s, x) => s + x, 0) / w.length : null; });
}

// ---------- bars ----------
// muted(p): draw this bar lighter (eg over target). Bars hang from zero, so negatives work.
export function barChart(o) {
  const { pts, W, H = 180, fmt = String, color = 'var(--primary)', tip, open = false, label = '' } = o;
  const n = pts.length; if (!n) return '';
  const vals = pts.map((p) => p.v);
  const dom = niceDomain([...vals, ...(o.target ? pts.map((p) => p.t) : []), 0], { domain: o.domain, zero: true });
  const fr = frame(W, H, dom, o.tickFmt || fmt); const cw = fr.pw / n;
  const bw = Math.max(2, Math.min(24, cw * 0.66)); const y0 = fr.y(Math.max(dom.min, Math.min(dom.max, 0)));
  let body = fr.grid;
  pts.forEach((p, i) => {
    if (p.v == null) return;
    const x = fr.L + (i + 0.5) * cw - bw / 2; const yv = fr.y(p.v);
    const h = Math.abs(yv - y0);
    if (h < 0.5) { body += `<rect x="${f1(x)}" y="${f1(y0 - 1)}" width="${f1(bw)}" height="2" rx="1" style="fill:${color}"/>`; return; }
    const r = Math.min(4, bw / 2, h);
    const up = p.v >= 0; const top = up ? yv : y0; const bot = up ? y0 : yv;
    const d = up
      ? `M${f1(x)},${f1(bot)}V${f1(top + r)}Q${f1(x)},${f1(top)} ${f1(x + r)},${f1(top)}H${f1(x + bw - r)}Q${f1(x + bw)},${f1(top)} ${f1(x + bw)},${f1(top + r)}V${f1(bot)}Z`
      : `M${f1(x)},${f1(top)}V${f1(bot - r)}Q${f1(x)},${f1(bot)} ${f1(x + r)},${f1(bot)}H${f1(x + bw - r)}Q${f1(x + bw)},${f1(bot)} ${f1(x + bw)},${f1(bot - r)}V${f1(top)}Z`;
    body += `<path d="${d}" class="bk${o.muted && o.muted(p) ? ' muted' : ''}" style="fill:${color}"/>`;
  });
  if (dom.min < 0) body += `<line x1="${fr.L}" x2="${W - fr.R}" y1="${f1(y0)}" y2="${f1(y0)}" class="zero"/>`;
  if (o.target) {
    const xs = pts.map((_, i) => fr.L + (i + 0.5) * cw);
    body += `<path d="${stepPath(xs, pts.map((p) => (p.t == null ? null : fr.y(p.t))), cw)}" class="tgt"/>`;
    const lt = pts.map((p) => p.t).filter((x) => x != null).pop();
    if (lt != null) body += `<text x="${W - fr.R}" y="${f1(fr.y(lt) - 5)}" class="lbl" text-anchor="end">Target</text>`;
  }
  const id = reg(pts.map((p, i) => tip ? tip(p, i) : { title: longDate(p.day), rows: [['', fmt(p.v)]], day: p.day }), open);
  body += xAxis(pts, fr.L, cw, H) + hits(id, n, fr.L, fr.T, cw, fr.ph);
  return chartWrap(svg(W, H, body, 'ch-bars', label));
}

// ---------- small multiple ----------
export function miniLine(o) {
  const { pts, W, H = 58, color = 'var(--primary)', fmt = String, tip } = o;
  const n = pts.length; if (!n) return '';
  const vals = pts.map((p) => p.v);
  const dom = niceDomain(vals, { domain: o.domain, time: o.time, count: 2 });
  const T = 6; const B = 6; const ph = H - T - B; const cw = W / n;
  const y = (v) => T + ph - ((v - dom.min) / (dom.max - dom.min || 1)) * ph;
  const xs = pts.map((_, i) => (i + 0.5) * cw); const ys = vals.map((v) => (v == null ? null : y(v)));
  const roll = n >= 14 ? rolling7(vals) : null;
  let body = `<line x1="0" x2="${W}" y1="${H - B}" y2="${H - B}" class="g"/>`;
  if (o.mid != null) body += `<line x1="0" x2="${W}" y1="${f1(y(o.mid))}" y2="${f1(y(o.mid))}" class="g"/>`;
  body += `<path d="${linePath(xs, ys)}" class="ln${roll ? ' faint' : ''}" style="stroke:${color}"/>`;
  if (roll) body += `<path d="${linePath(xs, roll.map((v) => (v == null ? null : y(v))))}" class="ln avg" style="stroke:${color}"/>`;
  ys.forEach((yy, i) => {
    if (yy == null) return;
    const lonely = (i === 0 || ys[i - 1] == null) && (i === n - 1 || ys[i + 1] == null);
    if (n <= 31 || lonely) body += `<circle cx="${f1(xs[i])}" cy="${f1(yy)}" r="${n <= 31 ? 3 : 2}" class="dot${roll ? ' faint' : ''}" style="fill:${color}"/>`;
  });
  const id = reg(pts.map((p, i) => tip ? tip(p, i) : { title: longDate(p.day), rows: [['', fmt(p.v)]], day: p.day }), o.open);
  body += hits(id, n, 0, 0, cw, H);
  return chartWrap(svg(W, H, body, 'ch-mini'));
}

// ---------- strip (categorical, one cell per day) ----------
// levels: [{v,label}] in order; shade deepens along the order
export function stripChart(o) {
  const { pts, W, levels, color = 'var(--primary)', H = 26, tip } = o;
  const n = pts.length; if (!n) return '';
  const cw = W / n; const gap = cw > 6 ? 2 : 0; const k = Math.max(1, levels.length - 1);
  const shade = (v) => { const i = levels.findIndex((l) => l.v === v); return i < 0 ? null : 14 + Math.round((i / k) * 80); };
  let body = '';
  pts.forEach((p, i) => {
    const x = i * cw + gap / 2; const w = Math.max(1, cw - gap);
    const s = p.v == null ? null : shade(p.v);
    body += s == null
      ? `<rect x="${f1(x + 0.5)}" y="4.5" width="${f1(Math.max(0.5, w - 1))}" height="${H - 9}" rx="${Math.min(4, w / 3)}" class="cell-empty"/>`
      : `<rect x="${f1(x)}" y="4" width="${f1(w)}" height="${H - 8}" rx="${Math.min(4, w / 3)}" style="fill:color-mix(in srgb, ${color} ${s}%, var(--surface))"/>`;
  });
  const id = reg(pts.map((p, i) => tip ? tip(p, i) : { title: longDate(p.day), rows: [['', p.v ?? '–']], day: p.day }), o.open);
  body += hits(id, n, 0, 0, cw, H);
  const legend = `<div class="clegend">${levels.map((l, i) => `<span><i style="background:color-mix(in srgb, ${color} ${14 + Math.round((i / k) * 80)}%, var(--surface))"></i>${esc(l.label)}</span>`).join('')}</div>`;
  return chartWrap(svg(W, H, body, 'ch-strip')) + (o.legend === false ? '' : legend);
}

// ---------- distribution (horizontal counts) ----------
export function distBars(rows, color = 'var(--primary)') {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return `<div class="dist">${rows.map((r) => `<div class="dist-row"><span class="dist-l">${esc(r.label)}</span>
    <span class="dist-t"><span class="dist-b" style="width:${(r.n / max) * 100}%;background:${color}"></span></span><span class="dist-n">${r.n}</span></div>`).join('')}</div>`;
}

// ---------- scatter ----------
export function scatter(o) {
  const { xs, ys, W, H = 220, xfmt = String, yfmt = String, xLabel = '', yLabel = '', color = 'var(--primary)', days = [] } = o;
  if (!xs.length) return '';
  const dx = niceDomain(xs, { time: o.xtime, domain: o.xdomain }); const dy = niceDomain(ys, { time: o.ytime, domain: o.ydomain });
  const L = 40; const R = 12; const T = 14; const B = 40; const pw = W - L - R; const ph = H - T - B;
  const sx = (v) => L + ((v - dx.min) / (dx.max - dx.min)) * pw; const sy = (v) => T + ph - ((v - dy.min) / (dy.max - dy.min)) * ph;
  let body = dy.ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${f1(sy(t))}" y2="${f1(sy(t))}" class="g"/><text x="${L - 6}" y="${f1(sy(t)) + 4}" class="yl" text-anchor="end">${esc(yfmt(t))}</text>`).join('');
  body += dx.ticks.map((t) => `<text x="${f1(sx(t))}" y="${T + ph + 16}" class="xl" text-anchor="middle">${esc(xfmt(t))}</text>`).join('');
  body += `<text x="${L + pw / 2}" y="${H - 4}" class="ax" text-anchor="middle">${esc(xLabel)} →</text>`;
  body += `<text x="${L}" y="${T - 3}" class="ax">↑ ${esc(yLabel)}</text>`;
  // nudge stacked points apart so repeats stay visible
  const seen = {};
  const tips = [];
  xs.forEach((x, i) => {
    const k = `${x}|${ys[i]}`; const c = (seen[k] = (seen[k] || 0) + 1) - 1;
    const ox = c ? ((c % 2 ? 1 : -1) * Math.ceil(c / 2) * 5) : 0;
    body += `<circle cx="${f1(sx(x) + ox)}" cy="${f1(sy(ys[i]))}" r="4.5" class="sdot" style="fill:${color}"/>`;
    tips.push({ title: days[i] ? longDate(days[i]) : '', rows: [[xLabel, xfmt(x)], [yLabel, yfmt(ys[i])]], day: days[i] });
    body += `<circle cx="${f1(sx(x) + ox)}" cy="${f1(sy(ys[i]))}" r="12" class="hit" data-c="__ID__" data-i="${i}"/>`;
  });
  const id = reg(tips, o.open);
  return chartWrap(svg(W, H, body.replaceAll('__ID__', id), 'scatter'));
}

// ---------- pattern comparison (dumbbell) ----------
export function dumbbell(o) {
  const { a, b, W, fmt = String, domain, better } = o;
  const H = 46; const L = 14; const R = 14;
  let [lo, hi] = domain || [Math.min(a, b), Math.max(a, b)];
  if (!domain) { const pad = (hi - lo) * 0.35 || 1; lo -= pad; hi += pad; }
  const x = (v) => L + ((v - lo) / (hi - lo || 1)) * (W - L - R);
  const xa = x(a); const xb = x(b);
  const close = Math.abs(xa - xb) < 56;
  const ta = close ? (xa > xb ? 'start' : 'end') : 'middle'; const tb = close ? (xa > xb ? 'end' : 'start') : 'middle';
  const body = `<line x1="${L}" x2="${W - R}" y1="30" y2="30" class="g"/>
    <line x1="${f1(Math.min(xa, xb))}" x2="${f1(Math.max(xa, xb))}" y1="30" y2="30" class="db-link${better === false ? ' warm' : ''}"/>
    <circle cx="${f1(xb)}" cy="30" r="5" class="db-off"/>
    <circle cx="${f1(xa)}" cy="30" r="6" class="db-on"/>
    <text x="${f1(xa)}" y="15" class="db-t on" text-anchor="${ta}">${esc(fmt(a))}</text>
    <text x="${f1(xb)}" y="15" class="db-t" text-anchor="${tb}">${esc(fmt(b))}</text>`;
  return svg(W, H, body, 'db');
}

// ---------- calendar heatmap ----------
export function calendar(o) {
  const { days, value, W, tip, open = true } = o; // value(day) → 0..100 or null
  if (!days.length) return '';
  const first = days[0]; const lead = (dObj(first).getUTCDay() + 6) % 7;
  const cols = 7; const gap = 4; const cs = Math.min(40, Math.floor((W - gap * (cols - 1)) / cols));
  const rows = Math.ceil((lead + days.length) / 7);
  const Wd = cs * cols + gap * (cols - 1); const top = 18; const H = top + rows * (cs + gap);
  let body = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((t, i) => `<text x="${i * (cs + gap) + cs / 2}" y="12" class="xl" text-anchor="middle">${t}</text>`).join('');
  const tips = [];
  days.forEach((d, j) => {
    const k = lead + j; const c = k % 7; const r = Math.floor(k / 7);
    const x = c * (cs + gap); const y = top + r * (cs + gap); const v = value(d);
    const step = v == null ? null : Math.min(4, Math.floor(v / 20));
    const dd = dObj(d).getUTCDate();
    body += v == null
      ? `<rect x="${x + 0.5}" y="${y + 0.5}" width="${cs - 1}" height="${cs - 1}" rx="7" class="cell-empty"/>`
      : `<rect x="${x}" y="${y}" width="${cs}" height="${cs}" rx="7" style="fill:color-mix(in srgb, var(--primary) ${[16, 34, 52, 72, 92][step]}%, var(--surface))"/>`;
    body += `<text x="${x + cs / 2}" y="${y + cs / 2 + 4}" text-anchor="middle" class="cal-d${step >= 3 ? ' inv' : ''}">${dd === 1 ? MONTHS[dObj(d).getUTCMonth()] : dd}</text>`;
    tips.push(tip ? tip(d, v) : { title: longDate(d), rows: [['Score', v ?? '–']], day: d });
    body += `<rect class="hit" data-c="__ID__" data-i="${j}" x="${x}" y="${y}" width="${cs}" height="${cs}"/>`;
  });
  const id = reg(tips, open);
  const legend = `<div class="clegend scale"><span>Lower</span>${[16, 34, 52, 72, 92].map((p) => `<i style="background:color-mix(in srgb, var(--primary) ${p}%, var(--surface))"></i>`).join('')}<span>Higher</span><span class="clegend-gap"></span><i class="empty"></i><span>Not logged</span></div>`;
  return chartWrap(svg(Wd, H, body.replaceAll('__ID__', id), 'ch-cal'), 'cal-wrap') + legend;
}

// ---------- habit grid ----------
export function habitRows(rows, days, W) {
  const many = days.length > 31;
  const lw = Math.min(150, Math.round(W * 0.38)); const nw = 44; const gw = W - lw - nw - 8;
  const cw = gw / Math.max(1, days.length); const r = Math.max(2, Math.min(7, cw / 2 - 1.5));
  return `<div class="habits">${rows.map((h) => {
    let cells = '';
    if (many) {
      const pct = h.of ? h.hits / h.of : 0;
      cells = svg(gw, 18, `<rect x="0" y="5" width="${gw}" height="8" rx="4" class="track"/><rect x="0" y="5" width="${f1(Math.max(pct ? 8 : 0, pct * gw))}" height="8" rx="4" style="fill:var(--primary)"/>`);
    } else {
      cells = svg(gw, 20, h.cells.map((c, i) => {
        const cx = f1((i + 0.5) * cw);
        return c == null ? '' : c ? `<circle cx="${cx}" cy="10" r="${r}" style="fill:var(--primary)"/>` : `<circle cx="${cx}" cy="10" r="${Math.max(1.5, r - 1)}" class="miss"/>`;
      }).join(''));
    }
    return `<div class="hrow"><span class="hl" style="width:${lw}px">${esc(h.label)}</span>${cells}<span class="hn">${h.hits}<small>/${h.of}</small></span></div>`;
  }).join('')}</div>`;
}

const chartWrap = (inner, cls = '') => `<div class="chart ${cls}">${inner}</div>`;

// ---------- interaction: tap / drag for detail ----------
let tipEl = null; let active = null; let scrubbing = false;
function hideTip() {
  tipEl?.remove(); tipEl = null;
  active?.querySelector('.xh')?.classList.remove('on'); active = null;
}
function showTip(hit) {
  const id = hit.dataset.c; const i = Number(hit.dataset.i); const r = REG.get(id); if (!r) return;
  const t = r.tips[i]; if (!t) return;
  const wrap = hit.closest('.chart'); const svgEl = hit.ownerSVGElement;
  if (active && active !== wrap) active.querySelector('.xh')?.classList.remove('on');
  active = wrap;
  const x = Number(hit.getAttribute('x') ?? hit.getAttribute('cx')) + (hit.getAttribute('width') ? Number(hit.getAttribute('width')) / 2 : 0);
  const xh = svgEl.querySelector('.xh');
  if (xh && hit.tagName === 'rect' && !svgEl.classList.contains('ch-cal')) { xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.classList.add('on'); }
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'ctip'; }
  tipEl.innerHTML = `<strong>${esc(t.title)}</strong>${(t.rows || []).map(([k, v]) => `<span>${k ? `${esc(k)} ` : ''}<b>${esc(v)}</b></span>`).join('')}${t.note ? `<em>${esc(t.note)}</em>` : ''}${r.open && t.day ? `<button type="button" data-act="open-day" data-day="${t.day}">Open day ›</button>` : ''}`;
  if (tipEl.parentElement !== wrap) wrap.appendChild(tipEl);
  const svgLeft = svgEl.getBoundingClientRect().left - wrap.getBoundingClientRect().left;
  const tw = tipEl.offsetWidth; const ww = wrap.clientWidth; const px = svgLeft + x;
  // sit beside the crosshair, on whichever side has room, so the point stays visible
  const left = px > ww / 2 ? px - tw - 10 : px + 10;
  tipEl.style.left = `${Math.max(0, Math.min(ww - tw, left))}px`;
}
export function initCharts(root) {
  root.addEventListener('pointerdown', (e) => {
    const hit = e.target.closest?.('.hit');
    if (hit) { scrubbing = e.pointerType !== 'mouse'; showTip(hit); return; }
    if (!e.target.closest?.('.ctip')) hideTip();
  });
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { const h = e.target.closest?.('.hit'); if (h) showTip(h); return; }
    if (!scrubbing) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const h = el?.closest?.('.hit'); if (h && h.closest('.chart') === active) showTip(h);
  });
  const stop = () => { scrubbing = false; };
  root.addEventListener('pointerup', stop); root.addEventListener('pointercancel', stop);
  root.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideTip(); });
}
export const closeTip = hideTip;
