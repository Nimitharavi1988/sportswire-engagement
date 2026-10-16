// Posts the planned Page comments. Does nothing but LOG ("would post") unless ENGAGEMENT_LIVE=1.
//
// Controls (all env, set as GitHub repo variables; the defaults are the cautious pilot):
//   ENGAGEMENT_LIVE   "1" to really post, anything else (or unset) = dry-run log only
//   LIVE_PAGES        comma list of page keys allowed to post     (default "cricketlive")
//   LIVE_KINDS        comment types allowed                       (default "question,comparison")
//   DAILY_POST_CAP    most comments per Page per rolling 24h      (default 1)
//   PER_RUN_CAP       most comments in one run                    (default 2)
//   IG_COMMENTS_LIVE  "1" to allow Instagram comments too         (default off: paused 2026-10-16, see below)
// Stops the whole run on a Meta rate-limit/spam/block error or after 3 failures in a row.
import { PILOT_PAGES, GRAPH, LIVE } from "./config";
import { g, pageToken } from "./graph";
import { sql } from "./db";

const list = (v: string | undefined, d: string) => (v?.trim() ? v : d).split(",").map((s) => s.trim()).filter(Boolean);
const LIVE_PAGES = list(process.env.LIVE_PAGES, "cricketlive");
const LIVE_KINDS = list(process.env.LIVE_KINDS, "question,comparison");
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const DAILY_CAP = num(process.env.DAILY_POST_CAP, 1);
const PER_RUN_CAP = num(process.env.PER_RUN_CAP, 2);
// Instagram comments are PAUSED (2026-10-16): the main Instagram account was restricted on 2026-10-13 (messaging), the
// same day the bot's first comment went out there (15:47 UTC). The cause is not known; Facebook comments keep running.
const IG_LIVE = process.env.IG_COMMENTS_LIVE === "1";
const MIN_AGE_MIN = 10, MAX_AGE_H = 6;
// Meta error codes that mean "stop": rate limit (4, 17, 32, 613), spam/blocked from acting (368), temporary block (1390008).
const STOP_CODES = new Set([4, 17, 32, 613, 368, 1390008]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => 45_000 + Math.random() * 105_000; // 45-150 s between comments so they don't look scripted

console.log(LIVE ? "LIVE mode: comments will be posted" : "DRY-RUN: nothing will be posted (set ENGAGEMENT_LIVE=1 to go live)");
console.log(`pages=${LIVE_PAGES.join(",")} kinds=${LIVE_KINDS.join(",")} daily cap=${DAILY_CAP} per run=${PER_RUN_CAP}`);

let posted = 0, failures = 0, stop = false;

for (const pageKey of LIVE_PAGES) {
  if (stop) break;
  const page = PILOT_PAGES.find((p) => p.key === pageKey);
  if (!page) { console.warn(`${pageKey}: not in the pilot allow-list (config.ts) - skipped`); continue; }

  const used = (await sql`SELECT count(*)::int n FROM page_comment WHERE page_key=${pageKey} AND status='posted' AND posted_at > now() - interval '24 hours'`)[0].n;
  let room = Math.min(DAILY_CAP - used, PER_RUN_CAP - posted);
  console.log(`${pageKey}: ${used} posted in the last 24h, room for ${Math.max(room, 0)} now`);
  if (room <= 0) continue;

  const plans = await sql`SELECT post_id, platform, kind, text FROM page_comment
    WHERE page_key=${pageKey} AND status='planned' AND kind = ANY(${LIVE_KINDS})
      AND (platform <> 'ig' OR ${IG_LIVE})
      AND right(btrim(text), 1) = '?'
      AND post_created_at < now() - make_interval(mins => ${MIN_AGE_MIN})
      AND post_created_at > now() - make_interval(hours => ${MAX_AGE_H})
    ORDER BY post_created_at DESC LIMIT 10`;
  if (!plans.length) console.log(`${pageKey}: no eligible plans`);

  for (const plan of plans) {
    if (room <= 0 || stop) break;
    const where = `${pageKey} ${plan.platform} ${plan.post_id}`;
    try {
      const t = await pageToken(page.pageId);
      // Facebook: skip if the Page has meanwhile commented beyond the article-link comment.
      if (plan.platform === "fb") {
        const cs = await g<any>(`${plan.post_id}/comments?fields=message,from&limit=25`, t);
        const own = (cs.data ?? []).filter((c: any) => c.from?.id === page.pageId && !/sportswirelive\.com\/article/.test(c.message ?? ""));
        if (own.length) { await sql`UPDATE page_comment SET status='skipped', reason='page already commented' WHERE post_id=${plan.post_id}`; console.log(`${where}: already has a Page comment - skipped`); continue; }
      }
      if (!LIVE) { console.log(`WOULD POST [${plan.kind}] ${where}: ${plan.text}`); room--; continue; }

      // Claim the plan first so two overlapping runs can never post it twice.
      const claim = await sql`UPDATE page_comment SET status='posting' WHERE post_id=${plan.post_id} AND status='planned' RETURNING post_id`;
      if (!claim.length) continue;
      const res = await fetch(`${GRAPH}/${plan.post_id}/comments`, { method: "POST", body: new URLSearchParams({ message: plan.text, access_token: t }) });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || !body.id) {
        const code = Number(body?.error?.code), msg = String(body?.error?.message ?? res.status).slice(0, 160);
        await sql`UPDATE page_comment SET status='failed', reason=${`meta ${code}: ${msg}`} WHERE post_id=${plan.post_id}`;
        console.error(`${where}: FAILED ${code} ${msg}`);
        failures++;
        if (STOP_CODES.has(code) || failures >= 3) { console.error("Stopping: Meta limit/block or repeated failures"); stop = true; process.exitCode = 1; }
        continue;
      }
      failures = 0;
      await sql`UPDATE page_comment SET status='posted', posted_at=now(), posted_comment_id=${body.id} WHERE post_id=${plan.post_id}`;
      console.log(`POSTED ${where}: ${plan.text}`);
      posted++; room--;
      if (room > 0) await sleep(jitter());
    } catch (e) {
      console.error(`${where}: error ${(e as Error).message}`);
      failures++;
      if (failures >= 3) { stop = true; process.exitCode = 1; }
    }
  }
}
console.log(`done: ${LIVE ? posted + " posted" : "dry-run"}, ${failures} failures`);
