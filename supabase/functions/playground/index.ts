import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Life Plan — the Basil Playground.
// action "story": reads one story in full and pulls out its best material. Every quote is checked
//   word for word against the text, so only his real lines ever appear.
// action "canon": reads all the story findings and writes the canon-wide pieces.
// Called by the app with the user's JWT, or by an admin call with the cron secret (+ userId).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function secrets() {
  const { data } = await admin.from("app_secrets").select("key,value");
  return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
}

const unhtml = (s: string) => s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const norm = (s: string) => s.toLowerCase().replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, "-").replace(/…/g, "...")
  .replace(/[^a-z0-9]+/g, " ").trim();

async function ai(sec: Record<string, string>, instructions: string, input: string, schema: object, name: string) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sec.openai_api_key}` },
    body: JSON.stringify({ model: sec.openai_model || "gpt-5-mini", reasoning: { effort: "low" }, instructions, input,
      text: { format: { type: "json_schema", name, schema, strict: true } } }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const out = await res.json();
  const text = (out.output ?? []).find((o: any) => o.type === "message")?.content?.find((c: any) => c.type === "output_text")?.text;
  if (!text) throw new Error("no output");
  return JSON.parse(text);
}

const S = (o: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(o), properties: o });
const str = { type: "string" }; const int = { type: "integer" };
const arr = (items: unknown) => ({ type: "array", items });

const STORY_SCHEMA = S({
  logline: str,
  award: str,
  funniest: arr(S({ quote: str, why: str })),
  finest: arr(S({ quote: str, kind: { type: "string", enum: ["wit", "atmosphere", "wisdom", "menace", "tenderness", "action"] } })),
  basilisms: arr(str),
  set_piece: S({ title: str, description: str }),
  characters: arr(S({ name: str, note: str })),
  places: arr(str),
  strengths: arr(S({ title: str, detail: str })),
  reviews: arr(S({ persona: str, stars: int, text: str })),
  scores: S({ wit: int, invention: int, pace: int, set_pieces: int, atmosphere: int, heart: int }),
});

const STORY_PROMPT = `You are a sharp, generous literary editor who genuinely loves comic adventure fiction. You are reading one complete story from Simon's "Basil Ruffletum: Brief Cases" series (five volumes of ten comic-adventure mysteries starring the gloriously eccentric Basil Ruffletum).
Your job is to find what is genuinely best in it, for a private celebration page Simon visits when he needs a lift. Be specific and true to the text: praise that names real moments is worth far more than adjectives.

Rules for quotes (funniest, finest, basilisms): copy them EXACTLY, character for character, from the text, as continuous passages of 8 to 70 words. Never paraphrase, trim the middle, or stitch sentences from different places. Pick the lines a reader would read aloud to someone else.
- logline: one irresistible sentence selling the story, in British English.
- award: a playful superlative this story wins, e.g. "Most Dignified Use of a Shower Curtain".
- funniest: the 6 to 8 funniest lines or short passages, each with a few words on why it lands.
- finest: 4 to 6 lines of real quality that aren't primarily jokes (atmosphere, wisdom, menace, tenderness, action, or wit).
- basilisms: 3 to 5 lines that are pure Basil.
- set_piece: the single best sequence, named and described in two sentences.
- characters: up to 5 memorable characters with a one-line note. places: the main settings.
- strengths: 3 specific craft strengths, each pointing at a concrete moment.
- reviews: 3 imagined reader reviews in varied, believable voices (e.g. a commuter who missed her stop, a retired magistrate, a sceptical teenager). They are clearly imaginary, so give each a descriptive persona, never a real name or publication. 4 or 5 stars, warm but specific and plausible, never gushing.
- scores: honest 1-10 ratings for wit, invention, pace, set_pieces, atmosphere and heart. Be generous where earned and honest where not, so the numbers mean something.`;

const CANON_SCHEMA = S({
  tagline: str,
  essay: arr(str),
  signature_moves: arr(S({ name: str, description: str })),
  evolution: str,
  lineage: str,
  awards: arr(S({ category: str, story: str, why: str })),
  pep_talks: arr(str),
  blurbs: arr(S({ persona: str, text: str })),
});
const CANON_PROMPT = `You are a celebrated (and fictional) literary critic writing the definitive appraisal of Simon's complete "Basil Ruffletum: Brief Cases" canon, for a private, glamorous celebration page he visits when he needs a lift and a shot of writerly bravado.
You receive editor's notes on every story: loglines, standout lines, set pieces, strengths, characters, places and scores, plus the totals. Write with flair and confidence, in British English, and be specific: name stories, characters, set pieces and recurring tricks. Earned, precise praise beats puffery.
- tagline: one line for the marquee.
- essay: 5 paragraphs appraising the whole canon: what it is, what it does that others don't, its comic engine, its range, and why it deserves readers.
- signature_moves: 6 recurring techniques or pleasures that are distinctly his (give each a catchy name).
- evolution: one paragraph on how the writing grows across the five volumes.
- lineage: one paragraph placing it in the tradition of British comic adventure and mystery writing (comparisons of style, not claims that anyone endorsed it).
- awards: 10 "Ruffletum Awards" categories, each won by a named story, with a one-line citation.
- pep_talks: 12 short, punchy, specific lines of encouragement for the writer, rooted in what he has actually achieved here.
- blurbs: 6 imagined back-cover quotes from clearly fictional personas (e.g. "a bookseller in a seaside town"), never real people or publications.`;

async function runStory(uid: string, itemId: string, sec: Record<string, string>) {
  const { data: item, error } = await admin.from("library_items").select("id,title,content,shelf_id,user_id").eq("id", itemId).single();
  if (error || !item || item.user_id !== uid) throw new Error("story not found");
  const { data: shelf } = await admin.from("shelves").select("name,parent_id").eq("id", item.shelf_id).single();
  const { data: vol } = shelf?.parent_id ? await admin.from("shelves").select("name").eq("id", shelf.parent_id).single() : { data: null };
  const chapters = (item.content?.chapters ?? []) as { title: string; paras: string[] }[];
  const epigraphs: { quote: string; by: string; chapter: string }[] = [];
  let text = ""; let words = 0;
  for (const ch of chapters) {
    text += `\n\n## ${unhtml(ch.title || "")}\n`;
    for (const p of ch.paras || []) {
      const t = unhtml(p).trim(); if (!t) continue;
      if (/^<em>\s*[“"]/.test(p.trim()) && t.includes("—")) {
        const nl = t.lastIndexOf("\n");
        const q = nl > 0 ? t.slice(0, nl) : t.split("—")[0]; const by = nl > 0 ? t.slice(nl + 1).replace(/^\s*—\s*/, "") : t.split("—").slice(1).join("—");
        epigraphs.push({ quote: q.trim().replace(/^[“"]|[”"]$/g, ""), by: by.trim(), chapter: unhtml(ch.title || "") });
      }
      text += t + "\n"; words += t.split(/\s+/).length;
    }
  }
  const story = (shelf?.name || item.title).replace(/^\d+\.\s*/, "");
  const r = await ai(sec, STORY_PROMPT, `STORY: ${story} (${vol?.name ?? ""})\n${text.slice(0, 190000)}`, STORY_SCHEMA, "story_playground");
  // keep only quotes that really are in the text
  const full = norm(text); const real = (q: string) => q && norm(q).length > 12 && full.includes(norm(q));
  r.funniest = (r.funniest ?? []).filter((x: any) => real(x.quote));
  r.finest = (r.finest ?? []).filter((x: any) => real(x.quote));
  r.basilisms = (r.basilisms ?? []).filter(real);
  r.scores = Object.fromEntries(Object.entries(r.scores ?? {}).map(([k, v]) => [k, Math.max(1, Math.min(10, Number(v) || 0))]));
  r.reviews = (r.reviews ?? []).map((x: any) => ({ ...x, stars: Math.max(4, Math.min(5, Number(x.stars) || 5)) }));
  const num = Number((shelf?.name || "").match(/^(\d+)\./)?.[1] || 0);
  const data = { ...r, story, vol: vol?.name ?? "", volNum: Number((vol?.name || "").match(/(\d+)/)?.[1] || 0), num, words, chapters: chapters.length, epigraphs };
  await admin.from("playground").delete().eq("user_id", uid).eq("item_id", itemId).eq("kind", "story");
  const { error: e2 } = await admin.from("playground").insert({ user_id: uid, item_id: itemId, kind: "story", data, model: sec.openai_model || "gpt-5-mini" });
  if (e2) throw e2;
  return { story, funniest: data.funniest.length, finest: data.finest.length, epigraphs: epigraphs.length };
}

async function runCanon(uid: string, sec: Record<string, string>) {
  const { data: rows } = await admin.from("playground").select("data").eq("user_id", uid).eq("kind", "story");
  const stories = (rows ?? []).map((r: any) => r.data).sort((a: any, b: any) => a.volNum - b.volNum || a.num - b.num);
  if (!stories.length) throw new Error("no stories analysed yet");
  const totals = { stories: stories.length, words: stories.reduce((s: number, x: any) => s + x.words, 0), chapters: stories.reduce((s: number, x: any) => s + x.chapters, 0) };
  const notes = stories.map((x: any) => ({ story: x.story, volume: x.vol, logline: x.logline, award: x.award, set_piece: x.set_piece, strengths: x.strengths,
    characters: x.characters, places: x.places, scores: x.scores, standout: [...(x.funniest || []).slice(0, 3).map((f: any) => f.quote), ...(x.basilisms || []).slice(0, 2)] }));
  const r = await ai(sec, CANON_PROMPT, `TOTALS ${JSON.stringify(totals)}\nSTORY NOTES\n${JSON.stringify(notes)}`, CANON_SCHEMA, "canon_playground");
  await admin.from("playground").delete().eq("user_id", uid).eq("kind", "canon");
  const { error } = await admin.from("playground").insert({ user_id: uid, kind: "canon", data: { ...r, totals }, model: sec.openai_model || "gpt-5-mini" });
  if (error) throw error;
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const sec = await secrets();
  try {
    const body = await req.json().catch(() => ({}));
    let uid: string | null = null;
    if (req.headers.get("x-cron-secret")) {
      if (req.headers.get("x-cron-secret") !== sec.cron_secret) return json({ error: "forbidden" }, 403);
      uid = body.userId;
    } else {
      const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
      const { data: u } = await admin.auth.getUser(token); uid = u?.user?.id ?? null;
    }
    if (!uid) return json({ error: "not signed in" }, 401);
    if (body.action === "story") return json({ ok: true, ...(await runStory(uid, body.itemId, sec)) });
    if (body.action === "canon") return json(await runCanon(uid, sec));
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});
