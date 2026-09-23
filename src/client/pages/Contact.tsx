import { useState } from "react";
import { Link } from "react-router-dom";
import { IconArrowLeft } from "../components/icons";
import { Button, Field } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { useLang, type Key } from "../lib/i18n";

const REASONS = ["problem", "idea", "business", "activity_correction", "question", "other"] as const;

export function Contact() {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api("/contact", {
        method: "POST",
        body: { name: name.trim(), email: email.trim(), reason, message: message.trim() },
      });
      setSent(true);
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : t("contact.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-1 text-sm font-semibold text-navy-500 hover:text-navy"
      >
        <IconArrowLeft size={16} /> {t("contact.back")}
      </Link>

      <h1 className="text-3xl font-extrabold tracking-[-0.02em]">{t("contact.title")}</h1>
      <p className="mt-2 text-navy-500">
        {t("contact.subtitle")}
      </p>

      {sent ? (
        <div className="mt-8 rounded-2xl border border-paper-line bg-paper-card p-6 text-center">
          <p className="text-lg font-bold">{t("contact.sentTitle")}</p>
          <p className="mt-1 text-sm text-navy-500">
            {t("contact.sentBody")}
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          <Field
            label={t("contact.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
          <Field
            label={t("contact.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
          />

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-navy-700">
              {t("contact.about")}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map((r) => (
                <label
                  key={r}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-paper-line px-3 py-2.5 text-sm transition-colors has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50"
                >
                  <input
                    type="radio"
                    name="reason"
                    className="h-4 w-4 accent-brand-500"
                    checked={reason === r}
                    onChange={() => setReason(r)}
                  />
                  {t(`contact.reason.${r}` as Key)}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-navy-700">
              {t("contact.message")}
            </span>
            <textarea
              className="field min-h-[120px] resize-none"
              maxLength={4000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("contact.placeholder")}
            />
          </label>

          {err && <p className="text-sm font-medium text-danger-600">{err}</p>}

          <Button
            className="w-full"
            loading={busy}
            disabled={!name.trim() || !email.trim() || message.trim().length < 5}
            onClick={submit}
          >
            {t("contact.send")}
          </Button>
        </div>
      )}
    </div>
  );
}
