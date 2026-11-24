import { useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAdminAuth, useCan } from "./auth";
import { LogoMark } from "../components/Logo";
import { GlobalSearch } from "./components/GlobalSearch";
import { Btn } from "./ui";

/** `need`: who sees the entry. "owner" = owner only, "any" = any signed-in staff, else a developer permission. */
const NAV: { to: string; label: string; group: string; need: string }[] = [
  { to: "/admin", label: "Dashboard", group: "", need: "any" },
  { to: "/admin/users", label: "Users", group: "Data", need: "owner" },
  { to: "/admin/groups", label: "Groups", group: "Data", need: "owner" },
  { to: "/admin/swipe", label: "Swipe Manager", group: "Data", need: "owner" },
  { to: "/admin/activities", label: "Activities", group: "Data", need: "catalogue" },
  { to: "/admin/events", label: "Live events", group: "Data", need: "events" },
  { to: "/admin/providers", label: "Providers", group: "Data", need: "owner" },
  { to: "/admin/outreach", label: "Outreach", group: "Data", need: "owner" },
  { to: "/admin/quality", label: "Catalogus-kwaliteit", group: "Data", need: "catalogue" },
  { to: "/admin/categories", label: "Categories", group: "Data", need: "catalogue" },
  { to: "/admin/data-quality", label: "Data quality", group: "Insight", need: "catalogue" },
  { to: "/admin/analytics", label: "Analytics", group: "Insight", need: "owner" },
  { to: "/admin/funnel", label: "Funnel & retention", group: "Insight", need: "owner" },
  { to: "/admin/errors", label: "Errors", group: "Ops", need: "owner" },
  { to: "/admin/system", label: "System health", group: "Ops", need: "owner" },
  { to: "/admin/flags", label: "Feature flags", group: "Ops", need: "owner" },
  { to: "/admin/reports", label: "Reports", group: "Moderation", need: "support" },
  { to: "/admin/support", label: "Support", group: "Moderation", need: "support" },
  { to: "/admin/files", label: "File Manager", group: "Developer", need: "files.read" },
  { to: "/admin/team", label: "Team / Developers", group: "Developer", need: "team.manage" },
  { to: "/admin/audit", label: "Audit log", group: "Security", need: "owner" },
  { to: "/admin/sessions", label: "Admin sessions", group: "Security", need: "owner" },
  { to: "/admin/vault", label: "Credential vault", group: "Security", need: "owner" },
  { to: "/admin/settings", label: "Settings", group: "Security", need: "owner" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAdminAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const can = useCan();
  const visible = NAV.filter((n) => can(n.need));
  const groups = [...new Set(visible.map((n) => n.group))];
  const isOwner = user?.role === "owner";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex max-w-[1400px]">
        {/* sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-56 shrink-0 overflow-y-auto bg-navy px-3 py-4 text-slate-300 transition-transform lg:static lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <NavLink
            to="/admin"
            end
            aria-label="Command Center home"
            className="mb-4 flex items-center gap-2 rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <LogoMark className="h-6 w-6 shrink-0" onDark />
            <span className="text-xs font-semibold text-white">
              Command Center
            </span>
          </NavLink>
          {groups.map((g) => (
            <div key={g} className="mb-3">
              {g && (
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {g}
                </p>
              )}
              {visible.filter((n) => n.group === g).map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === "/admin"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `relative block rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                      isActive
                        ? "bg-white/10 text-white before:absolute before:-left-3 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-lime-400"
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
            className="fixed inset-0 z-20 animate-fade-in bg-black/30 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        {/* main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
            <div className="flex items-center gap-2">
              <button
                className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 active:scale-95 lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open menu"
              >
                ☰
              </button>
              <span className="hidden text-xs text-slate-500 sm:inline">
                {import.meta.env.DEV ? "development" : "production"}
              </span>
            </div>
            {isOwner ? <GlobalSearch /> : <span />}
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate-500 sm:inline">{user?.email}</span>
              {!isOwner && (
                <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                  Developer
                </span>
              )}
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
          <main className="flex-1 p-4 sm:p-6">
            <div key={location.pathname} className="animate-float-up">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
