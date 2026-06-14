import { afterEach, describe, expect, it, vi } from "vitest";
import { postJsonWithRetry, postJsonWithTimeout, readErrorBody } from "./fetch-json";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("postJsonWithTimeout", () => {
  it("sends a bearer-authed JSON POST and returns the response", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await postJsonWithTimeout("https://x/y", "tok", { a: 1 });
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });
});

describe("readErrorBody", () => {
  it("returns a short body unchanged", async () => {
    const out = await readErrorBody(new Response("boom", { status: 500 }));
    expect(out).toBe("boom");
  });

  it("clips an oversized body and notes the total length", async () => {
    const huge = "x".repeat(2000);
    const out = await readErrorBody(new Response(huge, { status: 500 }));
    expect(out).toContain("2000 chars total");
    expect(out.length).toBeLessThan(huge.length);
  });

  it("returns an empty string when the body cannot be read", async () => {
    const res = { text: async () => Promise.reject(new Error("stream broke")) } as unknown as Response;
    await expect(readErrorBody(res)).resolves.toBe("");
  });
});

describe("postJsonWithRetry", () => {
  it("retries a transient 429 and returns the eventual success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse("rate limited", 429))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await postJsonWithRetry("https://x/y", "tok", {}, { baseBackoffMs: 0 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the attempt budget and returns the last transient response", async () => {
    const fetchMock = vi.fn(async () => jsonResponse("still down", 503));
    vi.stubGlobal("fetch", fetchMock);

    const res = await postJsonWithRetry(
      "https://x/y",
      "tok",
      {},
      { attempts: 3, baseBackoffMs: 0 },
    );
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("honors a numeric Retry-After header on 429", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await postJsonWithRetry("https://x/y", "tok", {}, { baseBackoffMs: 0 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors an HTTP-date Retry-After header (past date waits zero)", async () => {
    const past = "Wed, 01 Jan 2020 00:00:00 GMT";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 503, headers: { "Retry-After": past } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await postJsonWithRetry("https://x/y", "tok", {}, { baseBackoffMs: 0 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to backoff when Retry-After is unparseable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "Retry-After": "soon" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await postJsonWithRetry("https://x/y", "tok", {}, { baseBackoffMs: 0 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient status (returns immediately)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse("bad request", 400));
    vi.stubGlobal("fetch", fetchMock);

    const res = await postJsonWithRetry("https://x/y", "tok", {}, { baseBackoffMs: 0 });
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a thrown timeout/network error", async () => {
    const fetchMock = vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postJsonWithRetry("https://x/y", "tok", {}, { baseBackoffMs: 0 }),
    ).rejects.toThrow(/timed out/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
