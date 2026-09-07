import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "./authLayout";
import { Button, Field } from "../components/ui";
import { api } from "../lib/api";

export function ForgotPassword() {
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
      title="Reset your password"
      subtitle="We’ll email you a link to set a new one."
      footer={
        <Link to="/login" className="font-semibold text-brand-600">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <p className="text-sm text-navy-400">
          If an account exists for <strong>{email}</strong>, a reset link is on
          its way. In development the link is printed to the server console.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" loading={busy} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
