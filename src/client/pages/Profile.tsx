import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, ApiRequestError } from "../lib/api";
import { Avatar, Button, Field, Modal, SectionHead } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import type { Me } from "@shared/types";

export function Profile() {
  const { user, setUser, logout } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({
    displayName: user?.displayName ?? "",
    age: user?.age?.toString() ?? "",
    locationLabel: user?.locationLabel ?? "",
    bio: user?.bio ?? "",
  });
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ prefs: Record<string, boolean> }>("/me/notification-prefs")
      .then((r) => setPrefs(r.prefs))
      .catch(() => {});
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { user } = await api<{ user: Me }>("/me", {
        method: "PATCH",
        body: {
          displayName: form.displayName.trim(),
          age: form.age ? Number(form.age) : null,
          locationLabel: form.locationLabel.trim() || null,
          bio: form.bio.trim() || null,
        },
      });
      setUser(user);
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof ApiRequestError ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { user } = await api<{ user: Me }>("/me/avatar", {
        method: "POST",
        body: fd,
      });
      setUser(user);
    } catch (e) {
      setMsg(e instanceof ApiRequestError ? e.message : "Upload failed.");
    }
  };

  const savePrefs = async (next: Record<string, boolean>) => {
    setPrefs(next);
    await api("/me/notification-prefs", { method: "PUT", body: next }).catch(
      () => {},
    );
  };

  const exportData = async () => {
    const data = await api("/me/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vibin-data-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

  const deleteAccount = async () => {
    setDelBusy(true);
    setDelErr(null);
    try {
      await api("/me/delete", { method: "POST", body: { password: delPw } });
      await logout();
      nav("/");
    } catch (e) {
      setDelErr(
        e instanceof ApiRequestError ? e.message : "Could not delete your account.",
      );
    } finally {
      setDelBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-7">
      <PageHeader
        back={{ to: "/app", label: "Groups" }}
        title="Profile & settings"
      />

      <div className="card flex items-center gap-4 p-4">
        <Avatar name={user.displayName} url={user.avatarUrl} size={60} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{user.displayName}</p>
          <p className="truncate text-xs text-navy-400">{user.email}</p>
        </div>
        <label className="btn-outline shrink-0 cursor-pointer text-sm">
          Change photo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) =>
              e.target.files?.[0] && uploadAvatar(e.target.files[0])
            }
          />
        </label>
      </div>

      <section>
        <SectionHead label="Your profile" />
        <form onSubmit={save} className="card space-y-4 p-4">
          <Field
            label="Name"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Age (optional)"
              type="number"
              min={13}
              max={120}
              value={form.age}
              onChange={(e) => setForm({ ...form, age: e.target.value })}
            />
            <Field
              label="Location (optional)"
              value={form.locationLabel}
              onChange={(e) =>
                setForm({ ...form, locationLabel: e.target.value })
              }
            />
          </div>
          <Field
            label="Bio (optional)"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
          {msg && (
            <p className="text-sm font-medium text-lime-700">{msg}</p>
          )}
          <Button type="submit" loading={busy} className="w-full">
            Save changes
          </Button>
        </form>
      </section>

      <section>
        <SectionHead label="Notifications" />
        <div className="card divide-y divide-paper-line">
          {(
            [
              ["invites", "Group invites"],
              ["joins", "Someone joins your group"],
              ["activityMatch", "Activity matches"],
              ["dateVoting", "Date voting starts"],
              ["dateMatch", "Date is decided"],
              ["upcoming", "Upcoming activity reminders"],
              ["messages", "Group messages"],
            ] as [string, string][]
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm"
            >
              {label}
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-500"
                checked={prefs[key] ?? true}
                onChange={(e) =>
                  savePrefs({ ...prefs, [key]: e.target.checked })
                }
              />
            </label>
          ))}
        </div>
      </section>

      <section>
        <SectionHead label="Your data" />
        <div className="card divide-y divide-paper-line">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-semibold">Export</p>
              <p className="text-xs text-navy-400">
                Everything we hold on you, as JSON.
              </p>
            </div>
            <button
              className="btn-outline shrink-0 px-3 py-2 text-sm"
              onClick={exportData}
            >
              Download
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-semibold text-danger-600">
                Delete account
              </p>
              <p className="text-xs text-navy-400">Permanent. Can't be undone.</p>
            </div>
            <button
              className="btn-outline shrink-0 !border-danger-200 px-3 py-2 text-sm text-danger-600 hover:!border-danger-400"
              onClick={() => {
                setDelPw("");
                setDelErr(null);
                setDelOpen(true);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </section>

      {delOpen && (
        <Modal title="Delete your account" onClose={() => setDelOpen(false)}>
          <p className="text-sm text-navy-500">
            This permanently removes your profile, group memberships, votes and
            messages. Groups you created are handed to another active member, or
            archived if there is none. This can't be undone.
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void deleteAccount();
            }}
          >
            <Field
              label="Confirm your password"
              type="password"
              autoComplete="current-password"
              required
              value={delPw}
              onChange={(e) => setDelPw(e.target.value)}
              error={delErr ?? undefined}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => setDelOpen(false)}
              >
                Keep my account
              </Button>
              <Button
                type="submit"
                variant="dark"
                loading={delBusy}
                disabled={!delPw}
                className="flex-1 !bg-danger-600 hover:!bg-danger-700"
              >
                Delete forever
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
