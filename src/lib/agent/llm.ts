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
import { postJsonWithTimeout } from "./fetch-json";
import { vertexChat, vertexEmbed } from "./vertex";
import type { EmbedTaskType } from "./vertex";

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  embedModel: string;
}

/** Active provider, lower-cased. Defaults to the OpenAI-compatible client. */
function provider(): string {
  return (process.env.LLM_PROVIDER ?? "openai").toLowerCase();
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
  if (provider() === "vertex") return vertexChat(prompt, opts);

  const c = config();
  const messages = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: prompt },
  ];
  const res = await postJsonWithTimeout(`${c.baseUrl}/chat/completions`, c.apiKey, {
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

/**
 * Embed text to an EMBEDDING_DIM vector. `taskType` only affects the Vertex
 * provider (it tunes retrieval-vs-document embeddings); the OpenAI-compatible
 * path has no task-type concept and ignores it.
 */
export async function embed(
  text: string,
  taskType: EmbedTaskType = "RETRIEVAL_DOCUMENT",
): Promise<number[]> {
  if (provider() === "vertex") return vertexEmbed(text, taskType);

  const c = config();
  const res = await postJsonWithTimeout(`${c.baseUrl}/embeddings`, c.apiKey, {
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
