/**
 * Shared HTTP helper for LLM provider calls. Both the OpenAI-compatible client
 * and the Vertex client POST JSON with a Bearer token and the same bounded
 * timeout, so the request plumbing lives here once.
 */

/** Abort an LLM request after this long so a hung provider call cannot consume the whole function budget. */
export const LLM_TIMEOUT_MS = 30_000;

/**
 * Transient HTTP statuses worth retrying: provider rate limits (429) and gateway
 * errors (502/503/504). Other 4xx/5xx are returned as-is for the caller to surface.
 */
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);
/** Total attempts (1 initial + 2 retries) before giving up and returning the last response. */
const MAX_ATTEMPTS = 3;
/** Base for exponential backoff; attempt N waits BASE * 2^(N-1) ms (0.5s, 1s, ...). */
const BASE_BACKOFF_MS = 500;
/** Cap on an honored Retry-After so a huge/hostile value can't consume the function budget. */
const MAX_RETRY_AFTER_MS = 20_000;

/** Max chars of a provider error body to surface; longer bodies (e.g. HTML 500 pages) are clipped. */
const MAX_ERROR_BODY_CHARS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read a failed response's body for an error message, clipped so a huge HTML/JSON
 * error page cannot bloat logs or the thrown Error. Never throws.
 */
export async function readErrorBody(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return text.length > MAX_ERROR_BODY_CHARS
    ? `${text.slice(0, MAX_ERROR_BODY_CHARS)}… (${text.length} chars total)`
    : text;
}

/**
 * Parse the provider's Retry-After header into a bounded wait, or null when it is
 * absent/unparseable. Supports both forms: delta-seconds (e.g. "5") and an HTTP date.
 */
function retryAfterMs(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(seconds, 0) * 1000, MAX_RETRY_AFTER_MS);
  }

  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), MAX_RETRY_AFTER_MS);
  }

  return null;
}

interface RetryOptions {
  /** Override total attempts (default MAX_ATTEMPTS). */
  attempts?: number;
  /** Override backoff base in ms (tests pass 0 to avoid real delays). */
  baseBackoffMs?: number;
}

/**
 * POST a JSON body with a Bearer token and a bounded timeout. An aborted request
 * (timeout) is mapped to a clear error; any other fetch error is rethrown as-is.
 */
export async function postJsonWithTimeout(
  url: string,
  bearer: string,
  payload: unknown,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
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

/**
 * Like postJsonWithTimeout, but retries on transient HTTP statuses with exponential
 * backoff. Thrown errors (timeout, network) are NOT retried — re-running a 30s
 * timeout would blow the serverless budget — so they propagate immediately.
 * Returns the final Response (which may still be non-ok) for the caller to handle.
 */
export async function postJsonWithRetry(
  url: string,
  bearer: string,
  payload: unknown,
  opts: RetryOptions = {},
): Promise<Response> {
  const attempts = opts.attempts ?? MAX_ATTEMPTS;
  const baseBackoffMs = opts.baseBackoffMs ?? BASE_BACKOFF_MS;

  for (let attempt = 1; ; attempt++) {
    const res = await postJsonWithTimeout(url, bearer, payload);
    if (attempt >= attempts || !TRANSIENT_STATUSES.has(res.status)) {
      return res;
    }
    // Respect the provider's own pacing (Retry-After) when given; else exponential backoff.
    const waitMs = retryAfterMs(res) ?? baseBackoffMs * 2 ** (attempt - 1);
    // Drain the discarded body so the connection can be reused, then wait.
    await res.body?.cancel().catch(() => {});
    await sleep(waitMs);
  }
}
