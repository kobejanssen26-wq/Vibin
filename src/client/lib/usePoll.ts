import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/**
 * Near-realtime via polling. Deliberately simple for the MVP; the API shape
 * (discrete state snapshots) is already WebSocket/Durable-Object friendly, so
 * this hook can be swapped for a socket subscription without touching callers.
 */
export function usePoll<T>(
  path: string | null,
  intervalMs = 4000,
): {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const active = useRef(true);

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const res = await api<T>(path);
      if (active.current) {
        setData(res);
        setError(null);
      }
    } catch (e) {
      if (active.current) setError(e as Error);
    } finally {
      if (active.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    active.current = true;
    setLoading(true);
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, intervalMs);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active.current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, intervalMs]);

  return { data, error, loading, refetch: load };
}
