/**
 * LLM client facade. Dispatches to a provider selected by LLM_PROVIDER:
 *  - "openai" (default): any OpenAI-compatible chat + embeddings API
 *    (Qwen DashScope intl, OpenAI, etc.) via a static LLM_API_KEY.
 *  - "vertex": Google Vertex AI (OAuth service-account auth; chat over the
 *    OpenAI-compatible endpoint, embeddings over the native predict API).
 *
 * The public surface — chat() / embed() — is identical across providers so the
 * pipeline and routes never branch on which provider is configured.
 */
import { EMBEDDING_DIM } from "@/db/schema";
import { postJsonWithRetry, readErrorBody } from "./fetch-json";
import { vertexChat, vertexEmbedMany } from "./vertex";
import type { EmbedTaskType } from "./vertex";

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  embedModel: string;
}

type Provider = "openai" | "vertex";

/** Active provider, lower-cased. Defaults to the OpenAI-compatible client; rejects unknown values. */
function provider(): Provider {
  const value = (process.env.LLM_PROVIDER ?? "openai").toLowerCase();
  if (value !== "openai" && value !== "vertex") {
    throw new Error(`Unknown LLM_PROVIDER "${value}"; expected "openai" or "vertex"`);
  }
  return value;
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

export interface ChatOptions {
  system?: string;
  temperature?: number;
  /** Request a JSON object response when the provider supports it. */
  json?: boolean;
}

export async function chat(prompt: string, opts: ChatOptions = {}): Promise<string> {
  if (!prompt.trim()) {
    throw new Error("chat: prompt must be a non-empty string");
  }
  if (provider() === "vertex") return vertexChat(prompt, opts);

  const c = config();
  const messages = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: prompt },
  ];
  const res = await postJsonWithRetry(`${c.baseUrl}/chat/completions`, c.apiKey, {
    model: c.chatModel,
    messages,
    temperature: opts.temperature ?? 0.3,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });
  if (!res.ok) {
    throw new Error(`LLM chat ${res.status}: ${await readErrorBody(res)}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? "";
}

/**
 * Embed many texts to EMBEDDING_DIM vectors in one provider call (order preserved).
 * Both providers support batching natively, so this is far cheaper than one call
 * per text. `taskType` only affects the Vertex provider; the OpenAI-compatible path
 * has no task-type concept and ignores it.
 */
export async function embedMany(
  texts: string[],
  taskType: EmbedTaskType = "RETRIEVAL_DOCUMENT",
): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.some((t) => !t.trim())) {
    throw new Error("embedMany: every text must be a non-empty string");
  }
  if (provider() === "vertex") return vertexEmbedMany(texts, taskType);

  const c = config();
  const res = await postJsonWithRetry(`${c.baseUrl}/embeddings`, c.apiKey, {
    model: c.embedModel,
    input: texts,
    dimensions: EMBEDDING_DIM,
  });
  if (!res.ok) {
    throw new Error(`LLM embed ${res.status}: ${await readErrorBody(res)}`);
  }
  const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  // The OpenAI-compatible API tags each result with its input index; sort to be safe.
  const items = [...(data.data ?? [])].sort((a, b) => a.index - b.index);
  if (items.length !== texts.length) {
    throw new Error(`LLM embed returned ${items.length} vectors for ${texts.length} inputs`);
  }
  return items.map((item, i) => {
    const vec = item.embedding;
    if (!vec || vec.length !== EMBEDDING_DIM) {
      throw new Error(
        `Embedding length ${vec?.length ?? 0} != expected ${EMBEDDING_DIM} (input ${i})`,
      );
    }
    return vec;
  });
}

/**
 * Embed a single text to an EMBEDDING_DIM vector — a thin convenience over embedMany.
 */
export async function embed(
  text: string,
  taskType: EmbedTaskType = "RETRIEVAL_DOCUMENT",
): Promise<number[]> {
  if (!text.trim()) {
    throw new Error("embed: text must be a non-empty string");
  }
  return (await embedMany([text], taskType))[0];
}
