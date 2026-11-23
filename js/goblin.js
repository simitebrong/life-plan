// Life Plan — Destroy the Goblin. A layer inside "Stay in the gardens".
// The addiction goblin shouts or sweet-talks; underneath, his real lie is always the same: that you don't
// deserve love, security or safety. Here he gets laughed at, shrunk, kicked off a cliff, glued to a balloon,
// and every lie is crossed out and answered with the truth. You are bigger than him.
// Your own lines and his name live in private settings (settings.gardens.goblin); these defaults are generic.

const MOODS = {
  angry: { label: 'Shouting', blurb: 'Stamping, demanding, furious you won’t do as he says.' },
  sweet: { label: 'Sweet-talking', blurb: 'All charm and silk. “Just a little one, darling.”' },
};
// What he says → the truth. The "deserve" lies are the real engine, so they're in both moods.
const LINES = {
  angry: [
    ['You’ve EARNED it. After the day you’ve had? Pour it!', 'What I’ve earned is a clear head and a good morning. You can’t afford either.'],
    ['Everyone else is having one. Don’t be BORING.', 'Boring is a man with no pension and creaky knees. I’m playing the long game.'],
    ['The timer is for weaklings. Big men don’t wait.', 'Big men wait. Small goblins shout. Look at us both.'],
    ['One more won’t make ANY difference.', 'Every one makes a difference. That’s exactly why you’re so keen.'],
    ['You don’t deserve a calm, safe life. Not you.', 'I deserve to feel safe. I deserve a calm life, and I’m building one, one evening at a time.'],
    ['You’ll mess it up anyway. Why bother?', 'I’ve already done the hard part plenty of times. I don’t need a goblin’s permission to keep going.'],
  ],
  sweet: [
    ['Psst. Just a little one. A nightcap. So civilised.', 'A nightcap is a cosy name for the start of a bad night. No thank you.'],
    ['You’ve been SO good. Treat yourself, darling.', 'Being good is the treat. You’re the bit that undoes it.'],
    ['Doesn’t the evening feel… unfinished?', 'The evening is finished when I say so. And it’s lovely as it is.'],
    ['Remember how warm the second bottle felt?', 'I remember the morning after. You always leave that bit out.'],
    ['Nobody would even notice.', 'I would. At three in the morning. Every time.'],
    ['Who are you kidding? You don’t really deserve love.', 'I deserve love. I’m loved right now, and I’m worth the effort it takes to keep it.'],
  ],
  small: [
    ['I’m not small. You’re just very far away.', 'You’re small. You were always small. I just stopped feeding you.'],
    ['Fine. FINE. Just a sip then? A thimble?', 'Not even a thimble. Off you pop.'],
    ['This is goblin harassment. I’m calling my solicitor.', 'Your solicitor is also a goblin, and he’s also very small.'],
    ['You need me. You’re nothing without me.', 'I’m everything without you. Love, security, safety: all mine, all deserved.'],
  ],
};
const NAMES = ['Gerald', 'Little Dennis', 'Trevor from Accounts', 'Sir Hiccups', 'Nigel the Nuisance', 'Grizelda', 'The Moist One', 'Colin (Unemployed)'];
const ACTIONS = [
  ['kick', 'Kick him off the cliff', 30, 'Over he goes. Lovely technique. He’s clambering back up, smaller and muddier.'],
  ['balloon', 'Glue him to a balloon', 35, 'Superglued to a hot-air balloon and drifting towards Belgium. A smaller one has crept back to complain.'],
  ['shrink', 'Shrink ray', 20, 'Zapped. He’s now roughly the size of a disappointing biscuit.'],
  ['laugh', 'Laugh at him', 20, 'He tried to look scary. It came out as a squeak. Hard to be menacing with that voice.'],
  ['ignore', 'Ignore him', 15, 'Back turned. He hates that more than anything. Look at him sulk.'],
  ['bluff', 'Call his bluff', 25, null],
];
const WINS = [
  'Goblin dispatched. He’s currently somewhere over the North Sea, glued to a balloon, writing a strongly worded letter.',
  'Down he goes. He’ll be back one day, smaller and sillier, and you’ll do this again.',
  'Gone. Not with a bang, with a squeak.',
  'You’re bigger than him. You always were.',
];
const TRUTHS = ['I deserve love.', 'I deserve security.', 'I deserve to feel safe.', 'I am stronger than him, and I will win.'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function createGoblin({ esc, redraw, getContent, setContent, onDone }) {
  const B = { mood: null, power: 100, line: null, truth: null, anim: null, note: '', won: false, claimed: new Set(), name: null, busy: false };
  const gob = () => getContent()?.goblin || {};
  const nameOf = () => B.name || gob().name || 'the Goblin';
  const pool = () => {
    const own = (gob().lines || []).filter((x) => x.says && x.truth).map((x) => [x.says, x.truth]);
    return B.power <= 40 ? [...LINES.small, ...own] : [...LINES[B.mood], ...own];
  };
  const putdowns = () => gob().putdowns || [];
  function nextLine() { const p = pool(); let l = pick(p); if (p.length > 1) while (B.line && l[0] === B.line[0]) l = pick(p); B.line = l; B.truth = null; }

  function start(mood) { B.mood = mood; B.power = 100; B.won = false; B.claimed = new Set(); B.anim = null; B.note = ''; nextLine(); redraw(); }
  function hit(kind) {
    if (B.busy || B.won) return;
    const a = ACTIONS.find((x) => x[0] === kind);
    if (kind === 'bluff') { B.truth = B.line[1]; B.power = Math.max(0, B.power - a[2]); B.note = ''; if (navigator.vibrate) navigator.vibrate(15); redraw(); if (B.power <= 0) setTimeout(win, 1600); return; }
    B.busy = true; B.anim = kind; B.truth = null; B.note = ''; redraw();
    if (navigator.vibrate) navigator.vibrate(kind === 'kick' ? [20, 30, 40] : 15);
    setTimeout(() => {
      B.busy = false; B.anim = null; B.power = Math.max(0, B.power - a[2]);
      const own = putdowns(); B.note = own.length && Math.random() < 0.5 ? pick(own) : a[3];
      if (B.power <= 0) { win(); return; }
      nextLine(); redraw();
    }, kind === 'balloon' || kind === 'kick' ? 1700 : 1200);
  }
  function win() {
    B.won = true; B.anim = 'gone'; B.note = pick(WINS);
    const c = getContent() || {}; const g = c.goblin || {};
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    setContent({ ...c, goblin: { ...g, wins: (g.wins || 0) + 1, last: today } }, true);
    if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50, 60]);
    redraw();
  }

  // ---------- views ----------
  function goblinSVG() {
    const scale = 0.32 + 0.68 * (B.power / 100);
    const angry = B.mood === 'angry'; const small = B.power <= 40;
    const brows = angry ? '<path d="M38 44 52 50M82 44 68 50" stroke="#1f2a1c" stroke-width="3.5" stroke-linecap="round"/>' : '<path d="M38 47q7-5 14-1M68 46q7-4 14 1" stroke="#1f2a1c" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
    const eyes = angry
      ? '<circle cx="46" cy="56" r="6" fill="#fff"/><circle cx="74" cy="56" r="6" fill="#fff"/><circle cx="47" cy="57" r="3" fill="#7a0e0e"/><circle cx="73" cy="57" r="3" fill="#7a0e0e"/>'
      : '<path d="M39 57q7 5 14 0M67 57q7 5 14 0" stroke="#1f2a1c" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M40 57l-3-3M44 59l-1-4M77 59l1-4M81 57l3-3" stroke="#1f2a1c" stroke-width="1.6" stroke-linecap="round"/>';
    const mouth = small ? '<path d="M50 78q10-7 20 0" stroke="#1f2a1c" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M76 68q2 4 0 6" stroke="#7fb6d8" stroke-width="2" fill="none"/>'
      : angry ? '<path d="M46 76q14-8 28 0v4H46z" fill="#3a0d0d"/><path d="M50 76l3 4 3-4M64 76l3 4 3-4" fill="#fff"/>'
      : '<path d="M48 74q12 9 24 0" stroke="#1f2a1c" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M70 73l4-2" stroke="#1f2a1c" stroke-width="2" stroke-linecap="round"/>';
    const prop = B.mood === 'sweet' && !small ? '<g transform="translate(92 92) rotate(18)"><path d="M0 0v22" stroke="#3d6b35" stroke-width="2"/><circle cx="0" cy="-3" r="6" fill="#c2185b"/><circle cx="-3" cy="-6" r="3" fill="#e05a8a"/></g>' : '';
    const skin = angry ? '#7fae4f' : '#8fbf63';
    return `<svg class="gb-svg" viewBox="0 0 120 150" style="--s:${scale}" aria-hidden="true">
      <g class="gb-body">
        <ellipse cx="60" cy="138" rx="${26 * scale + 8}" ry="5" fill="rgba(0,0,0,.12)"/>
        <path d="M38 96q22-10 44 0l6 34q-28 10-56 0z" fill="#5b4636"/>
        <path d="M44 130l-4 10h12l2-10M70 130l2 10h12l-4-10" fill="#3e3026"/>
        <path d="M30 102q-10 6-12 18M90 102q10 6 12 16" stroke="${skin}" stroke-width="7" stroke-linecap="round" fill="none"/>
        <path d="M24 46 4 30l14 28zM96 46l20-16-14 28z" fill="${skin}" stroke="#4f7a31" stroke-width="1.5"/>
        <ellipse cx="60" cy="62" rx="36" ry="34" fill="${skin}" stroke="#4f7a31" stroke-width="1.5"/>
        ${angry ? '<ellipse cx="60" cy="62" rx="36" ry="34" fill="#d23b2a" opacity=".22"/>' : '<ellipse cx="40" cy="70" rx="6" ry="4" fill="#e78fa2" opacity=".6"/><ellipse cx="80" cy="70" rx="6" ry="4" fill="#e78fa2" opacity=".6"/>'}
        ${brows}${eyes}
        <path d="M60 58q-6 12 0 14q6 0 3-4" fill="#6f9c44" stroke="#4f7a31" stroke-width="1.2"/>
        ${mouth}${prop}
        ${B.mood === 'sweet' && !small ? '<path d="M50 96l10 6 10-6-10 4z" fill="#8b1e3f"/>' : ''}
      </g></svg>`;
  }
  function moodPick() {
    const wins = gob().wins || 0;
    return `<p class="gd-kick">Destroy the Goblin</p><h2 class="gd-h">How’s he showing up tonight?</h2>
      <p class="gd-text">Whatever costume he’s wearing, it’s the same small goblin underneath, telling the same old lie: that you don’t deserve love, security or safety. He’s wrong. Let’s show him.</p>
      <div class="gd-choices">${Object.entries(MOODS).map(([k, m]) => `<button type="button" class="gd-choice" data-act="gb-mood" data-v="${k}"><b>${m.label}</b><span class="gb-blurb">${m.blurb}</span></button>`).join('')}</div>
      ${wins ? `<p class="gd-hint center gb-tally">Goblins destroyed so far: <b>${wins}</b>. He’s starting to take it personally.</p>` : ''}
      <div class="gd-row center"><button type="button" class="gd-link" data-act="gb-exit">Back to the gardens</button></div>`;
  }
  function arena() {
    const pct = Math.round(B.power);
    const stage = `<div class="gb-stage${B.anim ? ` gb-${B.anim}` : ''}${B.won ? ' gb-won' : ''}">
      <div class="gb-cliff" aria-hidden="true"></div>
      ${B.anim === 'balloon' ? `<svg class="gb-bln" style="bottom:${Math.round(12 + 128 * (0.32 + 0.68 * B.power / 100))}px" viewBox="0 0 60 90" aria-hidden="true"><path d="M30 4C14 4 6 16 6 28c0 16 14 26 24 30 10-4 24-14 24-30C54 16 46 4 30 4z" fill="#d84c3f"/><path d="M18 10c-6 6-6 16-2 24" stroke="#f3a297" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M26 58h8l-2 6h-4z" fill="#8b3a2f"/><path d="M28 64 22 88M32 64l6 24" stroke="#5b4636" stroke-width="1"/></svg>` : ''}
      ${B.anim === 'shrink' ? '<span class="gb-beam" aria-hidden="true"></span>' : ''}
      ${B.anim === 'laugh' ? '<span class="gb-squeak" aria-hidden="true">squeak!</span>' : ''}
      ${B.won ? '<span class="gb-puff" aria-hidden="true">poof</span>' : `<div class="gb-who">${goblinSVG()}</div>`}
    </div>`;
    const bubble = B.won ? '' : B.truth
      ? `<div class="gb-says lie"><span class="gb-tag">${esc(nameOf())} says</span><s>${esc(B.line[0])}</s></div>
         <div class="gb-truth"><span class="gb-tag">The truth</span>${esc(B.truth)}</div>`
      : `<div class="gb-says"><span class="gb-tag">${esc(nameOf())} says</span>${esc(B.line[0])}</div>`;
    if (B.won) {
      return `<p class="gd-kick">Destroy the Goblin</p>${stage}
        <h2 class="gd-h center">Goblin destroyed.</h2><p class="gd-text center">${esc(B.note)}</p>
        <section class="gd-panel gb-claim"><h2>Now say what’s true</h2><p class="gd-hint">Tap each one as you mean it.</p>
          ${TRUTHS.map((t, i) => `<button type="button" class="gb-truthbtn${B.claimed.has(i) ? ' on' : ''}" data-act="gb-claim" data-i="${i}" aria-pressed="${B.claimed.has(i)}">${B.claimed.has(i) ? '✓ ' : ''}${esc(t)}</button>`).join('')}
          ${B.claimed.size === TRUTHS.length ? '<p class="gb-final">All true. Every word. He never stood a chance.</p>' : ''}</section>
        <p class="gd-hint center gb-tally">Goblins destroyed: <b>${gob().wins || 1}</b></p>
        <div class="gd-row center"><button type="button" class="gd-btn" data-act="gb-exit">Back to the gardens</button><button type="button" class="gd-btn ghost" data-act="gb-again">Another goblin?</button></div>`;
    }
    return `<p class="gd-kick">Destroy the Goblin · ${esc(MOODS[B.mood].label)}</p>
      ${stage}
      <div class="gb-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Goblin power"><span style="width:${pct}%"></span><em>Goblin power ${pct}%</em></div>
      ${bubble}
      ${B.note ? `<p class="gb-note" role="status">${esc(B.note)}</p>` : ''}
      <div class="gb-actions">${ACTIONS.map(([k, l]) => `<button type="button" class="gb-act${k === 'bluff' ? ' truth' : ''}" data-act="gb-hit" data-v="${k}" ${B.busy ? 'disabled' : ''}>${l}</button>`).join('')}</div>
      <div class="gd-row center"><button type="button" class="gd-link" data-act="gb-name">Give him a sillier name</button><button type="button" class="gd-link" data-act="gb-exit">Back to the gardens</button></div>`;
  }
  const view = () => (B.mood ? arena() : moodPick());

  function onClick(act, el) {
    switch (act) {
      case 'gb-mood': start(el.dataset.v); return true;
      case 'gb-hit': hit(el.dataset.v); return true;
      case 'gb-name': { let n = pick(NAMES); while (n === B.name) n = pick(NAMES); B.name = n; B.note = `He is now called ${n}. He hates it.`; redraw(); return true; }
      case 'gb-claim': { const i = Number(el.dataset.i); if (B.claimed.has(i)) B.claimed.delete(i); else { B.claimed.add(i); if (navigator.vibrate) navigator.vibrate(12); } redraw(); return true; }
      case 'gb-again': B.mood = null; B.won = false; B.anim = null; redraw(); return true;
      case 'gb-exit': B.mood = null; B.won = false; B.anim = null; onDone(); return true;
      default: return false;
    }
  }
  function reset() { B.mood = null; B.won = false; B.anim = null; B.busy = false; }
  return { view, onClick, reset };
}
