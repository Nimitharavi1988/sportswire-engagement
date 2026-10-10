// Pulls comments on each pilot Page's recent posts (FB) and media (IG) into the DB. Read-only on Meta.
import { PILOT_PAGES, type PilotPage } from "./config";
import { g, pageToken } from "./graph";
import { sql } from "./db";

const SINCE_HOURS = 72; // comment activity is almost all in the first days of a post

interface Row { id: string; platform: "fb" | "ig"; pageKey: string; postId: string; parentId: string | null; authorId: string | null; authorName: string | null; body: string; createdAt: string; byPage: boolean }

async function save(rows: Row[]) {
  for (const r of rows) {
    await sql`INSERT INTO comment (id, platform, page_key, post_id, parent_id, author_id, author_name, body, created_at, by_page)
      VALUES (${r.id}, ${r.platform}, ${r.pageKey}, ${r.postId}, ${r.parentId}, ${r.authorId}, ${r.authorName}, ${r.body}, ${r.createdAt}, ${r.byPage})
      ON CONFLICT (id) DO NOTHING`;
  }
}

async function facebook(p: PilotPage): Promise<Row[]> {
  const t = await pageToken(p.pageId);
  const since = Math.floor(Date.now() / 1000 - SINCE_HOURS * 3600);
  const posts = await g<any>(`${p.pageId}/posts?fields=id&since=${since}&limit=50`, t);
  const out: Row[] = [];
  for (const post of posts.data ?? []) {
    const cs = await g<any>(`${post.id}/comments?fields=id,message,created_time,from,parent{id},comments.limit(25){id,message,created_time,from}&filter=toplevel&order=chronological&limit=100`, t);
    const flat = (c: any, parent: string | null) => {
      out.push({ id: c.id, platform: "fb", pageKey: p.key, postId: post.id, parentId: parent, authorId: c.from?.id ?? null,
        authorName: c.from?.name ?? null, body: c.message ?? "", createdAt: c.created_time, byPage: c.from?.id === p.pageId });
      for (const r of c.comments?.data ?? []) flat(r, c.id);
    };
    for (const c of cs.data ?? []) flat(c, null);
  }
  return out;
}

async function instagram(p: PilotPage): Promise<Row[]> {
  if (!p.instagramId) return [];
  const t = await pageToken(p.pageId);
  const cutoff = Date.now() - SINCE_HOURS * 3600_000;
  const media = await g<any>(`${p.instagramId}/media?fields=id,timestamp&limit=50`, t);
  const out: Row[] = [];
  for (const m of media.data ?? []) {
    if (Date.parse(m.timestamp) < cutoff) continue;
    const cs = await g<any>(`${m.id}/comments?fields=id,text,timestamp,username,from,replies.limit(25){id,text,timestamp,username,from}&limit=100`, t);
    const one = (c: any, parent: string | null) => out.push({ id: c.id, platform: "ig", pageKey: p.key, postId: m.id, parentId: parent,
      authorId: c.from?.id ?? null, authorName: c.username ?? null, body: c.text ?? "", createdAt: c.timestamp, byPage: c.from?.id === p.instagramId });
    for (const c of cs.data ?? []) { one(c, null); for (const r of c.replies?.data ?? []) one(r, c.id); }
  }
  return out;
}

for (const p of PILOT_PAGES) {
  for (const [name, fn] of [["fb", facebook], ["ig", instagram]] as const) {
    try { const rows = await fn(p); await save(rows); console.log(`${p.key} ${name}: ${rows.length} comments seen`); }
    catch (e) { console.error(`${p.key} ${name} failed: ${(e as Error).message}`); process.exitCode = 1; }
  }
}
