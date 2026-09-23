import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, ApiRequestError } from "../lib/api";
import { Avatar, Button, Field, Modal, SectionHead } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { Reveal } from "../components/Reveal";
import { LANGUAGES, useLang, type Key } from "../lib/i18n";
import type { Me } from "@shared/types";

export function Profile() {
  const { t, lang, setLang } = useLang();
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
      setMsg(t("profile.saved"));
    } catch (e) {
      setMsg(e instanceof ApiRequestError ? e.message : t("profile.saveError"));
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
      setMsg(e instanceof ApiRequestError ? e.message : t("profile.uploadError"));
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
        e instanceof ApiRequestError ? e.message : t("profile.deleteError"),
      );
    } finally {
      setDelBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-7">
      <PageHeader
        back={{ to: "/app", label: t("profile.back") }}
        title={t("shell.profileSettings")}
      />

      <Reveal className="card flex items-center gap-4 p-4">
        <Avatar name={user.displayName} url={user.avatarUrl} size={60} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{user.displayName}</p>
          <p className="truncate text-xs text-navy-400">{user.email}</p>
        </div>
        <label className="btn-outline shrink-0 cursor-pointer text-sm">
          {t("profile.changePhoto")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) =>
              e.target.files?.[0] && uploadAvatar(e.target.files[0])
            }
          />
        </label>
      </Reveal>

      <Reveal as="section" delay={60}>
        <SectionHead label={t("profile.yourProfile")} />
        <form onSubmit={save} className="card space-y-4 p-4">
          <Field
            label={t("profile.name")}
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t("profile.age")}
              type="number"
              min={13}
              max={120}
              value={form.age}
              onChange={(e) => setForm({ ...form, age: e.target.value })}
            />
            <Field
              label={t("profile.location")}
              value={form.locationLabel}
              onChange={(e) =>
                setForm({ ...form, locationLabel: e.target.value })
              }
            />
          </div>
          <Field
            label={t("profile.bio")}
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
          {msg && (
            <p className="text-sm font-medium text-lime-700">{msg}</p>
          )}
          <Button type="submit" loading={busy} className="w-full">
            {t("profile.saveChanges")}
          </Button>
        </form>
      </Reveal>

      <Reveal as="section" delay={120}>
        <SectionHead label={t("profile.notifications")} />
        <div className="card divide-y divide-paper-line">
          {(
            ["invites", "joins", "activityMatch", "dateVoting", "dateMatch", "upcoming", "messages"] as const
          ).map((key) => (
            <label
              key={key}
              className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm"
            >
              {t(`profile.notif.${key}` as Key)}
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
      </Reveal>

      <Reveal as="section" delay={150}>
        <SectionHead label={t("profile.language")} />
        <div className="card p-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("profile.language")}>
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                aria-pressed={lang === l.code}
                className={lang === l.code ? "chip-on" : "chip"}
                onClick={() => setLang(l.code)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-navy-400">{t("profile.languageHint")}</p>
        </div>
      </Reveal>

      <Reveal delay={180}>
        <SecuritySection currentEmail={user.email} />
      </Reveal>

      <Reveal as="section" delay={240}>
        <SectionHead label={t("profile.help")} />
        <div className="card">
          <Link
            to="/help"
            className="flex items-center justify-between px-4 py-3.5 text-sm font-semibold text-navy transition-colors hover:bg-navy/5"
          >
            {t("help.title")}
            <span className="text-navy-300">›</span>
          </Link>
        </div>
      </Reveal>

      <Reveal as="section" delay={300}>
        <SectionHead label={t("profile.yourData")} />
        <div className="card divide-y divide-paper-line">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-semibold">{t("profile.export")}</p>
              <p className="text-xs text-navy-400">
                {t("profile.exportHint")}
              </p>
            </div>
            <button
              className="btn-outline shrink-0 px-3 py-2 text-sm"
              onClick={exportData}
            >
              {t("profile.download")}
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-semibold text-danger-600">
                {t("profile.deleteAccount")}
              </p>
              <p className="text-xs text-navy-400">{t("profile.deleteHint")}</p>
            </div>
            <button
              className="btn-outline shrink-0 !border-danger-200 px-3 py-2 text-sm text-danger-600 hover:!border-danger-400"
              onClick={() => {
                setDelPw("");
                setDelErr(null);
                setDelOpen(true);
              }}
            >
              {t("profile.delete")}
            </button>
          </div>
        </div>
      </Reveal>

      {delOpen && (
        <Modal title={t("profile.deleteTitle")} onClose={() => setDelOpen(false)}>
          <p className="text-sm text-navy-500">
            {t("profile.deleteBody")}
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void deleteAccount();
            }}
          >
            <Field
              label={t("profile.confirmPassword")}
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
                {t("profile.keepAccount")}
              </Button>
              <Button
                type="submit"
                variant="dark"
                loading={delBusy}
                disabled={!delPw}
                className="flex-1 !bg-danger-600 hover:!bg-danger-700"
              >
                {t("profile.deleteForever")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function SecuritySection({ currentEmail }: { currentEmail: string }) {
  const { t } = useLang();
  const { user, setUser } = useAuth();
  const [open, setOpen] = useState<"none" | "email" | "password">("none");

  const [emailForm, setEmailForm] = useState({ newEmail: "", password: "" });
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  const changeEmail = async (e: FormEvent) => {
    e.preventDefault();
    setEmailBusy(true);
    setEmailErr(null);
    setEmailMsg(null);
    try {
      const r = await api<{ email: string }>("/me/email", {
        method: "PATCH",
        body: { newEmail: emailForm.newEmail.trim(), currentPassword: emailForm.password },
      });
      if (user) setUser({ ...user, email: r.email, emailVerified: false });
      setEmailMsg(t("profile.emailUpdated"));
      setEmailForm({ newEmail: "", password: "" });
      setOpen("none");
    } catch (e) {
      setEmailErr(e instanceof ApiRequestError ? e.message : t("profile.emailError"));
    } finally {
      setEmailBusy(false);
    }
  };

  const [pwForm, setPwForm] = useState({ current: "", next: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwBusy(true);
    setPwErr(null);
    setPwMsg(null);
    try {
      await api("/me/password", {
        method: "PATCH",
        body: { currentPassword: pwForm.current, newPassword: pwForm.next },
      });
      setPwMsg(t("profile.passwordChanged"));
      setPwForm({ current: "", next: "" });
      setOpen("none");
    } catch (e) {
      setPwErr(e instanceof ApiRequestError ? e.message : t("profile.passwordError"));
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <section>
      <SectionHead label={t("profile.security")} />
      <div className="card divide-y divide-paper-line">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm"
          onClick={() => setOpen(open === "email" ? "none" : "email")}
        >
          <div>
            <p className="font-semibold">{t("auth.email")}</p>
            <p className="text-xs text-navy-400">{currentEmail}</p>
          </div>
          <span className="text-xs font-semibold text-brand-600">{t("profile.change")}</span>
        </button>
        {open === "email" && (
          <form onSubmit={changeEmail} className="space-y-3 px-4 py-4">
            <Field
              label={t("profile.newEmail")}
              type="email"
              required
              value={emailForm.newEmail}
              onChange={(e) => setEmailForm({ ...emailForm, newEmail: e.target.value })}
            />
            <Field
              label={t("profile.currentPassword")}
              type="password"
              required
              value={emailForm.password}
              onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
              error={emailErr ?? undefined}
            />
            <Button type="submit" loading={emailBusy} className="w-full">
              {t("profile.updateEmail")}
            </Button>
          </form>
        )}

        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm"
          onClick={() => setOpen(open === "password" ? "none" : "password")}
        >
          <div>
            <p className="font-semibold">{t("auth.password")}</p>
            <p className="text-xs text-navy-400">••••••••</p>
          </div>
          <span className="text-xs font-semibold text-brand-600">{t("profile.change")}</span>
        </button>
        {open === "password" && (
          <form onSubmit={changePassword} className="space-y-3 px-4 py-4">
            <Field
              label={t("profile.currentPassword")}
              type="password"
              autoComplete="current-password"
              required
              value={pwForm.current}
              onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
            />
            <Field
              label={t("auth.reset.newPassword")}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={pwForm.next}
              onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
              error={pwErr ?? undefined}
            />
            <Button type="submit" loading={pwBusy} className="w-full">
              {t("auth.reset.submit")}
            </Button>
          </form>
        )}
      </div>
      {(emailMsg || pwMsg) && (
        <p className="mt-2 text-xs font-medium text-lime-700">{emailMsg || pwMsg}</p>
      )}
    </section>
  );
}
