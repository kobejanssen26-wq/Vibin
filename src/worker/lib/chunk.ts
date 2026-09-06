/**
 * Cloudflare D1 allows at most 100 bound parameters per query. Bulk inserts of
 * wide-ish rows blow past that quickly (25 rows x 4 cols = 100), so any
 * multi-row insert whose size isn't statically tiny must go through here.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Rows per insert so that rows * columnsPerRow stays comfortably under D1's
 * 100-bound-parameter ceiling (target ~80 to leave headroom for any implicit
 * params Drizzle adds).
 */
export function rowsPerInsert(columnsPerRow: number): number {
  return Math.max(1, Math.floor(80 / Math.max(1, columnsPerRow)));
}
