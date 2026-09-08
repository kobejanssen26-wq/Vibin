import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAdminAuth } from "./auth";
import { Btn } from "./ui";

const NAV: { to: string; label: string; group: string }[] = [
  { to: "/admin", label: "Dashboard", group: "" },
  { to: "/admin/users", label: "Users", group: "Data" },
  { to: "/admin/groups", label: "Groups", group: "Data" },
  { to: "/admin/activities", label: "Activities", group: "Data" },
  { to: "/admin/providers", label: "Providers", group: "Data" },
  { to: "/admin/analytics", label: "Analytics", group: "Insight" },
  { to: "/admin/funnel", label: "Funnel & retention", group: "Insight" },
  { to: "/admin/errors", label: "Errors", group: "Ops" },
  { to: "/admin/system", label: "System health", group: "Ops" },
  { to: "/admin/flags", label: "Feature flags", group: "Ops" },
  { to: "/admin/audit", label: "Audit log", group: "Security" },
  { to: "/admin/sessions", label: "Admin sessions", group: "Security" },
  { to: "/admin/vault", label: "Credential vault", group: "Security" },
  { to: "/admin/settings", label: "Settings", group: "Security" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAdminAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex max-w-[1400px]">
        {/* sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-56 shrink-0 overflow-y-auto bg-navy px-3 py-4 text-slate-300 transition-transform lg:static lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-4 flex items-center gap-2 px-1">
            <span className="grid h-6 w-6 place-items-center rounded bg-white/10 text-[11px] font-black text-white">
              V
            </span>
            <span className="text-xs font-semibold text-white">
              Command Center
            </span>
          </div>
          {groups.map((g) => (
            <div key={g} className="mb-3">
              {g && (
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {g}
                </p>
              )}
              {NAV.filter((n) => n.group === g).map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === "/admin"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </div>
          ))}
        </aside>

        {open && (
          <button
            aria-label="Close menu"
            className="fixed inset-0 z-20 bg-black/30 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        {/* main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
            <div className="flex items-center gap-2">
              <button
                className="rounded p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open menu"
              >
                ☰
              </button>
              <span className="text-xs text-slate-500">
                {import.meta.env.DEV ? "development" : "production"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">{user?.email}</span>
              <Btn
                variant="ghost"
                className="!py-1 !text-xs"
                onClick={async () => {
                  await logout();
                  nav("/admin");
                }}
              >
                Sign out
              </Btn>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
