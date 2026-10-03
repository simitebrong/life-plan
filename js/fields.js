// Life Plan — field definitions and scoring.
// Principle: not doing something scores 0, never minus. Only choices you
// actively want to avoid (unhealthy food, late nights, over target) go negative.

export const AREAS = {
  sleep: { label: 'Sleep', color: 'var(--a-sleep)', ref: 45 },
  food:  { label: 'Nutrition', color: 'var(--a-food)', ref: 35 },
  move:  { label: 'Movement', color: 'var(--a-move)', ref: 30 },
  drinks:{ label: 'Drinks', color: 'var(--a-drinks)', ref: 45 },
  rel:   { label: 'Relationship', color: 'var(--a-rel)', ref: 45 },
  mind:  { label: 'Mind & growth', color: 'var(--a-mind)', ref: 60 },
};
export const AREA_ORDER = ['sleep', 'food', 'move', 'drinks', 'rel', 'mind'];

export const CARDS = [
  { id: 'morning', title: 'Morning', area: 'sleep', hint: 'How the night went' },
  { id: 'food', title: 'Food', area: 'food' },
  { id: 'move', title: 'Movement', area: 'move' },
  { id: 'drinks', title: 'Drinks', area: 'drinks' },
  { id: 'rel', title: 'Relationship', area: 'rel' },
  { id: 'mind', title: 'Mind & growth', area: 'mind' },
  { id: 'wellbeing', title: 'How I felt', area: null, hint: 'Recorded for insight, never scored' },
  { id: 'night', title: 'Night', area: 'sleep' },
  { id: 'notes', title: 'Notes', area: null },
];

const o = (v, label, pts = 0, extra = {}) => ({ v, label, pts, ...extra });
const meal = [o('none', 'None', 0), o('healthy', 'Healthy', 5), o('unhealthy', 'Unhealthy', -5)];
const bodyParts = [o('lower', 'Lower body', 5), o('core', 'Core', 5), o('upper', 'Upper body', 5)];
const yesno = (y, n) => [o('yes', 'Yes', y), o('no', 'No', n)];
const decision = [o('positive', 'Positive', 5), o('neutral', 'Neutral', 0), o('negative', 'Negative', -5)];

// Time bands: [upToMinutesExclusive, points]. Last band catches the rest.
// Evening times before noon are treated as after midnight.
export const FIELDS = [
  // Morning
  { id: 'outOfBed', card: 'morning', area: 'sleep', label: 'Out of bed', type: 'time', defaultTime: '06:00',
    bands: [[360, 5], [390, 3], [405, 1], [421, 0], [Infinity, -5]] },
  { id: 'whichBed', card: 'morning', area: 'sleep', label: 'Which bed', type: 'choice',
    options: [o('marital', 'Marital', 10), o('spare', 'Spare', 0)] },
  { id: 'sleepQuality', card: 'morning', area: 'sleep', label: 'Quality of sleep', type: 'choice', scale: true,
    options: [o(1, '1', 0), o(2, '2', 5), o(3, '3', 10), o(4, '4', 15), o(5, '5', 20)] },
  { id: 'morningWood', card: 'morning', area: 'sleep', label: 'Morning wood', type: 'choice',
    options: [o('none', 'None', 0), o('semi', 'Semi', 5), o('full', 'Full mast', 10)] },
  { id: 'morningVitamins', card: 'morning', area: 'food', label: 'Morning vitamins', type: 'choice', options: yesno(5, 0) },

  // Food
  { id: 'breakfast', card: 'food', area: 'food', label: 'Breakfast', type: 'choice', options: meal },
  { id: 'lunch', card: 'food', area: 'food', label: 'Lunch', type: 'choice', options: meal },
  { id: 'snacks', card: 'food', area: 'food', label: 'Snacks', type: 'choice',
    options: [o('none', 'None', 3), o('healthy', 'Healthy', 5), o('unhealthy', 'Unhealthy', -5)] },
  { id: 'dinner', card: 'food', area: 'food', label: 'Dinner', type: 'choice', options: meal },
  { id: 'eveningTreats', card: 'food', area: 'food', label: 'Evening treats', type: 'choice',
    options: [o('none', 'None', 5), o('some', 'Some', 0), o('lots', 'Lots', -5)] },

  // Movement
  { id: 'homeWorkout', card: 'move', area: 'move', label: 'Home workout', type: 'workout',
    // points by how much of the day's target you reached
    bands: [[1, 0], [50, 5], [75, 10], [100, 15], [Infinity, 20]] },
  { id: 'schoolRuns', card: 'move', area: 'move', label: 'School runs', type: 'choice', scale: true,
    options: [o(0, '0', 0), o(1, '1', 5), o(2, '2', 10), o(3, '3', 15), o(4, '4', 20)] },
  { id: 'morningWorkout', card: 'move', area: 'move', label: 'Morning workout', type: 'multi',
    options: [o('none', 'None', 0, { exclusive: true }), ...bodyParts] },
  { id: 'middayWorkout', card: 'move', area: 'move', label: 'Midday workout', type: 'multi',
    options: [o('none', 'None', 0, { exclusive: true }), ...bodyParts] },
  { id: 'club', card: 'move', area: 'move', label: 'Club', type: 'multi',
    options: [o('novisit', 'No visit', 0, { exclusive: true }), o('relax', 'Relaxation', 3), ...bodyParts, o('cardio', 'Cardio', 10)] },
  { id: 'otherActivity', card: 'move', area: 'move', label: 'Other activity', type: 'multi',
    options: [o('none', 'None', 0, { exclusive: true }), o('walk', 'Walk', 2), o('play', 'Play', 2), o('sport', 'Sport', 5),
      o('dance', 'Dance', 2), o('swim', 'Swim', 50, { star: true })] },

  // Drinks
  { id: 'drinkCount', card: 'drinks', area: 'drinks', label: 'Number of drinks', type: 'count' },
  { id: 'firstDrink', card: 'drinks', area: 'drinks', label: 'First drink', type: 'time', defaultTime: '17:00', evening: true,
    hideWhenDry: true,
    bands: [[960, -10], [990, 1], [1020, 2], [1050, 3], [1080, 4], [1110, 5], [1140, 7], [Infinity, 10]] },
  { id: 'lastDrink', card: 'drinks', area: 'drinks', label: 'Last drink', type: 'time', defaultTime: '21:30', evening: true,
    hideWhenDry: true,
    bands: [[1260, 10], [1320, 5], [1350, 0], [1380, -5], [Infinity, -10]] },
  { id: 'spend', card: 'drinks', area: 'drinks', label: 'Spent on alcohol', type: 'money' },
  { id: 'loAlarm', card: 'drinks', area: 'drinks', label: 'Last orders alarm', type: 'choice', options: yesno(10, 0), hideWhenDry: true },
  { id: 'targetAchieved', card: 'drinks', area: 'drinks', label: 'Target limit achieved', type: 'choice', options: yesno(10, 0) },

  // Relationship
  { id: 'intimacy', card: 'rel', area: 'rel', label: 'Intimacy', type: 'choice', scale: true,
    options: [o(1, '1', 0), o(2, '2', 5), o(3, '3', 10), o(4, '4', 15), o(5, '5', 20)] },
  { id: 'release', card: 'rel', area: 'rel', label: 'Release?', type: 'choice', options: yesno(0, 5) },
  // Tracked as a factor for insights; never scored.
  { id: 'cage', card: 'rel', area: null, label: 'Cage', type: 'choice', options: yesno(0, 0) },
  { id: 'stretcher', card: 'rel', area: 'rel', label: 'Stretcher', type: 'choice', options: yesno(5, 0) },
  { id: 'currentDays', card: 'rel', area: 'rel', label: 'Current days', type: 'auto',
    bands: [[8, 0], [15, 5], [22, 10], [29, 15], [Infinity, 20]] },
  { id: 'service', card: 'rel', area: 'rel', label: 'Service', type: 'choice',
    options: [o('none', 'None', 0), o('some', 'Some', 2), o('average', 'Average', 5), o('high', 'High', 10)] },

  // Mind & growth
  { id: 'goals', card: 'mind', area: 'mind', label: 'Goals', type: 'choice',
    options: [o('none', 'None', 0), o('progress', 'Progress', 5), o('achievement', 'Achievement', 10)] },
  { id: 'duolingo', card: 'mind', area: 'mind', label: 'Duolingo', type: 'choice',
    options: [o('none', 'None', 0), o('some', 'Some', 5), o('plenty', 'Plenty', 10)] },
  { id: 'decMH', card: 'mind', area: 'mind', label: 'Mental health', group: 'Decisions & choices', type: 'choice', options: decision },
  { id: 'decFin', card: 'mind', area: 'mind', label: 'Financial', group: 'Decisions & choices', type: 'choice', options: decision },
  { id: 'decCareer', card: 'mind', area: 'mind', label: 'Career', group: 'Decisions & choices', type: 'choice', options: decision },
  { id: 'visualisation', card: 'mind', area: 'mind', label: 'Visualisation', type: 'choice', options: yesno(10, 0) },
  { id: 'fcProject', card: 'mind', area: 'mind', label: 'FC project', type: 'choice',
    options: [o('none', 'None', 0), o('some', 'Some', 10), o('lots', 'Lots', 20)] },
  { id: 'basil', card: 'mind', area: 'mind', label: 'Basil', type: 'multi', cap: 20,
    options: [o('none', 'None', 0, { exclusive: true }), o('written', 'Written', 20), o('read', 'Read', 20),
      o('edited', 'Edited', 20), o('submitted', 'Submitted', 20)] },
  { id: 'social', card: 'mind', area: 'mind', label: 'Social', type: 'choice',
    options: [o('none', 'None', 0), o('arranged', 'Arranged', 5), o('attended', 'Attended', 10)] },
  { id: 'fun', card: 'mind', area: 'mind', label: 'Fun & hobbies', type: 'choice',
    options: [o('none', 'None', 0), o('some', 'Some', 5), o('plenty', 'Plenty', 10)] },
  { id: 'clothes', card: 'mind', area: 'mind', label: 'Clothes & grooming', type: 'choice',
    options: [o('none', 'None', 0), o('basic', 'Basic', 2), o('average', 'Average', 5), o('sharp', 'Sharp', 10)] },
  { id: 'driving', card: 'mind', area: 'mind', label: 'Driving', type: 'choice', options: [o('yes', 'Yes', 50, { star: true }), o('no', 'No', 0)] },

  // How I felt (unscored)
  { id: 'stress', card: 'wellbeing', area: null, label: 'Stress level', type: 'choice', scale: true, low: 'calm', high: 'high',
    options: [0, 1, 2, 3, 4, 5].map((n) => o(n, String(n))) },
  { id: 'ptsd', card: 'wellbeing', area: null, label: 'PTSD triggers', type: 'choice',
    options: ['none', 'low', 'medium', 'severe'].map((v) => o(v, v[0].toUpperCase() + v.slice(1))) },
  { id: 'selfEsteem', card: 'wellbeing', area: null, label: 'Self esteem', type: 'choice', scale: true, low: 'low', high: 'high',
    options: [0, 1, 2, 3, 4, 5].map((n) => o(n, String(n))) },
  { id: 'palpitations', card: 'wellbeing', area: null, label: 'Heart palpitations', type: 'choice',
    options: ['none', 'minor', 'medium', 'severe'].map((v) => o(v, v[0].toUpperCase() + v.slice(1))) },

  // Night
  { id: 'eveningVitamins', card: 'night', area: 'food', label: 'Evening vitamins', type: 'choice', options: yesno(5, 0) },
  { id: 'bedTime', card: 'night', area: 'sleep', label: 'Bed time', type: 'time', defaultTime: '22:30', evening: true,
    bands: [[1320, 10], [1350, 5], [1380, 3], [1410, -5], [Infinity, -10]] },
  { id: 'bedWithJen', card: 'night', area: 'rel', label: 'Bed with Jen', type: 'choice', options: yesno(10, 0) },

  // Notes
  { id: 'notes', card: 'notes', area: null, label: 'Notes', type: 'text' },
];

export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.id, f]));

export const DEFAULT_DRINK_PLAN = [
  { from: '2026-10-05', target: 10 },
  { from: '2026-10-12', target: 9 },
  { from: '2026-10-26', target: 8 },
  { from: '2026-11-09', target: 7 },
  { from: '2026-11-23', target: 6 },
  { from: '2026-12-14', target: 5 },
  { from: '2027-01-04', target: 4 },
];

export const DEFAULT_SETTINGS = {
  drinkPlan: DEFAULT_DRINK_PLAN,
  baselineSpend: 12,
  reminders: { enabled: true, morning: '07:45', evening: '21:30', weeklyReview: { weekday: 0, at: '20:45' } },
  currentDaysStart: null,
  birthday: '1985-10-04',
  workoutPlan: { start: '2026-10-05', base: 400 },
};

// ---------- Home workout ----------
// Points per rep (plank: per second; cardio: 1 per minute + 20 per km)
export const EXERCISES = [
  { id: 'shoulderPress', name: 'Shoulder presses', pts: 1, area: 'upper' },
  { id: 'sideRaises', name: 'Side arm raises', pts: 2, area: 'upper' },
  { id: 'bicepCurls', name: 'Bicep curls', pts: 1, area: 'upper' },
  { id: 'rhomboidPulls', name: 'Rhomboid pulls', pts: 1, area: 'upper' },
  { id: 'tricepDips', name: 'Tricep dips', pts: 3, area: 'upper' },
  { id: 'inclinePushUps', name: 'Incline push ups', pts: 2, area: 'upper' },
  { id: 'crunches', name: 'Crunches', pts: 2, area: 'core' },
  { id: 'heelTouches', name: 'Heel touches', pts: 1, area: 'core' },
  { id: 'legLifts', name: 'Leg lifts', pts: 3, area: 'core' },
  { id: 'hipLifts', name: 'Hip lifts', pts: 2, area: 'core' },
  { id: 'russianTwists', name: 'Russian twists', pts: 2, area: 'core' },
  { id: 'mountainClimbers', name: 'Mountain climbers', pts: 3, area: 'core' },
  { id: 'plank', name: 'Plank', pts: 5, area: 'core', unit: 'sec' },
  // Standing core: counts as Core, but isn't needed for the all-exercises bonus
  { id: 'kneeToElbow', name: 'Standing knee-to-elbow crunch', pts: 1, area: 'core', standing: true },
  { id: 'standingSideCrunch', name: 'Standing side crunch', pts: 1, area: 'core', standing: true },
  { id: 'slowMarches', name: 'Slow standing marches', pts: 1, area: 'core', standing: true },
  { id: 'crossBodyKneeDrive', name: 'Standing cross-body knee drive', pts: 1, area: 'core', standing: true },
  { id: 'torsoRotations', name: 'Standing torso rotations', pts: 1, area: 'core', standing: true },
  { id: 'lateralBends', name: 'Standing lateral bends', pts: 1, area: 'core', standing: true },
  { id: 'singleLegBalance', name: 'Single-leg balance + brace', pts: 1, area: 'core', standing: true, unit: 'sec' },
  { id: 'abdominalBrace', name: 'Standing abdominal brace', pts: 1, area: 'core', standing: true, unit: 'sec' },
  { id: 'squats', name: 'Squats', pts: 2, area: 'lower' },
  { id: 'backwardLunges', name: 'Backward lunges', pts: 3, area: 'lower' },
  { id: 'hydrants', name: 'Hydrants', pts: 2, area: 'lower' },
  { id: 'donkeyKicks', name: 'Donkey kicks', pts: 1, area: 'lower' },
  { id: 'lyingLegRaises', name: 'Lying leg raises', pts: 2, area: 'lower' },
  { id: 'calfRaises', name: 'Calf raises', pts: 1, area: 'lower' },
  { id: 'sumoCalfRaises', name: 'Sumo squat calf raises', pts: 2, area: 'lower' },
];
export const EX = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));
export const EX_GROUPS = [['upper', 'Upper body'], ['core', 'Core'], ['lower', 'Lower body']];
export const ALL_BOX_BONUS = 150;
export const CARDIO_PTS = { perMin: 1, perKm: 20 };

// workout = { morning: {exId: reps}, midday: {exId: reps}, cardio: { mins, km } }
export function exerciseTotals(w) {
  const t = {};
  for (const s of ['morning', 'midday']) for (const [k, v] of Object.entries(w?.[s] || {})) t[k] = (t[k] || 0) + (Number(v) || 0);
  return t;
}
export function workoutBreakdown(w) {
  const totals = exerciseTotals(w);
  const reps = EXERCISES.reduce((s, e) => s + (totals[e.id] || 0) * e.pts, 0);
  const mins = Number(w?.cardio?.mins) || 0; const km = Number(w?.cardio?.km) || 0;
  const cardio = Math.round(mins * CARDIO_PTS.perMin + km * CARDIO_PTS.perKm);
  const main = EXERCISES.filter((e) => !e.standing);
  const boxes = main.filter((e) => totals[e.id] > 0).length + (mins > 0 || km > 0 ? 1 : 0);
  const boxTotal = main.length + 1;
  const bonus = boxes === boxTotal ? ALL_BOX_BONUS : 0;
  return { reps, cardio, bonus, boxes, boxTotal, total: reps + cardio + bonus, totals };
}
export const workoutScore = (w) => workoutBreakdown(w).total;

// 400 on the start date, +25 every 2 days for two weeks (to 550), then +25 a week.
export function workoutTarget(day, plan = DEFAULT_SETTINGS.workoutPlan) {
  const start = plan?.start || '2026-10-05';
  const base = Number(plan?.base) || 400;
  const n = Math.round((Date.parse(day + 'T12:00:00') - Date.parse(start + 'T12:00:00')) / 86400000);
  if (n < 0) return base;
  if (n < 14) return base + 25 * Math.floor(n / 2);
  return base + 150 + 25 * (Math.floor((n - 14) / 7) + 1);
}

export function workoutAreasFor(w, session) {
  const set = new Set();
  for (const [k, v] of Object.entries(w?.[session] || {})) if (v > 0 && EX[k]) set.add(EX[k].area);
  return ['lower', 'core', 'upper'].filter((a) => set.has(a));
}

export function targetFor(day, plan) {
  const steps = [...(plan || DEFAULT_DRINK_PLAN)].sort((a, b) => a.from.localeCompare(b.from));
  let t = steps[0]?.target ?? null;
  for (const s of steps) if (s.from <= day) t = s.target;
  return t;
}

export const timeToMins = (t, evening = false) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  let mins = h * 60 + m;
  if (evening && mins < 12 * 60) mins += 1440;
  return mins;
};
const band = (bands, x) => { for (const [upTo, p] of bands) if (x < upTo) return p; return 0; };

const answered = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

// Days since the last "yes" for Release, counting from the start date if none yet.
export function computeCurrentDays(day, entries, settings) {
  const d = entries[day]?.release;
  if (d === 'yes') return 0;
  const prior = Object.keys(entries).filter((k) => k < day && entries[k]?.release === 'yes').sort();
  const diff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  if (prior.length) return diff(prior[prior.length - 1], day);
  const start = settings.currentDaysStart || Object.keys(entries).filter((k) => answered(entries[k]?.release)).sort()[0] || day;
  return Math.max(1, diff(start, day) + 1);
}

export function fieldPoints(f, v, ctx) {
  if (!answered(v)) return null;
  switch (f.type) {
    case 'choice': return f.options.find((x) => x.v === v)?.pts ?? 0;
    case 'multi': {
      const sum = v.reduce((s, x) => s + (f.options.find((y) => y.v === x)?.pts ?? 0), 0);
      return f.cap != null ? Math.min(sum, f.cap) : sum;
    }
    case 'time': return band(f.bands, timeToMins(v, f.evening));
    case 'auto': return band(f.bands, v);
    case 'workout': {
      const t = ctx.workoutTarget;
      if (!t || !(v > 0)) return null;
      return band(f.bands, (v / t) * 100);
    }
    case 'count': {
      if (v === 0) return 30;
      const t = ctx.target;
      return t != null && v < t ? Math.min(10, 2 * (t - v)) : 0;
    }
    case 'money': {
      const b = ctx.baselineSpend ?? 12;
      if (v === 0) return 10;
      if (v <= b / 2) return 5;
      if (v <= b) return 0;
      return -5;
    }
    default: return null;
  }
}

export function scoreDay(data, ctx) {
  const pts = {}; const counts = {};
  const dry = data.drinkCount === 0;
  for (const f of FIELDS) {
    if (!f.area) continue;
    if (f.id === 'currentDays' && !answered(data.release)) continue;
    if (dry && f.hideWhenDry) continue;
    const p = fieldPoints(f, f.type === 'workout' ? data.workoutScore : data[f.id], ctx);
    if (p === null) continue;
    pts[f.area] = (pts[f.area] || 0) + p;
    counts[f.area] = (counts[f.area] || 0) + 1;
  }
  const areas = {};
  for (const a of AREA_ORDER) {
    if (!counts[a]) continue;
    areas[a] = Math.max(0, Math.min(100, Math.round((Math.max(0, pts[a]) / AREAS[a].ref) * 100)));
  }
  if (dry) areas.drinks = 100;
  const vals = Object.values(areas);
  const overall = vals.length ? Math.round(vals.reduce((s, x) => s + x, 0) / vals.length) : null;
  return { overall, areas, pts };
}

// Wellbeing reading 0-100 (informational only)
export function wellbeingReading(d) {
  const parts = [];
  if (answered(d.stress)) parts.push(1 - d.stress / 5);
  if (answered(d.selfEsteem)) parts.push(d.selfEsteem / 5);
  const sev = { none: 1, low: 0.66, minor: 0.66, medium: 0.33, severe: 0 };
  if (answered(d.ptsd)) parts.push(sev[d.ptsd]);
  if (answered(d.palpitations)) parts.push(sev[d.palpitations]);
  return parts.length ? Math.round((parts.reduce((s, x) => s + x, 0) / parts.length) * 100) : null;
}

export function isAnswered(f, data) {
  if (f.type === 'auto') return answered(data.release);
  if (f.type === 'workout') return data.workoutScore > 0;
  return answered(data[f.id]);
}

export function visibleFields(cardId, data) {
  const dry = data.drinkCount === 0;
  return FIELDS.filter((f) => f.card === cardId && !(dry && f.hideWhenDry));
}
