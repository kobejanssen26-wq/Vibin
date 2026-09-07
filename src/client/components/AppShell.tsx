import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Wordmark } from "./Logo";
import { Avatar } from "./ui";
import { IconBell, IconLogout } from "./icons";
import { useAuth } from "../lib/auth";
import { usePoll } from "../lib/usePoll";
import { relativeTime } from "../lib/format";
import type { NotificationDTO } from "@shared/types";
import { api } from "../lib/api";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [panel, setPanel] = useState<"none" | "bell" | "menu">("none");
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data, refetch } = usePoll<{
    notifications: NotificationDTO[];
    unread: number;
  }>(user ? "/me/notifications" : null, 15000);

  // Close the open panel on outside click or Escape.
  useEffect(() => {
    if (panel === "none") return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPanel("none");
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel("none");
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  const openBell = async () => {
    setPanel(panel === "bell" ? "none" : "bell");
    if (panel !== "bell" && data?.unread) {
      await api("/me/notifications/read", { method: "POST", body: {} }).catch(
        () => {},
      );
      void refetch();
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-paper">
      <header
        ref={wrapRef}
        className="safe-t sticky top-0 z-40 border-b border-paper-line bg-paper/85 backdrop-blur"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <NavLink
            to="/app"
            aria-label="VIBIN home"
            className="rounded-lg transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Wordmark />
          </NavLink>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={openBell}
              aria-label={
                data?.unread
                  ? `Notifications, ${data.unread} unread`
                  : "Notifications"
              }
              aria-expanded={panel === "bell"}
              className="relative grid h-10 w-10 place-items-center rounded-full text-navy-500 transition hover:bg-navy/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <IconBell />
              {!!data?.unread && (
                <span className="absolute right-1.5 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white ring-2 ring-paper">
                  {data.unread > 9 ? "9+" : data.unread}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setPanel(panel === "menu" ? "none" : "menu")}
              aria-label="Account menu"
              aria-expanded={panel === "menu"}
              className="rounded-full transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Avatar name={user?.displayName ?? "?"} url={user?.avatarUrl} size={36} />
            </button>
          </div>
        </div>

        {panel === "bell" && (
          <div className="border-t border-paper-line bg-paper-card px-4 py-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-navy-400">
              Notifications
            </p>
            {data?.notifications.length ? (
              <ul className="-mx-2 max-h-72 space-y-1 overflow-auto">
                {data.notifications.slice(0, 15).map((n) => (
                  <li
                    key={n.id}
                    className="rounded-xl px-2 py-2 text-sm hover:bg-navy/5"
                  >
                    <p className="font-semibold text-navy">{n.title}</p>
                    {n.body && (
                      <p className="text-navy-400">{n.body}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-navy-300">
                      {relativeTime(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm text-navy-400">
                Nothing yet. You'll hear about matches, invites and messages here.
              </p>
            )}
          </div>
        )}

        {panel === "menu" && (
          <div className="border-t border-paper-line bg-paper-card p-2 text-sm">
            <MenuLink to="/settings" onClick={() => setPanel("none")}>
              Profile &amp; settings
            </MenuLink>
            {user?.role === "admin" && (
              <MenuLink to="/admin" onClick={() => setPanel("none")}>
                Admin
              </MenuLink>
            )}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-medium text-danger-600 hover:bg-danger-50"
              onClick={async () => {
                await logout();
                nav("/");
              }}
            >
              <IconLogout size={18} /> Log out
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>
    </div>
  );
}

function MenuLink({
  to,
  onClick,
  children,
}: {
  to: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className="block rounded-xl px-3 py-2.5 font-medium text-navy hover:bg-navy/5"
    >
      {children}
    </NavLink>
  );
}
