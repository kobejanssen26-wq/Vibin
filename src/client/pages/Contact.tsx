import { useState } from "react";
import { Link } from "react-router-dom";
import { IconArrowLeft } from "../components/icons";
import { Button, Field } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";

const REASONS = [
  { id: "problem", label: "Report a problem" },
  { id: "idea", label: "Suggest an idea" },
  { id: "business", label: "Business / partner inquiry" },
  { id: "activity_correction", label: "Activity correction" },
  { id: "question", label: "General question" },
  { id: "other", label: "Other" },
] as const;

export function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState<string>(REASONS[0].id);
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
      setErr(e instanceof ApiRequestError ? e.message : "Could not send your message.");
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
        <IconArrowLeft size={16} /> Back to VIBIN
      </Link>

      <h1 className="text-3xl font-extrabold tracking-[-0.02em]">Contact VIBIN</h1>
      <p className="mt-2 text-navy-500">
        Report a problem, suggest an idea, or say hi — we read everything.
      </p>

      {sent ? (
        <div className="mt-8 rounded-2xl border border-paper-line bg-paper-card p-6 text-center">
          <p className="text-lg font-bold">Thanks — that's on its way.</p>
          <p className="mt-1 text-sm text-navy-500">
            We'll get back to you at the email address you gave us.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          <Field
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
          <Field
            label="Your email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
          />

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-navy-700">
              What's this about?
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map((r) => (
                <label
                  key={r.id}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-paper-line px-3 py-2.5 text-sm transition-colors has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50"
                >
                  <input
                    type="radio"
                    name="reason"
                    className="h-4 w-4 accent-brand-500"
                    checked={reason === r.id}
                    onChange={() => setReason(r.id)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-navy-700">
              Message
            </span>
            <textarea
              className="field min-h-[120px] resize-none"
              maxLength={4000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what's going on…"
            />
          </label>

          {err && <p className="text-sm font-medium text-danger-600">{err}</p>}

          <Button
            className="w-full"
            loading={busy}
            disabled={!name.trim() || !email.trim() || message.trim().length < 5}
            onClick={submit}
          >
            Send message
          </Button>
        </div>
      )}
    </div>
  );
}
