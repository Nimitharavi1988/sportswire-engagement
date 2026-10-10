// Groq (free tier, OpenAI-compatible), JSON answers only. A failure returns null (the post is skipped, never guessed).
// Free limits per model: 30 requests/min and 8,000 tokens/min, so calls are paced ~6s apart.
const KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

export class RateLimited extends Error { constructor() { super("LLM rate limited"); } }
const GAP_MS = 6000;
let last = 0;

export async function askJson<T>(prompt: string): Promise<T | null> {
  if (!KEY) throw new Error("GROQ_API_KEY is not set");
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      max_completion_tokens: 500, // reasoning tokens count against this
      temperature: 0.7,
    }),
  });
  if (res.status === 429) throw new RateLimited();
  if (!res.ok) { console.warn(`LLM ${res.status}: ${(await res.text()).slice(0, 160)}`); return null; }
  const data: any = await res.json();
  try { return JSON.parse(data.choices[0].message.content) as T; } catch { return null; }
}
