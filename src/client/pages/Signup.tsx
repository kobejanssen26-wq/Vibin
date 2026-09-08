import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "./authLayout";
import { Button, Field } from "../components/ui";
import { useAuth } from "../lib/auth";
import { ApiRequestError } from "../lib/api";
import { LIMITS } from "@shared/constants";

export function Signup() {
  const { signup } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await signup(form);
      nav("/app", { replace: true });
    } catch (e) {
      setErr(
        e instanceof ApiRequestError ? e.message : "Could not create account.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="One account, unlimited groups."
      footer={
        <>
          Already have one?{" "}
          <Link to="/login" className="font-semibold text-brand-600">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Your name"
          autoComplete="name"
          required
          minLength={LIMITS.displayName.min}
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={LIMITS.password.min}
          hint={`At least ${LIMITS.password.min} characters.`}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {err && <p className="text-sm font-medium text-danger-600 motion-safe:animate-shake">{err}</p>}
        <Button type="submit" loading={busy} className="w-full">
          Create account
        </Button>
        <p className="text-center text-xs text-navy-400">
          By continuing you agree to our{" "}
          <Link to="/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthLayout>
  );
}
