import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cc } from "../api";
import { useDebounced } from "../lib";

interface Results {
  users: { id: string; email: string; displayName: string | null }[];
  groups: { id: string; name: string; status: string }[];
  activities: { id: string; title: string; city: string | null; status: string }[];
  reports: { id: string; targetType: string; targetId: string; reason: string; status: string }[];
  tickets: { id: string; subject: string; status: string; userEmail: string }[];
}

const EMPTY: Results = { users: [], groups: [], activities: [], reports: [], tickets: [] };

export function GlobalSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 250);
  const [results, setResults] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    let cancelled = false;
    setLoading(true);
    cc<Results>(`/search?q=${encodeURIComponent(debounced.trim())}`)
      .then((r) => !cancelled && setResults(r))
      .catch(() => !cancelled && setResults(EMPTY))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const go = (path: string) => {
    nav(path);
    setOpen(false);
    setQ("");
  };

  const hasQuery = debounced.trim().length >= 2;
  const totalResults =
    results.users.length +
    results.groups.length +
    results.activities.length +
    results.reports.length +
    results.tickets.length;

  return (
    <div ref={wrapRef} className="relative w-full max-w-sm">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search users, groups, activities…"
        aria-label="Search users, groups, activities, reports, and support tickets"
        role="combobox"
        aria-expanded={open && hasQuery}
        aria-haspopup="listbox"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-900 placeholder:text-slate-400 transition-shadow focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />
      {open && hasQuery && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-20 max-h-96 w-full min-w-[22rem] animate-float-up overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading && !totalResults ? (
            <p className="px-3 py-4 text-center text-xs text-slate-400">Searching…</p>
          ) : totalResults === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-400">No matches.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              <Group title="Users">
                {results.users.map((u) => (
                  <Row key={u.id} onClick={() => go(`/admin/users/${u.id}`)}>
                    <span className="font-medium text-slate-800">{u.displayName || u.email}</span>
                    <span className="ml-2 text-slate-400">{u.email}</span>
                  </Row>
                ))}
              </Group>
              <Group title="Groups">
                {results.groups.map((g) => (
                  <Row key={g.id} onClick={() => go(`/admin/groups/${g.id}`)}>
                    <span className="font-medium text-slate-800">{g.name}</span>
                    <span className="ml-2 text-slate-400">{g.status}</span>
                  </Row>
                ))}
              </Group>
              <Group title="Activities">
                {results.activities.map((a) => (
                  <Row key={a.id} onClick={() => go(`/admin/activities/${a.id}`)}>
                    <span className="font-medium text-slate-800">{a.title}</span>
                    <span className="ml-2 text-slate-400">{a.city || a.status}</span>
                  </Row>
                ))}
              </Group>
              <Group title="Reports">
                {results.reports.map((r) => (
                  <Row key={r.id} onClick={() => go(`/admin/reports/${r.id}`)}>
                    <span className="font-medium text-slate-800">
                      {r.targetType} · {r.reason}
                    </span>
                    <span className="ml-2 text-slate-400">{r.status}</span>
                  </Row>
                ))}
              </Group>
              <Group title="Support tickets">
                {results.tickets.map((t) => (
                  <Row key={t.id} onClick={() => go(`/admin/support/${t.id}`)}>
                    <span className="font-medium text-slate-800">{t.subject}</span>
                    <span className="ml-2 text-slate-400">{t.userEmail}</span>
                  </Row>
                ))}
              </Group>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const items = children as React.ReactNode[];
  const arr = Array.isArray(items) ? items : [items];
  if (arr.every((x) => !x)) return null;
  return (
    <div>
      <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full truncate px-3 py-2 text-left text-[13px] transition-colors hover:bg-slate-50"
    >
      {children}
    </button>
  );
}
