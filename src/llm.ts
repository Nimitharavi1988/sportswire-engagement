// Gemini flash-lite on the free tier, JSON answers only. Failure returns null (the post is skipped, never guessed).
const KEY = process.env.GEMINI_API_KEY;

export class RateLimited extends Error { constructor() { super("LLM rate limited"); } }
const GAP_MS = 5000; // free tier is ~15 requests/min
let last = 0;

export async function askJson<T>(prompt: string): Promise<T | null> {
  if (!KEY) throw new Error("GEMINI_API_KEY is not set");
  const wait = last + GAP_MS - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 150 } }),
  });
  if (res.status === 429) throw new RateLimited();
  if (!res.ok) { console.warn(`LLM ${res.status}`); return null; }
  const data: any = await res.json();
  try { return JSON.parse(data.candidates[0].content.parts[0].text) as T; } catch { return null; }
}
