import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminApiError } from "./api";
import { Select } from "./ui";

/* ------------------------------ useResource ------------------------------ */

interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Fetch-on-mount + on dep change. `key` forces a refetch when it changes
 * (e.g. a serialised query). Cancels stale responses.
 */
export function useResource<T>(
  fetcher: () => Promise<T>,
  key: string,
): ResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fetchRef
      .current()
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (!live) return;
        setError(
          e instanceof AdminApiError || e instanceof Error
            ? e.message
            : "Request failed.",
        );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}

/* ----------------------------- date ranges ----------------------------- */

export const RANGES = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "ytd", label: "This year" },
  { id: "custom", label: "Custom range" },
] as const;

export type RangeId = (typeof RANGES)[number]["id"];

/** URL-synced range state: `?range=30d` or `?range=custom&from=…&to=…`. */
export function useRange(defaultRange: RangeId = "30d") {
  const [sp, setSp] = useSearchParams();
  const range = (sp.get("range") as RangeId) || defaultRange;
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";

  const set = useCallback(
    (next: { range?: RangeId; from?: string; to?: string }) => {
      setSp(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next.range) p.set("range", next.range);
          if (next.from !== undefined)
            next.from ? p.set("from", next.from) : p.delete("from");
          if (next.to !== undefined)
            next.to ? p.set("to", next.to) : p.delete("to");
          if (next.range && next.range !== "custom") {
            p.delete("from");
            p.delete("to");
          }
          return p;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const query =
    range === "custom" && from && to
      ? `range=custom&from=${from}&to=${to}`
      : `range=${range}`;

  return { range, from, to, set, query };
}

export function RangePicker() {
  const { range, from, to, set } = useRange();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={range}
        onChange={(e) => set({ range: e.target.value as RangeId })}
      >
        {RANGES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </Select>
      {range === "custom" && (
        <>
          <input
            type="date"
            value={from}
            onChange={(e) => set({ from: e.target.value })}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-[13px]"
          />
          <span className="text-slate-400">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => set({ to: e.target.value })}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-[13px]"
          />
        </>
      )}
    </div>
  );
}

/* --------------------------- debounced value --------------------------- */

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
