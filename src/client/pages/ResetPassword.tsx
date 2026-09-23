import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "./authLayout";
import { Button, Field } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { LIMITS } from "@shared/constants";
import { useLang } from "../lib/i18n";

export function ResetPassword() {
  const { t } = useLang();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/auth/reset", { method: "POST", body: { token, password } });
      setDone(true);
      setTimeout(() => nav("/login", { replace: true }), 1500);
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : t("auth.reset.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t("auth.reset.title")}>
      {!token ? (
        <p className="text-sm text-danger-600">
          {t("auth.reset.missingToken")}{" "}
          <Link to="/forgot-password" className="underline">
            {t("auth.reset.here")}
          </Link>
          .
        </p>
      ) : done ? (
        <p className="text-sm text-navy-400">{t("auth.reset.done")}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field
            label={t("auth.reset.newPassword")}
            type="password"
            autoComplete="new-password"
            required
            minLength={LIMITS.password.min}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {err && <p className="text-sm font-medium text-danger-600">{err}</p>}
          <Button type="submit" loading={busy} className="w-full">
            {t("auth.reset.submit")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
