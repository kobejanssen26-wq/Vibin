import { useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Wordmark } from "./Logo";
import { Avatar } from "./ui";
import { useAuth } from "../lib/auth";
import { usePoll } from "../lib/usePoll";
import type { NotificationDTO } from "@shared/types";
import { api } from "../lib/api";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const { data, refetch } = usePoll<{
    notifications: NotificationDTO[];
    unread: number;
  }>(user ? "/me/notifications" : null, 15000);

  const markRead = async () => {
    await api("/me/notifications/read", { method: "POST", body: {} });
    void refetch();
  };

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-paper">
      <header className="safe-t sticky top-0 z-30 flex items-center justify-between border-b border-navy/5 bg-paper/90 px-4 py-3 backdrop-blur">
        <Link to="/app" aria-label="VIBIN home" className="transition-transform active:scale-95">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1">
          <button
            className="relative rounded-full p-2 hover:bg-navy/5"
            onClick={() => {
              setBell((v) => !v);
              if (!bell && data?.unread) void markRead();
            }}
            aria-label="Notifications"
          >
            <span className="text-lg">🔔</span>
            {!!data?.unread && (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-white">
                {data.unread}
              </span>
            )}
          </button>
          <button
            onClick={() => setMenu((v) => !v)}
            aria-label="Account menu"
          >
            <Avatar name={user?.displayName ?? "?"} url={user?.avatarUrl} size={34} />
          </button>
        </div>
      </header>

      {bell && (
        <div className="border-b border-navy/5 bg-white px-4 py-2">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-navy-400">
            Notifications
          </p>
          {data?.notifications.length ? (
            <ul className="max-h-64 space-y-2 overflow-auto py-1">
              {data.notifications.slice(0, 12).map((n) => (
                <li key={n.id} className="text-sm">
                  <span className="font-semibold">{n.title}</span>
                  {n.body && (
                    <span className="block text-navy-400">{n.body}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-sm text-navy-400">Nothing yet.</p>
          )}
        </div>
      )}

      {menu && (
        <div className="border-b border-navy/5 bg-white px-4 py-2 text-sm">
          <NavLink
            to="/settings"
            className="block rounded-lg px-2 py-2 hover:bg-navy/5"
            onClick={() => setMenu(false)}
          >
            Profile & settings
          </NavLink>
          {user?.role === "admin" && (
            <NavLink
              to="/admin"
              className="block rounded-lg px-2 py-2 hover:bg-navy/5"
              onClick={() => setMenu(false)}
            >
              Admin
            </NavLink>
          )}
          <button
            className="block w-full rounded-lg px-2 py-2 text-left text-danger-600 hover:bg-navy/5"
            onClick={async () => {
              await logout();
              nav("/");
            }}
          >
            Log out
          </button>
        </div>
      )}

      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>
    </div>
  );
}
