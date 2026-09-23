import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "./authLayout";
import { Button, Field } from "../components/ui";
import { api } from "../lib/api";
import { useLang } from "../lib/i18n";

export function ForgotPassword() {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/auth/request-reset", { method: "POST", body: { email } });
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={t("auth.forgot.title")}
      subtitle={t("auth.forgot.subtitle")}
      footer={
        <Link to="/login" className="font-semibold text-brand-600">
          {t("auth.forgot.backToLogin")}
        </Link>
      }
    >
      {sent ? (
        <p className="text-sm text-navy-400">{t("auth.forgot.sent", { email })}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field
            label={t("auth.email")}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" loading={busy} className="w-full">
            {t("auth.forgot.submit")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
