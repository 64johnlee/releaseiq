/**
 * Connection-string resolution shared by the runtime client and drizzle-kit.
 *
 * The Vercel AWS Marketplace integration for Aurora PostgreSQL injects the
 * connection string under an integration-managed env var, which is not always
 * `DATABASE_URL`. We check a prioritized list so the same code path works for a
 * local `.env.local` (`DATABASE_URL`), a Neon dev stand-in, and a Vercel-managed
 * Aurora/Postgres integration - with no code change when we swap providers.
 *
 * Order rationale: an explicit `DATABASE_URL` always wins (lets us override in
 * any environment). `POSTGRES_URL` is the pooled value most Vercel storage
 * integrations inject. `POSTGRES_URL_NON_POOLING` is the direct connection,
 * preferred by migrations (`db:push`) which dislike a transaction pooler.
 */
export const CONNECTION_STRING_ENV_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

/**
 * Return the first non-empty connection string from the candidate env vars,
 * or `undefined` if none are set. Values are trimmed; whitespace-only values
 * are treated as unset.
 */
export function resolveConnectionString(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  for (const key of CONNECTION_STRING_ENV_VARS) {
    const value = env[key];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

/** Human-readable list of the env vars we look at, for error messages. */
export function connectionStringEnvHint(): string {
  return CONNECTION_STRING_ENV_VARS.join(", ");
}
