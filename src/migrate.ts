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
