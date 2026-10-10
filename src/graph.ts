import { GRAPH } from "./config";
const SYS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

export async function g<T = any>(path: string, token: string): Promise<T> {
  const url = `${GRAPH}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Graph ${path.split("?")[0]}: ${data?.error?.message ?? res.status}`);
  return data;
}

// The System User token is exchanged for a per-Page token, as the main site does.
const cache = new Map<string, string>();
export async function pageToken(pageId: string): Promise<string> {
  if (!SYS_TOKEN) throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN is not set");
  const hit = cache.get(pageId); if (hit) return hit;
  const r = await g<{ access_token?: string }>(`${pageId}?fields=access_token`, SYS_TOKEN);
  if (!r.access_token) throw new Error(`No Page token for ${pageId}`);
  cache.set(pageId, r.access_token);
  return r.access_token;
}
