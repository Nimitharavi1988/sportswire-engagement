import { sql } from "./db";
await sql`CREATE TABLE IF NOT EXISTS comment (
  id TEXT PRIMARY KEY,               -- platform comment id
  platform TEXT NOT NULL,            -- 'fb' | 'ig'
  page_key TEXT NOT NULL,
  post_id TEXT NOT NULL,
  parent_id TEXT,                    -- set for replies to a comment
  author_id TEXT,
  author_name TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  by_page BOOLEAN NOT NULL DEFAULT false,   -- written by our own Page/account
  label TEXT,                        -- praise | question | debate | spam | abuse | other
  decision TEXT,                     -- like | reply | hide | queue | none
  planned_reply TEXT,
  acted_at TIMESTAMPTZ
)`;
await sql`CREATE INDEX IF NOT EXISTS comment_page_created ON comment (page_key, created_at DESC)`;
await sql`CREATE TABLE IF NOT EXISTS post_metric (
  post_id TEXT NOT NULL, platform TEXT NOT NULL, page_key TEXT NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(), post_created_at TIMESTAMPTZ NOT NULL,
  reach INT, comments INT, shares INT, saves INT, reactions INT,
  PRIMARY KEY (post_id, taken_at)
)`;
console.log("migrated");
await sql`ALTER TABLE post_metric ADD COLUMN IF NOT EXISTS views INT`;
await sql`ALTER TABLE post_metric ADD COLUMN IF NOT EXISTS is_control BOOLEAN NOT NULL DEFAULT false`;
await sql`ALTER TABLE post_metric ADD COLUMN IF NOT EXISTS kind TEXT`;
await sql`CREATE TABLE IF NOT EXISTS page_comment (
  post_id TEXT PRIMARY KEY, platform TEXT NOT NULL, page_key TEXT NOT NULL,
  post_created_at TIMESTAMPTZ NOT NULL, planned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  holdout BOOLEAN NOT NULL DEFAULT false,
  kind TEXT, text TEXT, status TEXT NOT NULL, reason TEXT, caption TEXT, article_url TEXT,
  posted_at TIMESTAMPTZ, posted_comment_id TEXT
)`;
// Retention for reels and videos. avg_watch_ms: how long a viewer watches on average (Instagram ig_reels_avg_watch_time,
// Facebook post_video_avg_time_watched); watch_total_ms: all the watch time; plays: Facebook reel plays; video_id: the
// Facebook video's own id, which is what the website's SocialPost.externalPostId holds for a reel (the post id differs).
await sql`ALTER TABLE post_metric ADD COLUMN IF NOT EXISTS video_id TEXT`;
await sql`ALTER TABLE post_metric ADD COLUMN IF NOT EXISTS avg_watch_ms INT`;
await sql`ALTER TABLE post_metric ADD COLUMN IF NOT EXISTS watch_total_ms BIGINT`;
await sql`ALTER TABLE post_metric ADD COLUMN IF NOT EXISTS plays INT`;

// Follower counts over time: one row per account and snapshot. platform 'fb' = a Page's followers, 'ig' = an
// Instagram account's followers, 'yt' = a YouTube channel's subscribers (followers NULL when the channel hides them).
// media_count = Instagram posts / YouTube videos, to show how much was posted for the audience gained.
await sql`CREATE TABLE IF NOT EXISTS follower_snapshot (
  account_key TEXT NOT NULL, platform TEXT NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  followers INT, media_count INT, total_views BIGINT,
  PRIMARY KEY (account_key, platform, taken_at)
)`;
// YouTube Shorts: a snapshot of each recent video's public counters per run (the channel's newest uploads).
await sql`CREATE TABLE IF NOT EXISTS yt_metric (
  video_id TEXT NOT NULL, channel_key TEXT NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ, title TEXT, duration_s INT,
  views INT, likes INT, comments INT,
  PRIMARY KEY (video_id, taken_at)
)`;
await sql`CREATE INDEX IF NOT EXISTS yt_metric_channel ON yt_metric (channel_key, taken_at DESC)`;
