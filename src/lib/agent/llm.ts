/**
 * Provider-agnostic LLM client over the OpenAI-compatible chat + embeddings API.
 * Works with Qwen DashScope (intl), OpenAI, or any compatible endpoint via env config.
 * Ports AutoPR's qwen.py strategy into the Vercel/TS runtime.
 */
import { EMBEDDING_DIM } from "@/db/schema";

/** Abort an LLM request after this long so a hung provider call cannot consume the whole function budget. */
const LLM_TIMEOUT_MS = 30_000;

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  embedModel: string;
}

function config(): LLMConfig {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("LLM_BASE_URL and LLM_API_KEY must be set");
  }
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    chatModel: process.env.LLM_CHAT_MODEL ?? "qwen-plus",
    // Must output EMBEDDING_DIM (1536) dims — see src/db/schema.ts.
    embedModel: process.env.LLM_EMBED_MODEL ?? "text-embedding-v4",
  };
}

/** POST JSON to the LLM API with a bounded timeout; maps an abort to a clear timeout error. */
async function postJson(url: string, apiKey: string, payload: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`LLM request timed out after ${LLM_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface ChatOptions {
  system?: string;
  temperature?: number;
  /** Request a JSON object response when the provider supports it. */
  json?: boolean;
}

export async function chat(prompt: string, opts: ChatOptions = {}): Promise<string> {
  const c = config();
  const messages = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: prompt },
  ];
  const res = await postJson(`${c.baseUrl}/chat/completions`, c.apiKey, {
    model: c.chatModel,
    messages,
    temperature: opts.temperature ?? 0.3,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });
  if (!res.ok) {
    throw new Error(`LLM chat ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? "";
}

export async function embed(text: string): Promise<number[]> {
  const c = config();
  const res = await postJson(`${c.baseUrl}/embeddings`, c.apiKey, {
    model: c.embedModel,
    input: text,
    dimensions: EMBEDDING_DIM,
  });
  if (!res.ok) {
    throw new Error(`LLM embed ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  const vec = data.data[0]?.embedding;
  if (!vec || vec.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding length ${vec?.length ?? 0} != expected ${EMBEDDING_DIM}`,
    );
  }
  return vec;
}
