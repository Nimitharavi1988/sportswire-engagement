// Plans the Page's own comment on its own recent posts/reels. DRY-RUN: nothing is posted to Meta; plans go to page_comment.
//   question -> answers it   comparison -> picks one side, with a reason   loose -> a short reaction
import { PILOT_PAGES } from "./config";
import { g, pageToken } from "./graph";
import { sql } from "./db";
import { askJson, RateLimited } from "./llm";
import { fetchArticle } from "./article";

const MIN_AGE_MIN = 10, MAX_AGE_H = 6;
const DAILY_CAP = 12;     // plans per Page+platform per day
const HOLDOUT_PCT = 30;   // share of eligible posts left without a Page comment, for the with/without comparison
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const RULES = `Write ONE comment (max 220 chars, 0-1 emoji, no hashtags/links) from a sports Page under its own post. Type it first:
- question: has a factual answer -> answer it
- comparison: asks to choose between options -> pick ONE side + one-line reason (sport takes only)
- loose: statement/news -> short natural reaction
Use ONLY facts in the texts below; if unsure or sensitive (politics, religion, deaths, injuries, legal, abuse, betting, a person's character) set c to null. Write a full sentence of at least 8 words that stands on its own (never a bare name, fragment, or a lone Yes/No). No hype words (dynasty, legacy, history, legendary, greatest). Never repeat a fact or number already in the post: add a view, an implication or a different fact from the article. Only call it a question if the post literally asks one; a comparison only if it names the options. Do not pick sides between named players or their fan bases (e.g. Reese vs Clark): set c to null. Reply in plain words that make sense on their own. Never start with Great/Wow/Interesting/Absolutely/Indeed. Fan tone, not a headline.
JSON: {"k":"question|comparison|loose","o":"people|teams|ideas|none" (what a comparison chooses between),"c":string|null,"s":string|null (reason if c is null; never put the comment here)}`;

const cleanReason = (r: string | null | undefined) => (r && r.length <= 70 && !/[!]/.test(r) ? r : "model declined");
const HYPE = /\b(dynasty|legacy|legend(ary)?|greatest|goat|history|historic|unstoppable|masterclass|unreal|insane|mind-?blowing|pure magic|defines?)\b/i;
const SENSITIVE = /\b(died|dies|death|dead|killed|suicide|rape|assault|lawsuit|court|arrested|police|religio\w*|politic\w*|election|government|betting|gambl\w*|racis\w*|abuse)\b/i;

interface Cand { postId: string; platform: "fb" | "ig"; pageKey: string; created: string; caption: string; articleUrl: string | null }

async function plan(c: Cand) {
  const holdout = hash(c.postId) % 100 < HOLDOUT_PCT;
  const save = (status: string, kind: string | null, text: string | null, reason: string | null) =>
    sql`INSERT INTO page_comment (post_id, platform, page_key, post_created_at, holdout, kind, text, status, reason, caption, article_url)
        VALUES (${c.postId}, ${c.platform}, ${c.pageKey}, ${c.created}, ${holdout}, ${kind}, ${text}, ${status}, ${reason}, ${c.caption.slice(0, 600)}, ${c.articleUrl})
        ON CONFLICT (post_id) DO NOTHING`;
  if (holdout) return save("holdout", null, null, null);
  const article = c.articleUrl ? await fetchArticle(c.articleUrl) : null;
  if (SENSITIVE.test(c.caption + " " + (article ?? ""))) return save("skipped", null, null, "sensitive terms");
  const out = await askJson<{ k: string; o?: string; c: string | null; s: string | null }>(
    `${RULES}\n\nPOST TEXT:\n${c.caption.slice(0, 600)}\n\nARTICLE TEXT:\n${article ?? "(not available - use the post text only)"}`);
  if (!out) return; // transient: leave unsaved so the next run retries it
  const text = out.c?.trim() ?? "";
  if (!text) return save("skipped", out.k ?? null, null, cleanReason(out.s));
  if (text.length > 240 || /https?:|www.|#w/.test(text) || /^(great|wow|interesting|absolutely|indeed)\b/i.test(text)) return save("skipped", out.k, null, "failed checks");
  if (text.length < 45 || text.split(/s+/).length < 8) return save("skipped", out.k, null, "too short");
  if (/^(yes|no|yeah|nope)\b[,.!]?/i.test(text)) return save("skipped", out.k, null, "bare yes/no opening");
  if (HYPE.test(text)) return save("skipped", out.k, null, "hype wording");
  if (out.k === "comparison" && out.o === "people") return save("skipped", out.k, null, "picks between people");
  const source = c.caption + " " + (article ?? "");
  const nums = (text.match(/d[d.,]*/g) ?? []).map((n) => n.replace(/[.,]+$/, ""));
  if (nums.some((n) => !source.includes(n))) return save("skipped", out.k, null, "number not in source");
  const check = await askJson<{ ok: boolean }>(
    `SOURCE:
${source.slice(0, 1500)}

COMMENT: ${text}

Is every factual claim in COMMENT supported by SOURCE (opinion and reaction are fine, invented facts, stats, awards or streaks are not)? JSON: {"ok":true|false}`);
  if (!check?.ok) return save("skipped", out.k, null, "claim not supported by source");
  const recent = await sql`SELECT text FROM page_comment WHERE text IS NOT NULL ORDER BY planned_at DESC LIMIT 30`;
  const open = (s: string) => s.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
  if (recent.some((r: any) => open(r.text) === open(text))) return save("skipped", out.k, null, "repeats an earlier opening");
  return save("planned", out.k, text, null);
}

let stop = false;
for (const p of PILOT_PAGES) {
  if (stop) break;
  const t = await pageToken(p.pageId);
  const cands: Cand[] = [];
  const posts = await g<any>(`${p.pageId}/posts?fields=id,message,created_time,comments.limit(10){message,from}&limit=25`, t);
  for (const x of posts.data ?? []) {
    const cs = x.comments?.data ?? [];
    const link = cs.find((c: any) => c.from?.id === p.pageId && /sportswirelive\.com\/article/.test(c.message ?? ""));
    if (!x.message || cs.some((c: any) => c.from?.id === p.pageId && c !== link)) continue; // already has a Page comment beyond the link
    cands.push({ postId: x.id, platform: "fb", pageKey: p.key, created: x.created_time, caption: x.message, articleUrl: link?.message.match(/https?:\/\/\S+/)?.[0] ?? null });
  }
  if (p.instagramId) {
    const media = await g<any>(`${p.instagramId}/media?fields=id,caption,timestamp&limit=25`, t);
    for (const m of media.data ?? []) if (m.caption) cands.push({ postId: m.id, platform: "ig", pageKey: p.key, created: m.timestamp, caption: m.caption, articleUrl: null });
  }
  const done = new Set((await sql`SELECT post_id FROM page_comment`).map((r: any) => r.post_id));
  for (const platform of ["fb", "ig"] as const) {
    if (stop) break;
    const used = (await sql`SELECT count(*)::int n FROM page_comment WHERE page_key=${p.key} AND platform=${platform} AND status IN ('planned','posted') AND planned_at > now() - interval '24 hours'`)[0].n;
    let left = DAILY_CAP - used, made = 0;
    for (const c of cands.filter((c) => c.platform === platform && !done.has(c.postId))) {
      const ageMin = (Date.now() - new Date(c.created).getTime()) / 60000;
      if (ageMin < MIN_AGE_MIN || ageMin > MAX_AGE_H * 60) continue;
      if (left <= 0) break;
      try { await plan(c); } catch (e) { if (e instanceof RateLimited) { console.warn("Rate limited - stopping; next run continues"); stop = true; break; } throw e; }
      made++; left--;
    }
    console.log(`${p.key} ${platform}: ${made} posts reviewed (cap left ${left})`);
  }
}
const recent = await sql`SELECT page_key, platform, status, kind, text, reason FROM page_comment WHERE planned_at > now() - interval '1 hour' ORDER BY planned_at DESC`;
for (const r of recent) console.log(`[${r.page_key} ${r.platform}] ${r.status}${r.kind ? "/" + r.kind : ""}: ${r.text ?? r.reason ?? ""}`);
