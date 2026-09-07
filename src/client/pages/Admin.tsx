import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { ErrorState, LoadingScreen } from "../components/ui";

interface Stats {
  users: number;
  groups: number;
  activities: number;
  openReports: number;
}
interface Row {
  id: string;
  title: string;
  categoryId: string;
  locationLabel: string;
  active: number;
}
interface Report {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  detail: string;
  status: string;
  createdAt: number;
}

export function Admin() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [acts, setActs] = useState<Row[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "activities" | "reports">(
    "overview",
  );

  const reload = async () => {
    const [s, a, r] = await Promise.all([
      api<Stats>("/admin/stats"),
      api<{ activities: Row[] }>("/admin/activities"),
      api<{ reports: Report[] }>("/admin/reports"),
    ]);
    setStats(s);
    setActs(a.activities);
    setReports(r.reports);
    setLoading(false);
  };

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, []);

  if (user?.role !== "admin")
    return (
      <ErrorState title="Admins only" message="You don’t have admin access." />
    );
  if (loading) return <LoadingScreen />;

  const toggleActive = async (row: Row) => {
    await api(`/admin/activities/${row.id}`, {
      method: "PUT",
      body: { active: !row.active },
    });
    await reload();
  };

  const setReport = async (id: string, status: string) => {
    await api(`/admin/reports/${id}`, { method: "PATCH", body: { status } });
    await reload();
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Admin</h1>

      <div className="flex gap-1 rounded-2xl bg-paper-soft p-1 text-sm font-semibold">
        {(["overview", "activities", "reports"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 capitalize ${
              tab === t ? "bg-white shadow-card" : "text-navy-400"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && stats && (
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["Users", stats.users],
              ["Groups", stats.groups],
              ["Activities", stats.activities],
              ["Open reports", stats.openReports],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="card p-4">
              <p className="text-3xl font-extrabold">{n}</p>
              <p className="text-sm text-navy-400">{label}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "activities" && (
        <ul className="space-y-2">
          {acts.map((a) => (
            <li
              key={a.id}
              className="card flex items-center justify-between p-3 text-sm"
            >
              <div>
                <p className="font-semibold">{a.title}</p>
                <p className="text-xs text-navy-400">
                  {a.categoryId} · {a.locationLabel}
                </p>
              </div>
              <button
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  a.active
                    ? "bg-lime-400/20 text-lime-700"
                    : "bg-navy/10 text-navy-400"
                }`}
                onClick={() => toggleActive(a)}
              >
                {a.active ? "Active" : "Hidden"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {tab === "reports" && (
        <ul className="space-y-2">
          {reports.length === 0 && (
            <p className="text-sm text-navy-400">No reports.</p>
          )}
          {reports.map((r) => (
            <li key={r.id} className="card p-3 text-sm">
              <p className="font-semibold">
                {r.reason} · {r.targetType}
              </p>
              <p className="text-xs text-navy-400">{r.detail || "—"}</p>
              <div className="mt-2 flex gap-2">
                {["reviewing", "resolved", "dismissed"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setReport(r.id, s)}
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      r.status === s
                        ? "bg-brand-500 text-white"
                        : "bg-paper-soft text-navy-400"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
