/**
 * Google Vertex AI provider for the LLM facade (src/lib/agent/llm.ts).
 *
 * Auth: OAuth2 access token minted from a service account (google-auth.ts) — no
 * static API key, unlike the OpenAI-compatible path.
 *
 * Chat goes through Vertex's OpenAI-compatible endpoint (same request/response
 * shape as the default client, model id prefixed `google/`).
 *
 * Embeddings go through the NATIVE `:predict` endpoint, not the OpenAI-compat
 * one: only the native API reliably honors `outputDimensionality`, and the DB
 * schema is locked to vector(1536) (see EMBEDDING_DIM). Going through OpenAI-compat
 * here risks 3072-dim output that fails to insert.
 */
import { EMBEDDING_DIM } from "@/db/schema";
import { postJsonWithRetry, readErrorBody } from "./fetch-json";
import { getGoogleAccessToken } from "./google-auth";
import type { ChatOptions } from "./llm";

/**
 * Vertex text-embedding task types. Picking the right one materially improves
 * retrieval quality: index documents as RETRIEVAL_DOCUMENT, embed the live search
 * query as RETRIEVAL_QUERY so the two vectors land in the same asymmetric space.
 */
export type EmbedTaskType =
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "SEMANTIC_SIMILARITY";

interface VertexConfig {
  projectId: string;
  location: string;
  chatModel: string;
  embedModel: string;
}

function vertexConfig(
  env: Record<string, string | undefined> = process.env,
): VertexConfig {
  // Trim so a stray space/newline pasted into a Vercel env var can't break the URL or auth.
  const projectId = env.GCP_PROJECT_ID?.trim();
  const location = env.GCP_LOCATION?.trim();
  if (!projectId || !location) {
    throw new Error(
      "GCP_PROJECT_ID and GCP_LOCATION must be set for the vertex provider",
    );
  }
  return {
    projectId,
    location,
    chatModel: env.LLM_CHAT_MODEL?.trim() || "gemini-2.5-flash",
    embedModel: env.LLM_EMBED_MODEL?.trim() || "gemini-embedding-001",
  };
}

/** Regional endpoints are prefixed with the location; the multi-region `global` uses the bare host. */
function apiHost(location: string): string {
  return location === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${location}-aiplatform.googleapis.com`;
}

export async function vertexChat(prompt: string, opts: ChatOptions = {}): Promise<string> {
  const c = vertexConfig();
  const token = await getGoogleAccessToken();
  const messages = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: prompt },
  ];
  const url = `${apiHost(c.location)}/v1beta1/projects/${c.projectId}/locations/${c.location}/endpoints/openapi/chat/completions`;
  const res = await postJsonWithRetry(url, token, {
    model: `google/${c.chatModel}`,
    messages,
    temperature: opts.temperature ?? 0.3,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });
  if (!res.ok) {
    throw new Error(`Vertex chat ${res.status}: ${await readErrorBody(res)}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? "";
}

/**
 * Embed many texts in a single predict call. The native API accepts one instance
 * per text and returns predictions in the same order; far fewer round-trips (and
 * tokens) than one call per PR. Callers bound the batch size (the ingest pipeline
 * uses its concurrency limit) to stay within the model's per-request instance cap.
 */
export async function vertexEmbedMany(
  texts: string[],
  taskType: EmbedTaskType = "RETRIEVAL_DOCUMENT",
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const c = vertexConfig();
  const token = await getGoogleAccessToken();
  const url = `${apiHost(c.location)}/v1/projects/${c.projectId}/locations/${c.location}/publishers/google/models/${c.embedModel}:predict`;
  const res = await postJsonWithRetry(url, token, {
    instances: texts.map((content) => ({ content, task_type: taskType })),
    parameters: { outputDimensionality: EMBEDDING_DIM },
  });
  if (!res.ok) {
    throw new Error(`Vertex embed ${res.status}: ${await readErrorBody(res)}`);
  }
  const data = (await res.json()) as {
    predictions: { embeddings: { values: number[] } }[];
  };
  const preds = data.predictions ?? [];
  if (preds.length !== texts.length) {
    throw new Error(`Vertex embed returned ${preds.length} vectors for ${texts.length} inputs`);
  }
  return preds.map((p, i) => {
    const vec = p?.embeddings?.values;
    if (!vec || vec.length !== EMBEDDING_DIM) {
      throw new Error(
        `Embedding length ${vec?.length ?? 0} != expected ${EMBEDDING_DIM} (input ${i})`,
      );
    }
    return vec;
  });
}
