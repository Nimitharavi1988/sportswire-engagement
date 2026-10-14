// Followers per account now, and the change over the last 24 hours and 7 days.
//   npm run followers:report
import { sql } from "./db";

const rows = (await sql`
  WITH latest AS (SELECT DISTINCT ON (account_key, platform) account_key, platform, followers, media_count, total_views, taken_at
                  FROM follower_snapshot ORDER BY account_key, platform, taken_at DESC)
  SELECT l.account_key, l.platform, l.followers, l.media_count, l.total_views, l.taken_at,
    (SELECT followers FROM follower_snapshot s WHERE s.account_key = l.account_key AND s.platform = l.platform AND s.taken_at <= now() - interval '24 hours' ORDER BY s.taken_at DESC LIMIT 1) AS d1,
    (SELECT followers FROM follower_snapshot s WHERE s.account_key = l.account_key AND s.platform = l.platform AND s.taken_at <= now() - interval '7 days' ORDER BY s.taken_at DESC LIMIT 1) AS d7
  FROM latest l ORDER BY l.platform, l.followers DESC NULLS LAST`) as any[];

const delta = (now: number | null, before: number | null) => (now === null || before === null ? "   n/a" : `${now - before >= 0 ? "+" : ""}${now - before}`.padStart(6));
console.log("account          platform followers   24h     7d   posts/videos");
for (const r of rows) {
  console.log(`${String(r.account_key).padEnd(16)} ${String(r.platform).padEnd(8)} ${String(r.followers ?? "hidden").padStart(9)} ${delta(r.followers, r.d1)} ${delta(r.followers, r.d7)}   ${r.media_count ?? ""}`);
}
if (!rows.length) console.log("(no snapshots yet: run `npm run followers`)");
