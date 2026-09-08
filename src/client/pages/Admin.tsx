import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { ErrorState, LoadingScreen } from "../components/ui";
import { PageHeader } from "../components/PageHeader";

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
      <PageHeader
        back={{ to: "/app", label: "Groups" }}
        title="Admin"
        subtitle="Catalogue, moderation and stats"
      />

      <div className="flex gap-1 rounded-2xl border border-paper-line bg-paper-soft p-1 text-sm font-semibold">
        {(["overview", "activities", "reports"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 capitalize transition-[background-color,color] ${
              tab === t
                ? "bg-paper-card text-navy shadow-sm"
                : "text-navy-400 hover:text-navy"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && stats && (
        <div className="stagger grid grid-cols-2 gap-3">
          {(
            [
              ["Users", stats.users, "bg-brand-500"],
              ["Groups", stats.groups, "bg-navy-700"],
              ["Activities", stats.activities, "bg-brand-400"],
              ["Open reports", stats.openReports, "bg-amber-400"],
            ] as const
          ).map(([label, n, edge]) => (
            <div key={label} className="card relative overflow-hidden p-4 pl-5">
              <span
                className={`absolute inset-y-0 left-0 w-1 ${edge}`}
                aria-hidden="true"
              />
              <p
                key={n}
                className="text-3xl font-extrabold tracking-[-0.03em] motion-safe:animate-count-pop"
              >
                {n}
              </p>
              <p className="eyebrow mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "activities" && (
        <div className="hairline">
          {acts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 p-3.5 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{a.title}</p>
                <p className="truncate text-xs text-navy-400">
                  {a.categoryId} · {a.locationLabel}
                </p>
              </div>
              <button
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                  a.active
                    ? "bg-lime-400/25 text-lime-700"
                    : "bg-navy/10 text-navy-400"
                }`}
                onClick={() => toggleActive(a)}
              >
                {a.active ? "Active" : "Hidden"}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "reports" && (
        <>
          {reports.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-sm font-semibold">Nothing to review</p>
              <p className="mt-1 text-xs text-navy-400">
                Reported activities and content will show up here.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {reports.map((r) => (
                <li key={r.id} className="card p-3.5 text-sm">
                  <p className="font-semibold capitalize">
                    {r.reason.replace("_", " ")} · {r.targetType}
                  </p>
                  <p className="mt-0.5 text-xs text-navy-400">
                    {r.detail || "No extra detail"}
                  </p>
                  <div className="mt-2.5 flex gap-1.5">
                    {["reviewing", "resolved", "dismissed"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setReport(r.id, s)}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize transition-colors ${
                          r.status === s
                            ? "bg-brand-500 text-white"
                            : "bg-paper-soft text-navy-400 hover:text-navy"
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
        </>
      )}
    </div>
  );
}
