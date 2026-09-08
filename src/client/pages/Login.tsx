import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "./authLayout";
import { Button, Field } from "../components/ui";
import { useAuth } from "../lib/auth";
import { ApiRequestError } from "../lib/api";

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(form);
      nav(loc.state?.from ?? "/app", { replace: true });
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to keep planning with your group."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" className="font-semibold text-brand-600">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
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
          autoComplete="current-password"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {err && <p className="text-sm font-medium text-danger-600">{err}</p>}
        <Button type="submit" loading={busy} className="w-full">
          Log in
        </Button>
        <Link
          to="/forgot-password"
          className="block text-center text-sm text-navy-400"
        >
          Forgot your password?
        </Link>
      </form>
    </AuthLayout>
  );
}
