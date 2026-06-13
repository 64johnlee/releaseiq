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
