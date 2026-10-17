// Snapshots reach/engagement for each Page's recent posts (pilot Pages + the read-only control).
// Meta retires insight metrics from time to time, so every metric is requested on its own and a
// failure just leaves that column empty (and is logged once) instead of failing the run.
import { PILOT_PAGES, CONTROL_PAGES, type PilotPage } from "./config";
import { g, pageToken } from "./graph";
import { sql } from "./db";

const SINCE_HOURS = 96;
const unsupported = new Set<string>();

async function metric(id: string, name: string, token: string): Promise<number | null> {
  if (unsupported.has(name)) return null;
  try {
    const r = await g<any>(`${id}/insights?metric=${name}`, token);
    const v = r.data?.[0]?.values?.[0]?.value ?? r.data?.[0]?.total_value?.value;
    return typeof v === "number" ? v : null;
  } catch (e) {
    const msg = (e as Error).message;
    // "metric not supported" style errors are permanent for that metric; transient ones are not cached.
    if (/valid insights metric|not supported|deprecated|must be one of/i.test(msg)) { unsupported.add(name); console.warn(`metric ${name} unavailable: ${msg.slice(0, 120)}`); }
    return null;
  }
}
const first = async (id: string, names: string[], token: string) => { for (const n of names) { const v = await metric(id, n, token); if (v !== null) return v; } return null; };

// A video's own insights (Facebook reels: the video id, not the post id).
async function videoMetric(videoId: string, name: string, token: string): Promise<number | null> {
  const key = `video:${name}`;
  if (unsupported.has(key)) return null;
  try {
    const r = await g<any>(`${videoId}/video_insights?metric=${name}`, token);
    const v = r.data?.[0]?.values?.[0]?.value;
    return typeof v === "number" ? v : null;
  } catch (e) {
    const msg = (e as Error).message;
    if (/valid insights metric|not supported|deprecated|must be one of/i.test(msg)) { unsupported.add(key); console.warn(`video metric ${name} unavailable: ${msg.slice(0, 120)}`); }
    return null;
  }
}

interface Retention { videoId?: string | null; avgWatchMs?: number | null; watchTotalMs?: number | null; plays?: number | null }

async function store(r: { postId: string; platform: "fb" | "ig"; pageKey: string; control: boolean; created: string; kind: string; reach: number | null; views: number | null; comments: number | null; shares: number | null; saves: number | null; reactions: number | null } & Retention) {
  await sql`INSERT INTO post_metric (post_id, platform, page_key, is_control, kind, post_created_at, reach, views, comments, shares, saves, reactions, video_id, avg_watch_ms, watch_total_ms, plays)
    VALUES (${r.postId}, ${r.platform}, ${r.pageKey}, ${r.control}, ${r.kind}, ${r.created}, ${r.reach}, ${r.views}, ${r.comments}, ${r.shares}, ${r.saves}, ${r.reactions}, ${r.videoId ?? null}, ${r.avgWatchMs ?? null}, ${r.watchTotalMs ?? null}, ${r.plays ?? null})`;
}

async function facebook(p: PilotPage, control: boolean) {
  const t = await pageToken(p.pageId);
  const since = Math.floor(Date.now() / 1000 - SINCE_HOURS * 3600);
  const posts = await g<any>(`${p.pageId}/posts?fields=id,created_time,status_type,shares,attachments{target{id}},comments.limit(0).summary(true),reactions.limit(0).summary(true)&since=${since}&limit=50`, t);
  let n = 0;
  for (const post of posts.data ?? []) {
    // A video post (a reel): its own video id, plays and watch time (the reel's retention).
    const videoId: string | null = post.status_type === "added_video" ? post.attachments?.data?.[0]?.target?.id ?? null : null;
    const watch: Retention = videoId
      ? { videoId, plays: await videoMetric(videoId, "blue_reels_play_count", t), avgWatchMs: await videoMetric(videoId, "post_video_avg_time_watched", t), watchTotalMs: await videoMetric(videoId, "post_video_view_time", t) }
      : {};
    await store({ ...watch, postId: post.id, platform: "fb", pageKey: p.key, control, created: post.created_time, kind: post.status_type ?? "other",
      reach: await first(post.id, ["post_impressions_unique", "post_total_media_view_unique"], t),
      views: await first(post.id, ["post_media_view", "post_impressions"], t),
      comments: post.comments?.summary?.total_count ?? null, shares: post.shares?.count ?? 0, saves: null,
      reactions: post.reactions?.summary?.total_count ?? null });
    n++;
  }
  return n;
}

async function instagram(p: PilotPage) {
  if (!p.instagramId) return 0;
  const t = await pageToken(p.pageId);
  const cutoff = Date.now() - SINCE_HOURS * 3600_000;
  const media = await g<any>(`${p.instagramId}/media?fields=id,timestamp,media_product_type,like_count,comments_count&limit=50`, t);
  let n = 0;
  for (const m of media.data ?? []) {
    if (Date.parse(m.timestamp) < cutoff) continue;
    // A reel: how long viewers watch on average, and all the watch time (the reel's retention).
    const isReel = String(m.media_product_type ?? "").toUpperCase() === "REELS";
    const watch: Retention = isReel ? { avgWatchMs: await metric(m.id, "ig_reels_avg_watch_time", t), watchTotalMs: await metric(m.id, "ig_reels_video_view_total_time", t) } : {};
    await store({ ...watch, postId: m.id, platform: "ig", pageKey: p.key, control: false, created: m.timestamp, kind: (m.media_product_type ?? "other").toLowerCase(),
      reach: await metric(m.id, "reach", t), views: await first(m.id, ["views", "plays"], t),
      comments: m.comments_count ?? null, shares: await metric(m.id, "shares", t), saves: await metric(m.id, "saved", t), reactions: m.like_count ?? null });
    n++;
  }
  return n;
}

const ONLY = process.env.ONLY_PAGE; // a page key, to run one page (testing)
for (const p of PILOT_PAGES) {
  if (ONLY && p.key !== ONLY) continue;
  for (const [name, fn] of [["fb", () => facebook(p, false)], ["ig", () => instagram(p)]] as const) {
    try { console.log(`${p.key} ${name}: ${await fn()} posts snapshotted`); }
    catch (e) { console.error(`${p.key} ${name} failed: ${(e as Error).message}`); process.exitCode = 1; }
  }
}
for (const p of CONTROL_PAGES) { // read-only: insights only, nothing is ever written to Meta
  try { console.log(`${p.key} (control) fb: ${await facebook(p, true)} posts snapshotted`); }
  catch (e) { console.error(`${p.key} control failed: ${(e as Error).message}`); process.exitCode = 1; }
}
if (unsupported.size) console.log("Unavailable metrics:", [...unsupported].join(", "));
