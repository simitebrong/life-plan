import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
// The same analysis code the app's Progress screen runs, loaded from the live site and
// bundled at deploy time, so the review's numbers always match the charts. Redeploy after changing js/analysis.js.
import { weeklySummary, weekStart, addDays } from "https://life-plan-simon.netlify.app/js/analysis.js";
import { FIELDS } from "https://life-plan-simon.netlify.app/js/fields.js";

// Life Plan weekly review.
// Cron mode (x-cron-secret): every 15 min on Sundays; writes the review at the user's chosen time and sends a push.
// User mode (JWT): "Create now" / "Refresh" from the app for a given week.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TEST_USER = "38c51d9f-1a9a-4c1e-9649-f305da6eba81";

function londonNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
  return { day: `${g("year")}-${g("month")}-${g("day")}`, mins: (+g("hour") % 24) * 60 + +g("minute"), weekday: wd };
}
const toMins = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

async function secrets() {
  const { data } = await admin.from("app_secrets").select("key,value");
  return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
}

// A compact guide to every field, so the model reads the raw data correctly
const GLOSSARY = FIELDS.map((f: any) => {
  const opts = f.options ? f.options.map((o: any) => `${JSON.stringify(o.v)}=${o.label}${f.area ? `(${o.pts}pts)` : ""}`).join(", ") : f.type;
  return `${f.id}: ${f.label} [${f.card}${f.area ? `, scored in ${f.area}` : ", not scored"}] ${opts}`;
}).join("\n") + `
workout: home workout reps by session {morning:{exercise:reps}, midday:{...}, cardio:{mins,km}}; workoutScore = points; workoutTarget = that day's target
readSecs / basilReadSecs: seconds spent reading in the app's library (Basil = his own stories)
done: he tapped "Finish my day"
Times: firstDrink/lastDrink/bedTime are evening times (before noon = after midnight). Morning fields (outOfBed, sleepQuality, nightTerrors, snoring, morningWood, whichBed) describe the night before.`;

const INSTRUCTIONS = `You write Simon's weekly review for his personal Life Plan app.
Simon turned 41 on 4 October 2026, lives in Leigh-on-Sea, and is deliberately making his 40s his best decade after a difficult year. He is the only person who sees this.

Tone: warm, positive, motivating and specific, like a perceptive coach who is firmly on his side. Never shaming, never preachy, no guilt. British English, plain words, no emojis, no exclamation marks overload. Speak to him as "you".
Principle of the app: not doing something scores 0, never minus; low areas are opportunities, not failures.

You receive JSON with the week's computed stats, the previous week (if any), habit counts, highlights, every logged field for every day, his notes, upcoming targets, and a list of statistically screened "possible links" from all his data so far.

Write:
- headline: max 90 characters, celebrating the most genuinely impressive concrete thing this week.
- summary: 3-4 sentences giving the shape of the week with specific numbers (score, drinks against target, workouts, sleep, how he felt). Acknowledge hard moments from his notes kindly if relevant.
- wins: 3-5 specific wins, each one short sentence with a number or a day where possible.
- patterns: 2-4 possible links worth watching. Draw on the screened list and your own careful reading of the daily data (including next-day effects, e.g. drinks or bed time and the next morning's sleep). Phrase each as a possibility ("seems to", "might"), include the sample (e.g. "4 v 3 days"), never claim cause. Set confidence to exactly one of: "Early hint", "Emerging pattern", "Consistent pattern" (with under two weeks of data, everything is "Early hint").
- focus: ONE small, concrete, achievable action for the coming week, tied to something in the data, phrased as an invitation.
- look_ahead: 1-2 sentences on what's coming: if the drinks target steps down within 14 days, name the date and the new number and frame it as the next step he's ready for; mention the workout target; end with encouragement.

Rules: use only numbers that are in the data; if few days were logged, say so lightly and keep claims modest. Relationship, intimacy, PTSD, night terrors, palpitations and similar are tracked for insight: mention them matter-of-factly and kindly only where useful, never moralise, never diagnose. Don't mention "the app", JSON, fields or scoring mechanics by their code names.`;

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["headline", "summary", "wins", "patterns", "focus", "look_ahead"],
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    wins: { type: "array", items: { type: "string" } },
    patterns: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "confidence"],
      properties: { text: { type: "string" }, confidence: { type: "string", enum: ["Early hint", "Emerging pattern", "Consistent pattern"] } } } },
    focus: { type: "string" },
    look_ahead: { type: "string" },
  },
};

async function buildReport(uid: string, week: string, sec: Record<string, string>) {
  const [{ data: rows }, { data: st }, { data: goals }] = await Promise.all([
    admin.from("entries").select("day,data").eq("user_id", uid).lte("day", addDays(week, 6)),
    admin.from("settings").select("data").eq("user_id", uid).maybeSingle(),
    admin.from("goals").select("title,cat1,cat2,priority,status,steps,achieved_at").eq("user_id", uid),
  ]);
  const entries = Object.fromEntries((rows ?? []).map((r: any) => [r.day, r.data]));
  const settings = st?.data ?? {};
  const end = addDays(week, 6);
  const goalInfo = {
    active: (goals ?? []).filter((g: any) => g.status === "active").sort((a: any, b: any) => a.priority - b.priority)
      .map((g: any) => ({ title: g.title, priority: g.priority, category: [g.cat1, g.cat2].filter(Boolean).join(" / "),
        stepsDoneThisWeek: (g.steps ?? []).filter((s: any) => s.done && s.doneAt >= week && s.doneAt <= end).map((s: any) => s.text) })),
    achievedThisWeek: (goals ?? []).filter((g: any) => g.status === "achieved" && g.achieved_at >= week && g.achieved_at <= end).map((g: any) => g.title),
  };
  const summary = weeklySummary(entries, settings, week, { goals: goalInfo, today: londonNow().day });
  const model = sec.openai_model || "gpt-5-mini";
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sec.openai_api_key}` },
    body: JSON.stringify({
      model, reasoning: { effort: "low" }, instructions: INSTRUCTIONS,
      input: `FIELD GUIDE\n${GLOSSARY}\n\nWEEK DATA\n${JSON.stringify(summary)}`,
      text: { format: { type: "json_schema", name: "weekly_review", schema: SCHEMA, strict: true } },
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const out = await res.json();
  const msg = (out.output ?? []).find((o: any) => o.type === "message");
  const text = msg?.content?.find((c: any) => c.type === "output_text")?.text;
  if (!text) throw new Error("no output");
  const report = JSON.parse(text);
  const stats = { stats: summary.stats, daily: summary.daily.map((d: any) => ({ day: d.day, logged: d.logged, score: d.score ?? null })), patterns: summary.patterns };
  const { error } = await admin.from("weekly_reports").upsert(
    { user_id: uid, week_start: week, report, stats, model, created_at: new Date().toISOString() }, { onConflict: "user_id,week_start" });
  if (error) throw error;
  return report;
}

async function push(uid: string, payload: object, sec: Record<string, string>) {
  webpush.setVapidDetails("mailto:lifeplan@example.com", sec.vapid_public, sec.vapid_private);
  const { data: subs } = await admin.from("push_subscriptions").select("id,subscription").eq("user_id", uid);
  let sent = 0;
  for (const s of subs ?? []) {
    try { await webpush.sendNotification(s.subscription, JSON.stringify(payload), { TTL: 6 * 3600 }); sent++; }
    catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", s.id); }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const sec = await secrets();
  try {
    if (req.headers.get("x-cron-secret")) {
      if (req.headers.get("x-cron-secret") !== sec.cron_secret) return json({ error: "forbidden" }, 403);
      const now = londonNow();
      const { data: users } = await admin.from("settings").select("user_id,data").neq("user_id", TEST_USER);
      const results: any[] = [];
      for (const u of users ?? []) {
        const wr = { weekday: 0, at: "20:45", ...(u.data?.reminders?.weeklyReview ?? {}) };
        const t = toMins(wr.at);
        if (now.weekday !== wr.weekday || now.mins < t || now.mins >= t + 15) continue;
        const { data: already } = await admin.from("reminder_log").select("day").eq("user_id", u.user_id).eq("kind", "weekly").eq("day", now.day).maybeSingle();
        if (already) continue;
        await admin.from("reminder_log").insert({ user_id: u.user_id, kind: "weekly", day: now.day });
        const week = weekStart(now.day);
        const report = await buildReport(u.user_id, week, sec);
        const sent = u.data?.reminders?.enabled === false ? 0 : await push(u.user_id, { title: "Your weekly review is ready", body: report.headline, url: `/?review=${week}`, tag: "weekly" }, sec);
        results.push({ user: u.user_id, week, sent });
      }
      return json({ ok: true, now, results });
    }
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "not signed in" }, 401);
    const body = await req.json().catch(() => ({}));
    const today = londonNow().day;
    const week = /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart ?? "") ? weekStart(body.weekStart) : weekStart(today);
    const report = await buildReport(u.user.id, week, sec);
    return json({ ok: true, week, report });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});
