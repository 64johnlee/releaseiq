import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chat, embed } from "./llm";

// The vertex provider is exercised in vertex.test.ts; here we only verify that
// llm.ts delegates to it when LLM_PROVIDER=vertex (and not otherwise).
vi.mock("./vertex", () => ({
  vertexChat: vi.fn(async () => "vertex-chat"),
  vertexEmbed: vi.fn(async () => new Array(1536).fill(0.5)),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.LLM_BASE_URL = "https://api.example.com/v1";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_CHAT_MODEL = "test-chat";
  process.env.LLM_EMBED_MODEL = "test-embed";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("chat", () => {
  it("posts to /chat/completions and returns the message content", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "hello" } }] }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await chat("a prompt", { system: "be terse", json: true });
    expect(out).toBe("hello");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("test-chat");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0]).toEqual({ role: "system", content: "be terse" });
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    await expect(chat("p")).rejects.toThrow(/LLM chat 500/);
  });

  it("throws when LLM config is missing", async () => {
    delete process.env.LLM_API_KEY;
    await expect(chat("p")).rejects.toThrow(/LLM_BASE_URL and LLM_API_KEY/);
  });

  it("maps an aborted request to a clear timeout error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }),
    );
    await expect(chat("p")).rejects.toThrow(/timed out/);
  });
});

describe("embed", () => {
  it("returns the embedding vector", async () => {
    const vec = new Array(1536).fill(0.01);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [{ embedding: vec }] }), { status: 200 })),
    );
    const out = await embed("some text");
    expect(out).toHaveLength(1536);
  });

  it("throws when the returned embedding has the wrong length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [{ embedding: [1, 2, 3] }] }), { status: 200 })),
    );
    await expect(embed("text")).rejects.toThrow(/Embedding length/);
  });
});

describe("provider dispatch", () => {
  it("routes chat to the vertex provider when LLM_PROVIDER=vertex", async () => {
    process.env.LLM_PROVIDER = "vertex";
    await expect(chat("p")).resolves.toBe("vertex-chat");
  });

  it("routes embed to the vertex provider when LLM_PROVIDER=vertex", async () => {
    process.env.LLM_PROVIDER = "vertex";
    await expect(embed("p", "RETRIEVAL_QUERY")).resolves.toHaveLength(1536);
  });

  it("rejects an unknown LLM_PROVIDER with a clear error", async () => {
    process.env.LLM_PROVIDER = "vertexx";
    await expect(chat("p")).rejects.toThrow(/Unknown LLM_PROVIDER "vertexx"/);
    await expect(embed("p")).rejects.toThrow(/expected "openai" or "vertex"/);
  });
});

describe("blank-input guards", () => {
  it("rejects an empty or whitespace-only chat prompt before any provider call", async () => {
    await expect(chat("   ")).rejects.toThrow(/prompt must be a non-empty string/);
  });

  it("rejects an empty or whitespace-only embed text before any provider call", async () => {
    await expect(embed("")).rejects.toThrow(/text must be a non-empty string/);
  });
});
