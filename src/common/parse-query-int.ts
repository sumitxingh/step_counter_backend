export function parseQueryInt(
  value: string | undefined,
  fallback: number,
  {
    min = 1,
    max = Number.MAX_SAFE_INTEGER,
  }: { min?: number; max?: number } = {},
): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}
