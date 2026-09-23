import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "./authLayout";
import { Button, Field } from "../components/ui";
import { useAuth } from "../lib/auth";
import { ApiRequestError } from "../lib/api";
import { LIMITS } from "@shared/constants";
import { useLang } from "../lib/i18n";

export function Signup() {
  const { t } = useLang();
  const { signup } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await signup(form);
      nav(loc.state?.from ?? "/app", { replace: true });
    } catch (e) {
      setErr(
        e instanceof ApiRequestError ? e.message : t("auth.signup.error"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={t("auth.signup.title")}
      subtitle={t("auth.signup.subtitle")}
      footer={
        <>
          {t("auth.signup.haveOne")}{" "}
          <Link to="/login" state={loc.state} className="font-semibold text-brand-600">
            {t("auth.login.submit")}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label={t("auth.signup.yourName")}
          autoComplete="name"
          required
          minLength={LIMITS.displayName.min}
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
        />
        <Field
          label={t("auth.email")}
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Field
          label={t("auth.password")}
          type="password"
          autoComplete="new-password"
          required
          minLength={LIMITS.password.min}
          hint={t("auth.signup.passwordHint", { min: LIMITS.password.min })}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {err && <p className="text-sm font-medium text-danger-600">{err}</p>}
        <Button type="submit" loading={busy} className="w-full">
          {t("auth.signup.submit")}
        </Button>
        <p className="text-center text-xs text-navy-400">
          {t("auth.signup.terms")}{" "}
          <Link to="/terms" className="underline">
            {t("auth.signup.termsLink")}
          </Link>{" "}
          {t("auth.signup.and")}{" "}
          <Link to="/privacy" className="underline">
            {t("auth.signup.privacyLink")}
          </Link>
          .
        </p>
      </form>
    </AuthLayout>
  );
}
