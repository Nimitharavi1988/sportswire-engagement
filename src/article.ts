// Reads a story from the site's public page (no access to the site's database).
export async function fetchArticle(url: string): Promise<string | null> {
  try {
    const res = await fetch(url.split("?")[0], { headers: { "user-agent": "sportswire-engagement/1.0" } });
    if (!res.ok) return null;
    const html = await res.text();
    const title = html.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
    const desc = html.match(/property="og:description" content="([^"]*)"/)?.[1] ?? "";
    const paras = [...html.matchAll(/<p[^>]*>(.*?)<\/p>/gs)]
      .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').trim())
      .filter((p) => p.length > 60);
    return `${title}\n${desc}\n${paras.slice(0, 4).join("\n")}`.slice(0, 1200);
  } catch { return null; }
}
