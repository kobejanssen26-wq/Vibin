/**
 * Server-side analytics date ranges. Given `?range=` (+ optional custom
 * `from`/`to` as YYYY-MM-DD) returns the window in epoch seconds plus the
 * immediately-preceding window of equal length for period-over-period deltas.
 */
export interface Range {
  from: number;
  to: number;
  prevFrom: number;
  prevTo: number;
  label: string;
  /** Bucket size (seconds) that gives a sensible number of points. */
  bucket: number;
}

const DAY = 86_400;

function startOfUtcDay(sec: number): number {
  return Math.floor(sec / DAY) * DAY;
}

export function parseRange(qs: URLSearchParams): Range {
  const nowSec = Math.floor(Date.now() / 1000);
  const id = (qs.get("range") || "30d").toLowerCase();
  const todayStart = startOfUtcDay(nowSec);

  let from: number;
  // +1s so a row written in the current second is still inside a range whose
  // upper bound is "now" (queries use `created_at < to`).
  let to = nowSec + 1;
  let label: string;

  switch (id) {
    case "today":
      from = todayStart;
      label = "today";
      break;
    case "yesterday":
      from = todayStart - DAY;
      to = todayStart;
      label = "yesterday";
      break;
    case "7d":
      from = nowSec - 7 * DAY;
      label = "7d";
      break;
    case "90d":
      from = nowSec - 90 * DAY;
      label = "90d";
      break;
    case "ytd": {
      const d = new Date();
      from = Math.floor(Date.UTC(d.getUTCFullYear(), 0, 1) / 1000);
      label = "YTD";
      break;
    }
    case "custom": {
      const f = Date.parse(`${qs.get("from") || ""}T00:00:00Z`);
      const t = Date.parse(`${qs.get("to") || ""}T23:59:59Z`);
      if (Number.isFinite(f) && Number.isFinite(t) && t > f) {
        from = Math.floor(f / 1000);
        to = Math.floor(t / 1000);
        label = "custom";
        break;
      }
      from = nowSec - 30 * DAY;
      label = "30d";
      break;
    }
    case "30d":
    default:
      from = nowSec - 30 * DAY;
      label = "30d";
      break;
  }

  const span = Math.max(1, to - from);
  const bucket = span <= 2 * DAY ? 3600 : span <= 45 * DAY ? DAY : 7 * DAY;

  return {
    from,
    to,
    prevFrom: from - span,
    prevTo: from,
    label,
    bucket,
  };
}

/**
 * Percentage change from `prev` to `curr`. Returns null when there is no prior
 * data to compare against (prev = 0) — the client then shows no delta rather
 * than a misleading "+100%".
 */
export function pctDelta(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}
