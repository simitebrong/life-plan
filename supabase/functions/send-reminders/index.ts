import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Life Plan reminders. Called every 15 minutes by pg_cron (with x-cron-secret),
// or by the signed-in app to send a test notification.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const MORNING = [
  "Good morning. Two taps for sleep and you're off.",
  "Morning! How did you sleep? Log it while it's fresh.",
  "New day, new chance. Quick morning check-in?",
  "Morning, Simon. Sleep, bed, vitamins: 20 seconds.",
];
const EVENING = [
  "Evening check-in time. Five minutes for future you.",
  "How did today go? Capture it before bed.",
  "Wind-down moment: log the day and see your score.",
  "Time to close the day. Every entry is a step forward.",
];
const CATCH_UP = [
  "Yesterday isn't finished yet. Tap to fill it in while you remember.",
  "Morning. Yesterday's check-in is waiting. A minute now keeps the picture complete.",
  "Quick catch-up? Yesterday still has gaps. Tap to finish it, then log this morning.",
];
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];

function londonNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return { day: `${g("year")}-${g("month")}-${g("day")}`, mins: (+g("hour") % 24) * 60 + +g("minute") };
}
const toMins = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const prevDay = (iso: string) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

// A day counts as unfinished if it was never logged, or it wasn't finished and has few answers.
const answeredCount = (d: Record<string, unknown>) =>
  Object.keys(d).filter((k) => !k.startsWith("_") && !["notes", "done", "currentDays", "targetAchieved"].includes(k)).length;
const isUnfinished = (d: Record<string, unknown> | null) => !d || (!d.done && answeredCount(d) < 20);

async function secrets() {
  const { data } = await admin.from("app_secrets").select("key,value");
  return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
}

async function sendTo(userId: string, payload: object) {
  const { data: subs } = await admin.from("push_subscriptions").select("id,subscription").eq("user_id", userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      console.error("push error", e?.statusCode, e?.body);
    }
  }
  return sent;
}

async function getEntry(uid: string, day: string) {
  const { data } = await admin.from("entries").select("data").eq("user_id", uid).eq("day", day).maybeSingle();
  return (data?.data ?? null) as Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sec = await secrets();
  webpush.setVapidDetails("mailto:lifeplan@example.com", sec.vapid_public, sec.vapid_private);
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

  // Cron mode
  if (req.headers.get("x-cron-secret")) {
    if (req.headers.get("x-cron-secret") !== sec.cron_secret) return json({ error: "forbidden" }, 403);
    const now = londonNow();
    const yesterday = prevDay(now.day);
    const { data: subUsers } = await admin.from("push_subscriptions").select("user_id");
    const users = [...new Set((subUsers ?? []).map((r: any) => r.user_id))];
    const results: any[] = [];
    for (const uid of users) {
      const { data: st } = await admin.from("settings").select("data").eq("user_id", uid).maybeSingle();
      const r = st?.data?.reminders ?? {};
      if (r.enabled === false) continue;
      const slots = [
        { kind: "morning", at: r.morning ?? "07:45" },
        { kind: "evening", at: r.evening ?? "21:30" },
      ];
      for (const slot of slots) {
        const t = toMins(slot.at);
        if (now.mins < t || now.mins >= t + 15) continue;
        const { data: already } = await admin.from("reminder_log").select("day").eq("user_id", uid).eq("kind", slot.kind).eq("day", now.day).maybeSingle();
        if (already) continue;
        const log = () => admin.from("reminder_log").insert({ user_id: uid, kind: slot.kind, day: now.day });
        const today = (await getEntry(uid, now.day)) ?? {};
        let payload: Record<string, string> | null = null;

        if (slot.kind === "morning") {
          if (today.sleepQuality != null) { await log(); continue; } // already in the app this morning
          // Catch-up nudge only once you've started using the app (an entry exists on or before yesterday)
          const { data: first } = await admin.from("entries").select("day").eq("user_id", uid).lte("day", yesterday).order("day").limit(1);
          const started = (first ?? []).length > 0;
          if (started && isUnfinished(await getEntry(uid, yesterday))) {
            payload = { title: "Life Plan", body: pick(CATCH_UP), url: `/?day=${yesterday}`, tag: "morning" };
          } else {
            payload = { title: "Life Plan", body: pick(MORNING), url: "/?card=morning", tag: "morning" };
          }
        } else {
          if (today.done) { await log(); continue; }
          payload = { title: "Life Plan", body: pick(EVENING), url: "/?card=food", tag: "evening" };
        }
        const sent = await sendTo(uid, payload);
        await log();
        results.push({ uid, kind: slot.kind, url: payload.url, sent });
      }
    }
    return json({ ok: true, now, results });
  }

  // Test mode from the app (signed-in user)
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return json({ error: "not signed in" }, 401);
  const sent = await sendTo(u.user.id, { title: "Life Plan", body: "Reminders are working. See you at 07:45 and 21:30.", url: "/", tag: "test" });
  return json({ ok: true, sent });
});
