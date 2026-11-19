import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Life Plan — the Basil Playground.
// action "story": reads one story in full and pulls out its best material. Every quote is checked
//   word for word against the text, so only his real lines ever appear.
// action "heart": reads one story again for its most moving passages and adds them to that story's entry.
// action "extras": finds the recurring cast (by searching every story's text) and writes dossiers, plus maps every place.
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

const HEART_SCHEMA = S({
  heart_note: str,
  moments: arr(S({ title: str, passage: str, setup: str, why: str,
    feeling: { type: "string", enum: ["tenderness", "loyalty", "courage", "grief", "longing", "redemption", "sacrifice", "joy", "homecoming", "farewell"] },
    intensity: int })),
});
const HEART_PROMPT = `You are a perceptive literary editor reading one complete story from Simon's "Basil Ruffletum: Brief Cases" comic-adventure series. Behind the comedy these stories carry real feeling, and your job is to find the passages that land hardest emotionally: the ones that bring a lump to the throat or a tear to the eye. They are for a private page where Simon revisits the best of his own writing.
Rules for passages: copy them EXACTLY, character for character, from the text, as one continuous passage of 25 to 160 words (it may run across consecutive paragraphs). Never paraphrase, trim the middle, or stitch together separate places. Choose the passage that contains the emotional turn itself, not the build-up to it.
- moments: the 2 to 4 most moving passages, strongest first. If the story is lighter and has only one or two real moments, return only those: never inflate a passing line into a big moment.
  - title: a short, quiet name for the moment (e.g. "The Last Dance in the Kitchen").
  - setup: one or two sentences of context so the passage hits even out of place.
  - why: one or two sentences on the craft of why it lands (the restraint, the callback, the image, the timing), naming specifics.
  - feeling: the emotion at its core. intensity: honest 1-5, where 5 is a genuine lump in the throat.
- heart_note: one paragraph, in British English, on where this story keeps its heart: what it's really about underneath the caper.`;

async function runHeart(uid: string, itemId: string, sec: Record<string, string>) {
  const { text, story } = await readStory(uid, itemId);
  const r = await ai(sec, HEART_PROMPT, `STORY: ${story}\n${text.slice(0, 190000)}`, HEART_SCHEMA, "story_heart");
  const full = norm(text);
  const moving = (r.moments ?? []).filter((m: any) => m.passage && norm(m.passage).length > 40 && full.includes(norm(m.passage)))
    .map((m: any) => ({ ...m, intensity: Math.max(1, Math.min(5, Number(m.intensity) || 3)) }));
  const { data: row } = await admin.from("playground").select("id,data").eq("user_id", uid).eq("item_id", itemId).eq("kind", "story").single();
  if (!row) throw new Error("read the story into the Playground first");
  const { error } = await admin.from("playground").update({ data: { ...row.data, moving, heart_note: r.heart_note } }).eq("id", row.id);
  if (error) throw error;
  return { story, moving: moving.length, dropped: (r.moments ?? []).length - moving.length };
}

const CANON_SCHEMA = S({
  tagline: str,
  essay: arr(str),
  signature_moves: arr(S({ name: str, description: str })),
  evolution: str,
  lineage: str,
  awards: arr(S({ category: str, story: str, why: str })),
  pep_talks: arr(str),
  blurbs: arr(S({ persona: str, text: str })),
  heart: arr(str),
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
- heart: 2 paragraphs on the emotional core of the canon: what the stories care about underneath the comedy, how they earn their moving moments, and which ones hit hardest (name them).
- blurbs: 6 imagined back-cover quotes from clearly fictional personas (e.g. "a bookseller in a seaside town"), never real people or publications.`;

async function readStory(uid: string, itemId: string) {
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
  return { item, shelf, vol, chapters, epigraphs, text, words, story };
}

async function runStory(uid: string, itemId: string, sec: Record<string, string>) {
  const { shelf, vol, chapters, epigraphs, text, words, story } = await readStory(uid, itemId);
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
    characters: x.characters, places: x.places, scores: x.scores, standout: [...(x.funniest || []).slice(0, 3).map((f: any) => f.quote), ...(x.basilisms || []).slice(0, 2)],
    heart: x.heart_note, moving: (x.moving || []).map((m: any) => `${m.title} (${m.feeling}, ${m.intensity}/5)`) }));
  const r = await ai(sec, CANON_PROMPT, `TOTALS ${JSON.stringify(totals)}\nSTORY NOTES\n${JSON.stringify(notes)}`, CANON_SCHEMA, "canon_playground");
  await admin.from("playground").delete().eq("user_id", uid).eq("kind", "canon");
  const { error } = await admin.from("playground").insert({ user_id: uid, kind: "canon", data: { ...r, totals }, model: sec.openai_model || "gpt-5-mini" });
  if (error) throw error;
  return { ok: true };
}

const CAST_SCHEMA = S({
  characters: arr(S({ name: str, role: str, tagline: str, portrait: str, arc: str, with_basil: str })),
  duo: S({ title: str, overview: str }),
});
const CAST_PROMPT = `You are a warm, perceptive editor writing character dossiers for Simon's "Basil Ruffletum: Brief Cases" comic-adventure series, for a private celebration page.
You get the recurring characters (found by searching every story), with how often they appear, editor's notes from each story and the most moving moments they are part of. Entries are grouped by name, so a group can mix different people who share a name (e.g. two different Hectors): only write dossiers for genuinely recurring characters (the same person across stories); if a group mixes people, write about the one who genuinely recurs or skip it. Give each character's usual name only, with no brackets or lists of variants. Basil Ruffletum himself comes first.
Be specific and true to the notes, in British English: name stories and moments. Never invent plot you weren't given.
- characters: up to 10, most important first. role: a few words. tagline: one witty line. portrait: one paragraph on who they are and what they bring. arc: one paragraph on how they change across the canon. with_basil: one or two sentences on their dynamic with Basil (for Basil himself, what makes him tick).
- duo: Basil and Liss as a partnership. title: a short name for the pairing; overview: one paragraph on how their relationship grows across the canon.`;

const ATLAS_SCHEMA = S({ places: arr(S({ i: int, label: str, country: str, lat: { type: "number" }, lng: { type: "number" }, real: { type: "boolean" } })) });
const ATLAS_PROMPT = `For each place name given (settings from a comic-adventure series), return its location for a world map.
- i: the number given with the place. label: a short display name (e.g. "Brussels"). country: the country (or "At sea" etc.).
- lat/lng: decimal coordinates of the place, or of the nearest real city or region it sits in (e.g. a named hotel or museum gets its city's coordinates). For places at sea or in the air, use the nearest sensible point.
- real: false only if the place is entirely fictional with no real-world anchor (then give your best guess of the region it is set in, or 0,0).`;

async function runExtras(uid: string, sec: Record<string, string>) {
  const { data: rows } = await admin.from("playground").select("item_id,data").eq("user_id", uid).eq("kind", "story");
  const stories = (rows ?? []).map((r: any) => ({ itemId: r.item_id, ...r.data })).sort((a: any, b: any) => a.volNum - b.volNum || a.num - b.num);
  if (!stories.length) throw new Error("no stories analysed yet");
  // full texts, to count real appearances
  const texts: Record<string, string> = {};
  for (const st of stories) {
    const { data: it } = await admin.from("library_items").select("content").eq("id", st.itemId).single();
    texts[st.itemId] = ((it?.content?.chapters ?? []) as any[]).flatMap((c) => (c.paras || []).map(unhtml)).join("\n");
  }
  const TITLES = new Set(["Inspector", "Madame", "Monsieur", "Mr", "Mrs", "Ms", "Miss", "Dr", "Doctor", "Lord", "Lady", "Sir", "Dame", "Captain", "Professor", "Detective", "Chief", "Sergeant", "Don", "Doña", "Señor", "Señora", "Signor", "Herr", "Frau", "Father", "Brother", "Sister", "Colonel", "Major", "General", "Count", "Countess", "Baron", "Baroness", "Duke", "Duchess", "Prince", "Princess", "King", "Queen", "Uncle", "Aunt", "The"]);
  const clean = (n: string) => n.replace(/\(.*?\)/g, "").trim();
  const groups: Record<string, { names: Set<string>; notes: any[] }> = {};
  for (const st of stories) for (const c of st.characters || []) {
    const n = clean(c.name || ""); const toks = n.split(/\s+/);
    const first = TITLES.has(toks[0].replace(/\.$/, "")) && toks[1] ? toks[1] : toks[0];
    if (!first || first.length < 3 || !/^[A-Z]/.test(first)) continue;
    (groups[first] ||= { names: new Set(), notes: [] }).names.add(n);
    groups[first].notes.push({ story: st.story, note: c.note });
  }
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cast = Object.entries(groups).map(([first, g]) => {
    const re = new RegExp(`\\b${esc(first)}\\b`, "g");
    const appearances = stories.map((st: any) => ({ story: st.story, vol: st.volNum, num: st.num, mentions: (texts[st.itemId].match(re) || []).length }))
      .filter((a: any) => a.mentions >= 3);
    const one = new RegExp(`\\b${esc(first)}\\b`);
    const moving = stories.flatMap((st: any) => (st.moving || []).filter((m: any) => one.test(m.passage) || one.test(m.setup)).map((m: any) => `${st.story}: ${m.title}`));
    return { key: first, names: [...g.names], appearances, notes: g.notes, moving };
  }).filter((c) => c.appearances.length >= 3).sort((a, b) => b.appearances.length - a.appearances.length).slice(0, 14);
  const places = [...new Set(stories.flatMap((st: any) => st.places || []))];
  const [castR, atlasR] = await Promise.all([
    ai(sec, CAST_PROMPT, JSON.stringify(cast.map((c) => ({ ...c, appearances: c.appearances.map((a: any) => `${a.story} (Vol ${a.vol}, ${a.mentions} mentions)`) }))), CAST_SCHEMA, "cast"),
    ai(sec, ATLAS_PROMPT, places.map((p, i) => `${i}: ${p}`).join("\n"), ATLAS_SCHEMA, "atlas"),
  ]);
  // attach the counted appearances to each dossier
  const characters = (castR.characters ?? []).map((ch: any) => {
    const name = clean(ch.name).split(/\s*\/\s*/)[0]; const toks = name.split(/\s+/);
    const keys = [toks[0], toks[1], toks[toks.length - 1]].filter(Boolean);
    const c = keys.map((k) => cast.find((x) => x.key === k)).find(Boolean);
    return { ...ch, name, key: c?.key ?? toks[0], appearances: c?.appearances ?? [] };
  });
  const byPlace: Record<string, string[]> = {};
  for (const st of stories) for (const pl of st.places || []) (byPlace[pl] ||= []).push(st.itemId);
  const atlas = (atlasR.places ?? []).map((p: any) => ({ ...p, place: places[p.i] }))
    .filter((p: any) => p.place && byPlace[p.place] && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0))
    .map((p: any) => ({ ...p, items: [...new Set(byPlace[p.place])] }));
  const data = { characters, duo: castR.duo, atlas };
  await admin.from("playground").delete().eq("user_id", uid).eq("kind", "extras");
  const { error } = await admin.from("playground").insert({ user_id: uid, kind: "extras", data, model: sec.openai_model || "gpt-5-mini" });
  if (error) throw error;
  return { ok: true, characters: characters.length, places: atlas.length };
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
    if (body.action === "heart") return json({ ok: true, ...(await runHeart(uid, body.itemId, sec)) });
    if (body.action === "canon") return json(await runCanon(uid, sec));
    if (body.action === "extras") return json(await runExtras(uid, sec));
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});
