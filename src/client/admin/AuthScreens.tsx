import { useEffect, useState, type ReactNode } from "react";
import { adminApi, AdminApiError } from "./api";
import { useAdminAuth } from "./auth";
import { Btn, Field, Input } from "./ui";

/* ------------------------------- frame ------------------------------- */

function Frame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded bg-navy text-xs font-black text-white">
            V
          </span>
          <span className="text-sm font-semibold text-slate-700">
            VIBIN — Owner Command Center
          </span>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>
          )}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function errMsg(e: unknown): string {
  return e instanceof AdminApiError || e instanceof Error
    ? e.message
    : "Something went wrong.";
}

/* --------------------------- QR (no dependency) --------------------- */
/** Renders the otpauth URI as a link + shows the manual secret. A QR image is
 *  fetched from the authenticator app instead of bundling a QR library — the
 *  manual key always works. */
function TotpEnrol({
  secret,
  otpauthUri,
}: {
  secret: string;
  otpauthUri: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-[13px]">
      <p className="font-semibold text-slate-700">
        Add to your authenticator app
      </p>
      <p className="mt-1 text-slate-500">
        Open the app, choose “add account → enter a setup key”, and paste:
      </p>
      <code className="mt-2 block break-all rounded bg-white px-2 py-1.5 font-mono text-xs text-slate-800 ring-1 ring-slate-200">
        {secret}
      </code>
      <a
        href={otpauthUri}
        className="mt-2 inline-block text-xs font-semibold text-brand-600 underline"
      >
        Open otpauth:// link
      </a>
    </div>
  );
}

function RecoveryCodes({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-[13px] font-semibold text-slate-700">
        Save your recovery codes
      </p>
      <p className="mt-1 text-[13px] text-slate-500">
        Each works once if you lose your authenticator. They are shown only now.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Btn
          variant="neutral"
          onClick={() => {
            void navigator.clipboard
              .writeText(codes.join("\n"))
              .then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy all"}
        </Btn>
        <Btn variant="primary" onClick={onDone}>
          I've saved them
        </Btn>
      </div>
    </div>
  );
}

/* ------------------------------- setup ------------------------------- */

function SetupScreen() {
  const { refresh } = useAdminAuth();
  const [phase, setPhase] = useState<"cred" | "totp" | "codes">("cred");
  const [form, setForm] = useState({ email: "", password: "" });
  const [enrol, setEnrol] = useState<{ secret: string; otpauthUri: string }>();
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<{
    encryptionConfigured: boolean;
    recoveryConfigured: boolean;
  }>();

  useEffect(() => {
    void adminApi<typeof state & object>("/auth/state").then(setState);
  }, []);

  const begin = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await adminApi<{ secret: string; otpauthUri: string }>(
        "/auth/setup/begin",
        { method: "POST", body: form },
      );
      setEnrol(r);
      setPhase("totp");
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await adminApi<{ recoveryCodes: string[] }>(
        "/auth/mfa/enroll/confirm",
        { method: "POST", body: { code } },
      );
      setCodes(r.recoveryCodes);
      setPhase("codes");
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (phase === "codes")
    return (
      <Frame title="Setup complete">
        <RecoveryCodes codes={codes} onDone={() => void refresh()} />
      </Frame>
    );

  if (phase === "totp" && enrol)
    return (
      <Frame
        title="Set up two-factor"
        subtitle="Scan or paste the key, then enter a 6-digit code to confirm."
      >
        <TotpEnrol {...enrol} />
        <div className="mt-4 space-y-3">
          <Field label="6-digit code">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full tracking-[0.3em]"
              placeholder="123456"
            />
          </Field>
          {err && <p className="text-xs font-medium text-rose-600">{err}</p>}
          <Btn
            variant="primary"
            className="w-full"
            loading={busy}
            disabled={code.length < 6}
            onClick={confirm}
          >
            Confirm & finish
          </Btn>
        </div>
      </Frame>
    );

  return (
    <Frame
      title="First-time owner setup"
      subtitle="No owner account exists yet. Create it now — this screen disables itself afterwards."
    >
      {state && !state.encryptionConfigured && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          ENCRYPTION_KEY is not configured on the server. Set it
          (<code>wrangler secret put ENCRYPTION_KEY</code>) before continuing.
        </p>
      )}
      <div className="space-y-3">
        <Field label="Owner email">
          <Input
            type="email"
            autoComplete="username"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full"
          />
        </Field>
        <Field label="Password" hint="At least 10 characters.">
          <Input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full"
          />
        </Field>
        {err && <p className="text-xs font-medium text-rose-600">{err}</p>}
        <Btn
          variant="primary"
          className="w-full"
          loading={busy}
          disabled={
            !form.email ||
            form.password.length < 10 ||
            (state && !state.encryptionConfigured)
          }
          onClick={begin}
        >
          Continue
        </Btn>
      </div>
    </Frame>
  );
}

/* ------------------------------- login ------------------------------- */

function LoginScreen() {
  const { refresh } = useAdminAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recover, setRecover] = useState(false);
  const [rec, setRec] = useState({ recoverySecret: "", email: "" });
  const [recDone, setRecDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await adminApi("/auth/login", { method: "POST", body: form });
      await refresh();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (recover)
    return (
      <Frame
        title="Break-glass recovery"
        subtitle="Uses the deployment recovery secret to send a password-reset link and clear 2FA."
      >
        {recDone ? (
          <p className="text-[13px] text-slate-600">
            If the details were correct, a reset link has been emailed. After
            resetting, sign in and you'll re-enrol 2FA.
          </p>
        ) : (
          <div className="space-y-3">
            <Field label="Owner email">
              <Input
                type="email"
                value={rec.email}
                onChange={(e) => setRec({ ...rec, email: e.target.value })}
                className="w-full"
              />
            </Field>
            <Field label="Deployment recovery secret">
              <Input
                type="password"
                value={rec.recoverySecret}
                onChange={(e) =>
                  setRec({ ...rec, recoverySecret: e.target.value })
                }
                className="w-full"
              />
            </Field>
            {err && <p className="text-xs font-medium text-rose-600">{err}</p>}
            <div className="flex gap-2">
              <Btn variant="ghost" onClick={() => setRecover(false)}>
                Back
              </Btn>
              <Btn
                variant="primary"
                className="flex-1"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    await adminApi("/auth/recover", {
                      method: "POST",
                      body: rec,
                    });
                    setRecDone(true);
                  } catch (e) {
                    setErr(errMsg(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Send recovery email
              </Btn>
            </div>
          </div>
        )}
      </Frame>
    );

  return (
    <Frame title="Owner sign-in" subtitle="Restricted to the VIBIN owner account.">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Email">
          <Input
            type="email"
            autoComplete="username"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full"
          />
        </Field>
        {err && <p className="text-xs font-medium text-rose-600">{err}</p>}
        <Btn
          variant="primary"
          className="w-full"
          loading={busy}
          disabled={!form.email || !form.password}
          type="submit"
        >
          Continue
        </Btn>
      </form>
      <button
        className="mt-3 text-xs text-slate-400 hover:text-slate-600"
        onClick={() => {
          setRecover(true);
          setErr(null);
        }}
      >
        Lost access to your authenticator?
      </button>
    </Frame>
  );
}

/* -------------------------------- mfa -------------------------------- */

function MfaScreen() {
  const { refresh, logout } = useAdminAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <Frame
      title="Two-factor verification"
      subtitle="Enter the current code from your authenticator, or a recovery code."
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            setBusy(true);
            setErr(null);
            try {
              await adminApi("/auth/mfa", { method: "POST", body: { code } });
              await refresh();
            } catch (e2) {
              setErr(errMsg(e2));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <Field label="Code">
          <Input
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
            className="w-full tracking-[0.2em]"
            placeholder="123456"
          />
        </Field>
        {err && <p className="text-xs font-medium text-rose-600">{err}</p>}
        <Btn
          variant="primary"
          className="w-full"
          loading={busy}
          disabled={code.length < 4}
          type="submit"
        >
          Verify
        </Btn>
      </form>
      <button
        className="mt-3 text-xs text-slate-400 hover:text-slate-600"
        onClick={() => void logout()}
      >
        Cancel
      </button>
    </Frame>
  );
}

/* ------------------------------ enroll ------------------------------ */

function EnrollScreen() {
  const { refresh, logout } = useAdminAuth();
  const [enrol, setEnrol] = useState<{ secret: string; otpauthUri: string }>();
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void adminApi<{ secret: string; otpauthUri: string }>(
      "/auth/mfa/enroll",
    ).then(setEnrol);
  }, []);

  if (codes)
    return (
      <Frame title="Two-factor enabled">
        <RecoveryCodes codes={codes} onDone={() => void refresh()} />
      </Frame>
    );

  return (
    <Frame
      title="Enrol two-factor"
      subtitle="Your account has no confirmed authenticator. Add one to continue."
    >
      {enrol && <TotpEnrol {...enrol} />}
      <div className="mt-4 space-y-3">
        <Field label="6-digit code">
          <Input
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full tracking-[0.3em]"
            placeholder="123456"
          />
        </Field>
        {err && <p className="text-xs font-medium text-rose-600">{err}</p>}
        <Btn
          variant="primary"
          className="w-full"
          loading={busy}
          disabled={code.length < 6}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const r = await adminApi<{ recoveryCodes: string[] }>(
                "/auth/mfa/enroll/confirm",
                { method: "POST", body: { code } },
              );
              setCodes(r.recoveryCodes);
            } catch (e) {
              setErr(errMsg(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Confirm
        </Btn>
        <button
          className="text-xs text-slate-400 hover:text-slate-600"
          onClick={() => void logout()}
        >
          Cancel
        </button>
      </div>
    </Frame>
  );
}

/* ------------------------------ router ----------------------------- */

export function AuthScreens({ stage }: { stage: string }) {
  if (stage === "setup") return <SetupScreen />;
  if (stage === "mfa") return <MfaScreen />;
  if (stage === "enroll") return <EnrollScreen />;
  return <LoginScreen />;
}
