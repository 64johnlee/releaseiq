/**
 * Parse an integer request param, clamped to [min, max]. Falls back to `fallback`
 * for missing or non-numeric input. Guards routes against NaN/negative/huge values
 * reaching SQL (e.g. LIMIT NaN).
 */
export function clampInt(
  raw: string | number | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

/** Parse a `repo=owner/name` param into `[owner, name]`, or null if missing/malformed. */
export function parseRepo(param: string | null | undefined): [string, string] | null {
  if (!param || !param.includes("/")) return null;
  const [owner, name] = param.split("/");
  if (!owner || !name) return null;
  return [owner, name];
}
