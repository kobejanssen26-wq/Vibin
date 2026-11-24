import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { adminApi, AdminApiError } from "../api";
import { useAdminAuth } from "../auth";
import { Btn, Field, Input, Loading } from "../ui";

/**
 * Landing page of a developer invitation link (/admin/invite/<token>). The person sets a password
 * (or, if they already have a VIBIN account, confirms with their current password) and is then taken
 * to the authenticator set-up that every admin account must complete before getting access.
 */
interface InviteInfo {
  email: string;
  accountExists: boolean;
  permissions: string[];
  expiresAt: number;
}

export function AcceptInvite() {
  const { token = "" } = useParams();
  const nav = useNavigate();
  const { refresh } = useAdminAuth();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi<InviteInfo>(`/auth/invite/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch(() => setInvalid(true));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi("/auth/invite/accept", {
        method: "POST",
        body: { token, password, ...(info?.accountExists || !name.trim() ? {} : { displayName: name.trim() }) },
      });
      await refresh(); // session now exists at the "set up authenticator" stage
      nav("/admin", { replace: true });
    } catch (err) {
      setError(err instanceof AdminApiError || err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded bg-navy text-xs font-black text-white">V</span>
          <span className="text-sm font-semibold text-slate-700">VIBIN — Developer invitation</span>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          {!info && !invalid && <Loading label="Checking invitation…" />}
          {invalid && (
            <>
              <h1 className="text-lg font-bold text-slate-900">Invitation not valid</h1>
              <p className="mt-2 text-[13px] text-slate-600">
                This link has expired, was already used or was revoked. Ask the owner for a new one.
              </p>
            </>
          )}
          {info && (
            <form onSubmit={submit}>
              <h1 className="text-lg font-bold text-slate-900">Join the VIBIN team</h1>
              <p className="mt-1 text-[13px] text-slate-500">
                You were invited as a developer with the address <b>{info.email}</b>.
              </p>
              <div className="mt-5 space-y-3">
                {!info.accountExists && (
                  <Field label="Your name">
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="w-full" maxLength={40} autoComplete="name" />
                  </Field>
                )}
                <Field
                  label={info.accountExists ? "Your current VIBIN password" : "Choose a password"}
                  hint={info.accountExists ? "You already have a VIBIN account, confirm it is yours." : "At least 10 characters."}
                >
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full"
                    required
                    autoComplete={info.accountExists ? "current-password" : "new-password"}
                  />
                </Field>
                {error && (
                  <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
                    {error}
                  </p>
                )}
                <Btn type="submit" variant="primary" className="w-full justify-center" loading={busy} disabled={!password}>
                  Accept and continue
                </Btn>
                <p className="text-xs text-slate-500">
                  Next you'll link an authenticator app. Admin access needs a password and a one-time code every time.
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
