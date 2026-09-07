import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthLayout } from "./authLayout";
import { api, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/auth";

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { refresh } = useAuth();
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMsg("This verification link is missing its token.");
      return;
    }
    (async () => {
      try {
        await api("/auth/verify-email", { method: "POST", body: { token } });
        await refresh();
        setState("ok");
      } catch (e) {
        setState("error");
        setMsg(
          e instanceof ApiRequestError
            ? e.message
            : "Could not verify this link.",
        );
      }
    })();
  }, [token, refresh]);

  return (
    <AuthLayout
      title={
        state === "ok"
          ? "Email verified 🎉"
          : state === "error"
            ? "Verification failed"
            : "Verifying…"
      }
      footer={
        <Link to="/app" className="font-semibold text-brand-600">
          Go to VIBIN
        </Link>
      }
    >
      <p className="text-sm text-navy-400">
        {state === "ok"
          ? "Your email address is confirmed. You're all set."
          : state === "error"
            ? msg
            : "One moment while we confirm your email address."}
      </p>
    </AuthLayout>
  );
}
