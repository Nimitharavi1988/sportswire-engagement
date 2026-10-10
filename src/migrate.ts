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
