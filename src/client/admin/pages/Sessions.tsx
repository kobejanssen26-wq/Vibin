import { useState } from "react";
import { adminApi } from "../api";
import { useResource } from "../lib";
import {
  Badge,
  Btn,
  ErrorNote,
  Field,
  Input,
  Loading,
  Panel,
  PageTitle,
  Table,
  Td,
  Th,
  Tr,
  fmtDate,
} from "../ui";

interface Sess {
  id: string;
  current: boolean;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
  mfaVerifiedAt: number | null;
}

export function Sessions() {
  const { data, loading, error, reload } = useResource<{ sessions: Sess[] }>(
    () => adminApi<{ sessions: Sess[] }>("/auth/sessions"),
    "sessions",
  );
  const rem = useResource<{ remaining: number }>(
    () => adminApi<{ remaining: number }>("/auth/recovery-codes/remaining"),
    "rem",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const revoke = async (id: string) => {
    setBusy(id);
    try {
      await adminApi("/auth/sessions/revoke", { method: "POST", body: { id } });
      reload();
    } finally {
      setBusy(null);
    }
  };
  const revokeAll = async () => {
    setBusy("all");
    try {
      const r = await adminApi<{ revoked: number }>(
        "/auth/sessions/revoke-all",
        { method: "POST", body: {} },
      );
      setNote(`Revoked ${r.revoked} other session${r.revoked === 1 ? "" : "s"}.`);
      reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageTitle title="Admin sessions" />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {note && (
        <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
          {note}
        </p>
      )}

      <Panel
        title="Active sessions"
        right={
          <Btn variant="danger" loading={busy === "all"} onClick={revokeAll}>
            Revoke all others
          </Btn>
        }
        bodyClassName=""
      >
        {loading && !data && <Loading />}
        {data && (
          <Table>
            <thead>
              <tr>
                <Th>Session</Th>
                <Th>IP</Th>
                <Th>User agent</Th>
                <Th>Started</Th>
                <Th>Last seen</Th>
                <Th>Expires</Th>
                <Th>State</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <Tr key={s.id}>
                  <Td mono>
                    {s.id.slice(0, 12)}…
                    {s.current && (
                      <Badge tone="blue">
                        <span className="ml-1">this device</span>
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-xs">{s.ip || "—"}</Td>
                  <Td className="max-w-xs truncate text-xs text-slate-500">
                    {s.userAgent || "—"}
                  </Td>
                  <Td className="text-xs text-slate-500">
                    {fmtDate(s.createdAt)}
                  </Td>
                  <Td className="text-xs text-slate-500">
                    {fmtDate(s.lastSeenAt)}
                  </Td>
                  <Td className="text-xs text-slate-500">
                    {fmtDate(s.expiresAt)}
                  </Td>
                  <Td>
                    {s.revokedAt ? (
                      <Badge tone="red">revoked</Badge>
                    ) : s.mfaVerifiedAt ? (
                      <Badge tone="green">verified</Badge>
                    ) : (
                      <Badge tone="amber">pre-2FA</Badge>
                    )}
                  </Td>
                  <Td>
                    {!s.revokedAt && !s.current && (
                      <Btn
                        variant="ghost"
                        className="!py-1 !text-xs"
                        loading={busy === s.id}
                        onClick={() => revoke(s.id)}
                      >
                        Revoke
                      </Btn>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <div className="mt-4">
        <RecoveryPanel remaining={rem.data?.remaining ?? null} onDone={rem.reload} />
      </div>
    </>
  );
}

function RecoveryPanel({
  remaining,
  onDone,
}: {
  remaining: number | null;
  onDone: () => void;
}) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState<"codes" | "mfa" | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <Panel title="Two-factor & recovery codes">
      <p className="mb-3 text-[13px] text-slate-500">
        {remaining == null
          ? "—"
          : `${remaining} recovery code${remaining === 1 ? "" : "s"} unused.`}{" "}
        Sensitive actions require your password again.
      </p>
      <div className="max-w-xs">
        <Field label="Confirm password">
          <Input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="w-full"
          />
        </Field>
      </div>
      {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
      {msg && <p className="mt-2 text-xs text-emerald-600">{msg}</p>}
      <div className="mt-3 flex gap-2">
        <Btn
          variant="neutral"
          loading={busy === "codes"}
          disabled={!pw}
          onClick={async () => {
            setBusy("codes");
            setErr(null);
            setMsg(null);
            try {
              const r = await adminApi<{ recoveryCodes: string[] }>(
                "/auth/recovery-codes/regenerate",
                { method: "POST", body: { password: pw } },
              );
              setCodes(r.recoveryCodes);
              setPw("");
              onDone();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Failed");
            } finally {
              setBusy(null);
            }
          }}
        >
          Regenerate recovery codes
        </Btn>
        <Btn
          variant="danger"
          loading={busy === "mfa"}
          disabled={!pw}
          onClick={async () => {
            if (
              !confirm(
                "Clear your authenticator? You'll re-enrol 2FA on next sign-in.",
              )
            )
              return;
            setBusy("mfa");
            setErr(null);
            try {
              await adminApi("/auth/mfa/reset", {
                method: "POST",
                body: { password: pw },
              });
              setMsg("Authenticator cleared. You'll re-enrol on next sign-in.");
              setPw("");
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Failed");
            } finally {
              setBusy(null);
            }
          }}
        >
          Reset 2FA
        </Btn>
      </div>
      {codes && (
        <div className="mt-3">
          <p className="text-[13px] font-semibold text-slate-700">
            New recovery codes — shown once
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs">
            {codes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <Btn
            variant="ghost"
            className="mt-2 !text-xs"
            onClick={() => void navigator.clipboard.writeText(codes.join("\n"))}
          >
            Copy all
          </Btn>
        </div>
      )}
    </Panel>
  );
}
