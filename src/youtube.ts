// YouTube channel and Shorts measurement through the public YouTube Data API v3 with an API key
// (YOUTUBE_API_KEY, read-only: nothing is written to YouTube). For each channel in config.ts it stores the
// subscriber count in follower_snapshot (platform 'yt') and a snapshot of the public counters of the channel's
// newest uploads in yt_metric. About 4 quota units per channel per run (the daily quota is 10,000).
// Without a key it logs once and exits cleanly, so the workflow stays green until the key is added.
import { YOUTUBE_CHANNELS } from "./config";
import { sql } from "./db";
import { parseChannel, parsePlaylistIds, parseVideos } from "./youtubeParse";

const KEY = process.env.YOUTUBE_API_KEY;
const API = "https://www.googleapis.com/youtube/v3";
const NEWEST = 50; // the newest uploads per channel (about 2 to 3 days of Shorts)

async function api(path: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`${API}/${path}?${new URLSearchParams({ ...params, key: KEY! })}`);
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`YouTube ${path}: ${data?.error?.message ?? res.status}`);
  return data;
}

if (!KEY) {
  console.log("YOUTUBE_API_KEY is not set: skipping YouTube measurement.");
} else {
  for (const ch of YOUTUBE_CHANNELS) {
    try {
      const info = parseChannel(await api("channels", { part: "statistics,contentDetails", forHandle: ch.handle }));
      if (!info) { console.error(`${ch.key}: channel ${ch.handle} not found`); process.exitCode = 1; continue; }
      await sql`INSERT INTO follower_snapshot (account_key, platform, followers, media_count, total_views) VALUES (${ch.key}, 'yt', ${info.subscribers}, ${info.videos}, ${info.views})`;
      let stored = 0;
      if (info.uploadsPlaylist) {
        const ids = parsePlaylistIds(await api("playlistItems", { part: "contentDetails", playlistId: info.uploadsPlaylist, maxResults: String(NEWEST) }));
        if (ids.length) {
          for (const v of parseVideos(await api("videos", { part: "snippet,contentDetails,statistics", id: ids.join(",") }))) {
            await sql`INSERT INTO yt_metric (video_id, channel_key, published_at, title, duration_s, views, likes, comments)
              VALUES (${v.id}, ${ch.key}, ${v.publishedAt}, ${v.title}, ${v.durationS}, ${v.views}, ${v.likes}, ${v.comments})`;
            stored++;
          }
        }
      }
      console.log(`${ch.key}: ${info.subscribers ?? "hidden"} subscribers, ${info.videos} videos, ${info.views} views; ${stored} recent videos snapshotted`);
    } catch (e) {
      console.error(`${ch.key} failed: ${(e as Error).message}`);
      process.exitCode = 1;
    }
  }
}
