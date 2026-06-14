import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { __clearTokenCache, getGoogleAccessToken } from "./google-auth";

const ORIGINAL_ENV = { ...process.env };

// A throwaway RSA key so the JWT is really signed (no network, no real GCP key).
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function tokenResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  __clearTokenCache();
  process.env.GCP_SERVICE_ACCOUNT_EMAIL = "svc@proj.iam.gserviceaccount.com";
  // Store the PEM the way an env var would: newlines flattened to literal "\n".
  process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY = privateKey.replace(/\n/g, "\\n");
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("getGoogleAccessToken", () => {
  it("signs a JWT-bearer assertion and exchanges it for an access token", async () => {
    const fetchMock = vi.fn(async () =>
      tokenResponse({ access_token: "ya29.abc", expires_in: 3600 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await getGoogleAccessToken();
    expect(token).toBe("ya29.abc");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = (init.body as URLSearchParams).toString();
    expect(body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");

    // The assertion is a real JWT; decode the claims and check issuer/scope/audience.
    const assertion = new URLSearchParams(init.body as URLSearchParams).get("assertion")!;
    const claims = JSON.parse(
      Buffer.from(assertion.split(".")[1], "base64url").toString(),
    );
    expect(claims.iss).toBe("svc@proj.iam.gserviceaccount.com");
    expect(claims.scope).toBe("https://www.googleapis.com/auth/cloud-platform");
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
  });

  it("caches the token and does not re-exchange on the next call", async () => {
    const fetchMock = vi.fn(async () =>
      tokenResponse({ access_token: "ya29.cached", expires_in: 3600 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await getGoogleAccessToken();
    const second = await getGoogleAccessToken();
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent cold-cache callers into a single token exchange", async () => {
    const fetchMock = vi.fn(async () =>
      tokenResponse({ access_token: "ya29.one", expires_in: 3600 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([getGoogleAccessToken(), getGoogleAccessToken()]);
    expect(a).toBe("ya29.one");
    expect(b).toBe("ya29.one");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-mints after a failed exchange instead of caching the rejection", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("nope", 500))
      .mockResolvedValueOnce(tokenResponse({ access_token: "ya29.two", expires_in: 3600 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getGoogleAccessToken()).rejects.toThrow(/Google token exchange 500/);
    // The in-flight promise was cleared on failure, so the next call retries cleanly.
    await expect(getGoogleAccessToken()).resolves.toBe("ya29.two");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when service-account env is missing", async () => {
    delete process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY;
    await expect(getGoogleAccessToken()).rejects.toThrow(/GCP_SERVICE_ACCOUNT/);
  });

  it("trims surrounding whitespace in the service-account email", async () => {
    process.env.GCP_SERVICE_ACCOUNT_EMAIL = "  svc@proj.iam.gserviceaccount.com  ";
    const fetchMock = vi.fn(async () =>
      tokenResponse({ access_token: "ya29.trim", expires_in: 3600 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getGoogleAccessToken();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const assertion = new URLSearchParams(init.body as URLSearchParams).get("assertion")!;
    const claims = JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString());
    expect(claims.iss).toBe("svc@proj.iam.gserviceaccount.com");
  });

  it("treats a blank-after-trim key as missing", async () => {
    process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY = "   ";
    await expect(getGoogleAccessToken()).rejects.toThrow(/GCP_SERVICE_ACCOUNT/);
  });

  it("throws on a non-ok token exchange", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => tokenResponse("nope", 401)),
    );
    await expect(getGoogleAccessToken()).rejects.toThrow(/Google token exchange 401/);
  });

  it("throws when the exchange returns no access_token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => tokenResponse({ expires_in: 3600 })),
    );
    await expect(getGoogleAccessToken()).rejects.toThrow(/no access_token/);
  });
});
