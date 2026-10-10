// Breakout view. A post "breaks out" when its reach is >= THRESHOLD x the median reach of the same
// Page + platform at a similar age (so a day-old post isn't compared with a 2-hour-old one).
// Peers share the same format too (video vs link posts differ ~100x). Medians, not averages: one earlier hit would otherwise raise the bar for everything after it.
import { writeFileSync } from "node:fs";
import { sql } from "./db";

const THRESHOLD = 3;
const MIN_PEERS = 5;      // fewer posts than this in a bucket = no baseline, nothing flagged
const FLOOR = 10;         // a median of 2 would make any 20-reach post a "10x breakout"
const bucketOf = (h: number) => (h < 6 ? "0-6h" : h < 24 ? "6-24h" : h < 48 ? "24-48h" : "48h+");

const rows = await sql`SELECT DISTINCT ON (post_id) post_id, platform, page_key, is_control, kind, post_created_at,
  reach, views, comments, shares, saves, reactions, EXTRACT(EPOCH FROM (taken_at - post_created_at))/3600 AS age_h
  FROM post_metric WHERE reach IS NOT NULL ORDER BY post_id, taken_at DESC` as any[];

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const groups = new Map<string, any[]>();
for (const r of rows) { const k = `${r.page_key}|${r.platform}|${r.kind}|${bucketOf(+r.age_h)}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }

const scored = rows.map((r) => {
  const peers = groups.get(`${r.page_key}|${r.platform}|${r.kind}|${bucketOf(+r.age_h)}`)!;
  const med = median(peers.map((p) => +p.reach));
  const ok = peers.length >= MIN_PEERS;
  return { ...r, med, mult: ok ? +r.reach / Math.max(med, FLOOR) : null, spr: +r.reach > 0 ? (+r.shares || 0) / +r.reach : 0 };
});
const breakouts = scored.filter((r) => r.mult !== null && r.mult >= THRESHOLD).sort((a, b) => b.mult - a.mult);

const plans = await sql`SELECT post_id, platform, page_key, kind, status, text, reason, caption, planned_at FROM page_comment ORDER BY planned_at DESC LIMIT 200` as any[];
const counts = Object.fromEntries(["planned", "skipped", "holdout", "posted"].map((k) => [k, plans.filter((p) => p.status === k).length]));
const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
const link = (r: any) => r.platform === "fb" ? `https://www.facebook.com/${r.post_id}` : null;
const tr = (r: any) => `<tr><td>${esc(r.page_key)}${r.is_control ? " <i>(control)</i>" : ""}</td><td>${r.platform.toUpperCase()}</td><td>${esc(r.kind)}</td>
  <td>${(+r.age_h).toFixed(0)}h</td><td>${r.reach}</td><td>${Math.round(r.med)}</td><td><b>${r.mult === null ? "–" : r.mult.toFixed(1) + "×"}</b></td>
  <td>${r.shares ?? "–"}</td><td>${r.saves ?? "–"}</td><td>${r.comments ?? "–"}</td><td>${link(r) ? `<a href="${link(r)}">open</a>` : ""}</td></tr>`;
const head = `<tr><th>Page</th><th></th><th>Format</th><th>Age</th><th>Reach</th><th>Median</th><th>vs median</th><th>Shares</th><th>Saves</th><th>Comments</th><th></th></tr>`;

const summary = [...new Set(rows.map((r) => `${r.page_key}|${r.platform}`))].sort().map((k) => {
  const rs = scored.filter((r) => `${r.page_key}|${r.platform}` === k);
  return `<tr><td>${k.replace("|", " ")}</td><td>${rs.length}</td><td>${Math.round(median(rs.map((r) => +r.reach)))}</td><td>${Math.max(...rs.map((r) => +r.reach))}</td><td>${rs.filter((r) => r.mult !== null && r.mult >= THRESHOLD).length}</td></tr>`;
}).join("");
const byFormat = [...new Set(scored.map((r) => `${r.platform}|${r.kind}`))].sort().map((k) => {
  const rs = scored.filter((r) => `${r.platform}|${r.kind}` === k && !r.is_control);
  return rs.length ? `<tr><td>${k.replace("|", " ")}</td><td>${rs.length}</td><td>${Math.round(median(rs.map((r) => +r.reach)))}</td></tr>` : "";
}).join("");

const planRows = (st: string, limit: number) => plans.filter((p) => p.status === st).slice(0, limit).map((p) => `<tr><td>${esc(p.page_key)} ${p.platform.toUpperCase()}</td><td>${esc(p.kind ?? "")}</td><td class="cap">${esc((p.caption ?? "").replace(/s+/g, " ").slice(0, 220))}</td><td><b>${esc(p.text ?? p.reason ?? "")}</b></td></tr>`).join("");
writeFileSync("report.html", `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Breakout posts</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:1000px;margin:0 auto;padding:16px;color:#1c2b22;background:#fff}h1{font-size:22px}h2{font-size:17px;margin-top:28px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3e8e5}th{color:#5b6b61;font-weight:600}
.wrap{overflow-x:auto}p.n{color:#5b6b61;font-size:13px}a{color:#1d6b3f}td.cap{color:#5b6b61;max-width:380px}</style>
<h1>Breakout posts</h1><p class="n">A post is flagged when its reach is ${THRESHOLD}× or more the median for the same Page, platform and age band (needs ${MIN_PEERS}+ comparable posts; median floored at ${FLOOR}). Generated ${new Date().toISOString().slice(0, 16)}Z.</p>
<h2>Breakouts (${breakouts.length})</h2><div class="wrap"><table>${head}${breakouts.map(tr).join("") || `<tr><td colspan=11>None right now.</td></tr>`}</table></div>
<h2>Planned Page comments (dry-run, ${counts.planned} planned)</h2><p class="n">Nothing here has been posted. ${counts.holdout} posts held out on purpose (no comment, for comparison); ${counts.skipped} skipped by the safety checks.</p><div class="wrap"><table><tr><th>Page</th><th>Type</th><th>Post</th><th>Planned comment</th></tr>${planRows("planned", 40) || `<tr><td colspan=4>None yet.</td></tr>`}</table></div>
<h2>Skipped (why)</h2><div class="wrap"><table><tr><th>Page</th><th>Type</th><th>Post</th><th>Reason</th></tr>${planRows("skipped", 15)}</table></div>
<h2>By Page</h2><div class="wrap"><table><tr><th>Page</th><th>Posts</th><th>Median reach</th><th>Best reach</th><th>Breakouts</th></tr>${summary}</table></div>
<h2>By format (pilot Pages)</h2><div class="wrap"><table><tr><th>Format</th><th>Posts</th><th>Median reach</th></tr>${byFormat}</table></div>
<h2>Top by shares per reach</h2><div class="wrap"><table>${head}${scored.filter((r) => r.shares > 0).sort((a, b) => b.spr - a.spr).slice(0, 10).map(tr).join("") || `<tr><td colspan=11>No shares recorded yet.</td></tr>`}</table></div>`);
console.log(`report.html written: ${rows.length} posts, ${breakouts.length} breakouts`);
for (const b of breakouts.slice(0, 8)) console.log(`${b.mult.toFixed(1)}x  ${b.page_key} ${b.platform} ${b.kind} reach ${b.reach} (median ${Math.round(b.med)}, ${(+b.age_h).toFixed(0)}h old)`);
