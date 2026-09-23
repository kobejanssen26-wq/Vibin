import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthLayout } from "./authLayout";
import { api, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLang } from "../lib/i18n";

export function VerifyEmail() {
  const { t } = useLang();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { refresh } = useAuth();
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMsg(t("auth.verify.missingToken"));
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
          e instanceof ApiRequestError ? e.message : t("auth.verify.error"),
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t() is stable enough for this one-shot effect
  }, [token, refresh]);

  return (
    <AuthLayout
      title={
        state === "ok"
          ? t("auth.verify.ok")
          : state === "error"
            ? t("auth.verify.failed")
            : t("auth.verify.working")
      }
      footer={
        <Link to="/app" className="font-semibold text-brand-600">
          {t("auth.verify.goToVibin")}
        </Link>
      }
    >
      <p className="text-sm text-navy-400">
        {state === "ok"
          ? t("auth.verify.okBody")
          : state === "error"
            ? msg
            : t("auth.verify.workingBody")}
      </p>
    </AuthLayout>
  );
}
