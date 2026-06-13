/**
 * Provider-agnostic LLM client over the OpenAI-compatible chat + embeddings API.
 * Works with Qwen DashScope (intl), OpenAI, or any compatible endpoint via env config.
 * Ports AutoPR's qwen.py strategy into the Vercel/TS runtime.
 */
import { EMBEDDING_DIM } from "@/db/schema";

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
    embedModel: process.env.LLM_EMBED_MODEL ?? "text-embedding-v3",
  };
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
  const res = await fetch(`${c.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${c.apiKey}`,
    },
    body: JSON.stringify({
      model: c.chatModel,
      messages,
      temperature: opts.temperature ?? 0.3,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
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
  const res = await fetch(`${c.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${c.apiKey}`,
    },
    body: JSON.stringify({
      model: c.embedModel,
      input: text,
      dimensions: EMBEDDING_DIM,
    }),
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
