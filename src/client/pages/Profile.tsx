import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, ApiRequestError } from "../lib/api";
import { Avatar, Button, Field } from "../components/ui";
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
    a.download = "mingo-data-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteAccount = async () => {
    const password = prompt(
      "This permanently deletes your account and data. Enter your password to confirm:",
    );
    if (!password) return;
    try {
      await api("/me/delete", { method: "POST", body: { password } });
      await logout();
      nav("/");
    } catch (e) {
      alert(e instanceof ApiRequestError ? e.message : "Could not delete.");
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-7">
      <h1 className="text-2xl font-extrabold">Profile & settings</h1>

      <div className="flex items-center gap-4">
        <Avatar name={user.displayName} url={user.avatarUrl} size={64} />
        <label className="btn-ghost cursor-pointer text-sm">
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

      <form onSubmit={save} className="space-y-4">
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
        {msg && <p className="text-sm text-ink-muted">{msg}</p>}
        <Button type="submit" loading={busy}>
          Save changes
        </Button>
      </form>

      <section>
        <h2 className="mb-2 font-bold">Notifications</h2>
        <div className="card divide-y divide-ink/5">
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
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
              {label}
              <input
                type="checkbox"
                className="h-5 w-5 accent-grape-500"
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
        <h2 className="mb-2 font-bold">Your data</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={exportData}>
            Export my data (JSON)
          </button>
          <button
            className="btn-ghost text-coral-600"
            onClick={deleteAccount}
          >
            Delete my account
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Account: {user.email}
          {user.emailVerified ? " · verified" : " · not verified"}
        </p>
      </section>
    </div>
  );
}
