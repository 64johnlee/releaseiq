/**
 * Shared HTTP helper for LLM provider calls. Both the OpenAI-compatible client
 * and the Vertex client POST JSON with a Bearer token and the same bounded
 * timeout, so the request plumbing lives here once.
 */

/** Abort an LLM request after this long so a hung provider call cannot consume the whole function budget. */
export const LLM_TIMEOUT_MS = 30_000;

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
