// Follower counts for every Page (Facebook) and Instagram account in config.ts, stored over time in
// follower_snapshot so growth can be read per account. Read-only: a few Graph calls per account, nothing is
// written to Meta. Run by the followers workflow (every 6 hours); failures on one account don't stop the others.
import { PILOT_PAGES } from "./config";
import { g, pageToken } from "./graph";
import { sql } from "./db";

async function save(key: string, platform: "fb" | "ig", followers: number | null, media: number | null) {
  await sql`INSERT INTO follower_snapshot (account_key, platform, followers, media_count) VALUES (${key}, ${platform}, ${followers}, ${media})`;
}

for (const p of PILOT_PAGES) {
  try {
    const t = await pageToken(p.pageId);
    const f = await g<any>(`${p.pageId}?fields=followers_count,fan_count`, t);
    const fb = f.followers_count ?? f.fan_count ?? null;
    await save(p.key, "fb", typeof fb === "number" ? fb : null, null);
    let ig = "";
    if (p.instagramId) {
      const i = await g<any>(`${p.instagramId}?fields=followers_count,media_count`, t);
      await save(p.key, "ig", typeof i.followers_count === "number" ? i.followers_count : null, typeof i.media_count === "number" ? i.media_count : null);
      ig = ` | IG ${i.followers_count}`;
    }
    console.log(`${p.key}: FB ${fb}${ig}`);
  } catch (e) {
    console.error(`${p.key} failed: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
