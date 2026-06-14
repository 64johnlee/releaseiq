import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vertexChat, vertexEmbed } from "./vertex";

// Isolate the provider from the OAuth flow — token minting is covered in google-auth.test.ts.
vi.mock("./google-auth", () => ({
  getGoogleAccessToken: vi.fn(async () => "ya29.test-token"),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.GCP_PROJECT_ID = "my-proj";
  process.env.GCP_LOCATION = "us-central1";
  process.env.LLM_CHAT_MODEL = "gemini-2.5-flash";
  process.env.LLM_EMBED_MODEL = "gemini-embedding-001";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("vertexChat", () => {
  it("posts to the regional OpenAI-compat endpoint with a google/ model and bearer token", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "hi" } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await vertexChat("a prompt", { system: "be terse", json: true });
    expect(out).toBe("hi");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1beta1/projects/my-proj/locations/us-central1/endpoints/openapi/chat/completions",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ya29.test-token");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("google/gemini-2.5-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0]).toEqual({ role: "system", content: "be terse" });
  });

  it("uses the bare host for the global location", async () => {
    process.env.GCP_LOCATION = "global";
    const fetchMock = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "ok" } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await vertexChat("p");
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      "https://aiplatform.googleapis.com/v1beta1/projects/my-proj/locations/global/endpoints/openapi/chat/completions",
    );
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse("boom", 500)));
    await expect(vertexChat("p")).rejects.toThrow(/Vertex chat 500/);
  });

  it("throws when required config is missing", async () => {
    delete process.env.GCP_PROJECT_ID;
    await expect(vertexChat("p")).rejects.toThrow(/GCP_PROJECT_ID and GCP_LOCATION/);
  });

  it("maps an aborted request to a timeout error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }),
    );
    await expect(vertexChat("p")).rejects.toThrow(/timed out/);
  });
});

describe("vertexEmbed", () => {
  it("posts to the native predict endpoint requesting 1536 dims and returns the vector", async () => {
    const vec = new Array(1536).fill(0.02);
    const fetchMock = vi.fn(async () =>
      jsonResponse({ predictions: [{ embeddings: { values: vec } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await vertexEmbed("some text");
    expect(out).toHaveLength(1536);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/gemini-embedding-001:predict",
    );
    const body = JSON.parse(init.body as string);
    expect(body.parameters.outputDimensionality).toBe(1536);
    expect(body.instances[0].task_type).toBe("RETRIEVAL_DOCUMENT");
  });

  it("passes through an explicit task type", async () => {
    const vec = new Array(1536).fill(0.02);
    const fetchMock = vi.fn(async () =>
      jsonResponse({ predictions: [{ embeddings: { values: vec } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await vertexEmbed("q", "RETRIEVAL_QUERY");
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.instances[0].task_type).toBe("RETRIEVAL_QUERY");
  });

  it("throws when the returned embedding has the wrong length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ predictions: [{ embeddings: { values: [1, 2, 3] } }] }),
      ),
    );
    await expect(vertexEmbed("text")).rejects.toThrow(/Embedding length/);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse("nope", 429)));
    await expect(vertexEmbed("text")).rejects.toThrow(/Vertex embed 429/);
  });
});
