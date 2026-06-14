/**
 * Mints a short-lived Google Cloud OAuth2 access token from a service account
 * using the JWT-bearer grant (RFC 7523), signed locally with Node crypto.
 *
 * This mirrors the keyless spirit of the AWS-IAM DB path (src/db/client.ts):
 * no long-lived bearer key is stored. The only secret is the service-account
 * private key (env), used to sign a JWT that Google exchanges for a ~1h token.
 * Tokens are cached in-process and reused until shortly before expiry, so a warm
 * serverless function does not re-sign on every LLM call.
 */
import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";

/** Lifetime claimed by the self-signed assertion JWT. Google caps the returned token at ~1h regardless. */
const ASSERTION_TTL_SECONDS = 3600;
/** Refresh this many seconds early so an in-flight request never rides a token that expires mid-call. */
const EXPIRY_SKEW_SECONDS = 60;

interface ServiceAccount {
  clientEmail: string;
  privateKey: string;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

let cached: CachedToken | null = null;

function serviceAccountFromEnv(
  env: Record<string, string | undefined> = process.env,
): ServiceAccount {
  const clientEmail = env.GCP_SERVICE_ACCOUNT_EMAIL;
  const rawKey = env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!clientEmail || !rawKey) {
    throw new Error(
      "GCP_SERVICE_ACCOUNT_EMAIL and GCP_SERVICE_ACCOUNT_PRIVATE_KEY must be set for the vertex provider",
    );
  }
  // Env vars flatten newlines to the literal characters "\n"; restore them so the PEM parses.
  return { clientEmail, privateKey: rawKey.replace(/\\n/g, "\n") };
}

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

/** Build and RS256-sign the assertion JWT that Google exchanges for an access token. */
function buildAssertion(sa: ServiceAccount, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + ASSERTION_TTL_SECONDS,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(sa.privateKey, "base64url");
  return `${signingInput}.${signature}`;
}

/**
 * Return a valid GCP access token, reusing the cached one until it is near expiry.
 * Throws if the service-account env is missing or the token exchange fails.
 */
export async function getGoogleAccessToken(
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  const nowMs = Date.now();
  if (cached && cached.expiresAtMs > nowMs) return cached.token;

  const sa = serviceAccountFromEnv(env);
  const assertion = buildAssertion(sa, Math.floor(nowMs / 1000));

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: JWT_BEARER_GRANT, assertion }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Google token exchange returned no access_token");
  }

  const ttlSeconds = (data.expires_in ?? ASSERTION_TTL_SECONDS) - EXPIRY_SKEW_SECONDS;
  cached = { token: data.access_token, expiresAtMs: nowMs + ttlSeconds * 1000 };
  return cached.token;
}

/** Test seam: drop the in-process token cache so each test starts cold. */
export function __clearTokenCache(): void {
  cached = null;
}
