import { Fragment, useEffect, useState } from "react";
import { cc } from "../api";
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
  Select,
  Table,
  Td,
  Th,
  Tr,
  fmtDate,
} from "../ui";

const CATEGORIES = [
  "activity_provider",
  "development",
  "services",
  "test_account",
  "other",
] as const;

interface Cred {
  id: string;
  name: string;
  provider: string | null;
  category: string;
  username: string | null;
  email: string | null;
  url: string | null;
  notes: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number | null;
  hasSecret: boolean;
}
interface Resp {
  encryptionConfigured: boolean;
  rows: Cred[];
}

const emptyForm = {
  name: "",
  provider: "",
  category: "other" as string,
  username: "",
  email: "",
  url: "",
  notes: "",
  tags: "",
  secret: "",
};

export function Vault() {
  const [category, setCategory] = useState("");
  const { data, loading, error, reload } = useResource<Resp>(
    () => cc<Resp>(`/vault${category ? `?category=${category}` : ""}`),
    `vault-${category}`,
  );
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [logFor, setLogFor] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setFormErr(null);
    try {
      await cc("/vault", {
        method: "POST",
        body: {
          ...form,
          tags: form.tags
            ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
            : [],
        },
      });
      setForm({ ...emptyForm });
      setAdding(false);
      reload();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  const del = async (id: string) => {
    if (!confirm("Delete this credential permanently?")) return;
    await cc(`/vault/${id}`, { method: "DELETE" });
    reload();
  };

  return (
    <>
      <PageTitle
        title="Credential vault"
        right={
          <div className="flex items-center gap-2">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
            <Btn variant="primary" onClick={() => setAdding((v) => !v)}>
              {adding ? "Cancel" : "New credential"}
            </Btn>
          </div>
        }
      />
      <p className="mb-3 text-[13px] text-slate-500">
        Secrets are AES-256-GCM encrypted with a server-side key. Values are
        masked; revealing one requires your password and is logged.
      </p>
      {error && <ErrorNote message={error} onRetry={reload} />}
      {data && !data.encryptionConfigured && (
        <ErrorNote message="ENCRYPTION_KEY is not configured on the server — the vault cannot store or reveal secrets." />
      )}

      {adding && (
        <Panel title="New credential" className="mb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full"
              />
            </Field>
            <Field label="Category">
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Provider / system">
              <Input
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                className="w-full"
              />
            </Field>
            <Field label="URL">
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                className="w-full"
              />
            </Field>
            <Field label="Username">
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full"
              />
            </Field>
            <Field label="Email">
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full"
              />
            </Field>
            <Field label="Secret / password *">
              <Input
                type="password"
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
                className="w-full"
              />
            </Field>
            <Field label="Tags (comma-separated)">
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                className="w-full"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full"
                />
              </Field>
            </div>
          </div>
          {formErr && <p className="mt-2 text-xs text-rose-600">{formErr}</p>}
          <Btn
            variant="primary"
            className="mt-3"
            loading={busy}
            disabled={!form.name || !form.secret || !data?.encryptionConfigured}
            onClick={create}
          >
            Save credential
          </Btn>
        </Panel>
      )}

      <Panel bodyClassName="">
        {loading && !data && <Loading />}
        {data && (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Category</Th>
                <Th>Username / email</Th>
                <Th>Secret</Th>
                <Th>Last accessed</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr>
                  <Td className="py-6 text-center text-slate-400">
                    No credentials stored.
                  </Td>
                </tr>
              )}
              {data.rows.map((c) => (
                <Fragment key={c.id}>
                  <Tr>
                    <Td>
                      <span className="font-medium text-slate-800">
                        {c.name}
                      </span>
                      {c.provider && (
                        <div className="text-xs text-slate-500">
                          {c.provider}
                        </div>
                      )}
                      {c.url && (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block break-all text-[11px] text-brand-600 hover:underline"
                        >
                          {c.url.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                      {c.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded bg-slate-100 px-1 text-[10px] text-slate-500"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <Badge tone="slate">{c.category.replace(/_/g, " ")}</Badge>
                    </Td>
                    <Td className="text-xs">
                      {c.username || "—"}
                      {c.email && (
                        <div className="text-slate-500">{c.email}</div>
                      )}
                    </Td>
                    <Td>
                      <RevealCell id={c.id} />
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {c.lastAccessedAt ? fmtDate(c.lastAccessedAt) : "never"}
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <Btn
                          variant="ghost"
                          className="!py-1 !text-xs"
                          onClick={() =>
                            setLogFor(logFor === c.id ? null : c.id)
                          }
                        >
                          Log
                        </Btn>
                        <Btn
                          variant="ghost"
                          className="!py-1 !text-xs"
                          onClick={() => del(c.id)}
                        >
                          Delete
                        </Btn>
                      </div>
                    </Td>
                  </Tr>
                  {logFor === c.id && (
                    <tr>
                      <Td className="bg-slate-50">
                        <AccessLog id={c.id} />
                      </Td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}

/**
 * Reveal a stored secret. The password is entered into a real masked field (never
 * window.prompt), sent once to /vault/:id/reveal, and the plaintext is shown for
 * 20 seconds then auto-hidden. Every reveal is logged server-side.
 */
function RevealCell({ id }: { id: string }) {
  const [phase, setPhase] = useState<"masked" | "asking" | "shown">("masked");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "shown") return;
    const t = setTimeout(() => {
      setPhase("masked");
      setValue(null);
    }, 20_000);
    return () => clearTimeout(t);
  }, [phase]);

  const cancel = () => {
    setPhase("masked");
    setPw("");
    setErr(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await cc<{ secret: string }>(`/vault/${id}/reveal`, {
        method: "POST",
        body: { password: pw },
      });
      setValue(r.secret);
      setPhase("shown");
      setPw("");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Reveal failed");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "asking") {
    return (
      <form onSubmit={submit} className="inline-flex items-center gap-1.5">
        <Input
          type="password"
          autoFocus
          value={pw}
          onChange={(ev) => setPw(ev.target.value)}
          placeholder="your password"
          aria-label="Confirm your password to reveal this secret"
          className="w-36"
        />
        <Btn type="submit" variant="primary" className="!py-1 !text-[11px]" loading={busy} disabled={!pw}>
          Reveal
        </Btn>
        <Btn type="button" variant="ghost" className="!px-1.5 !py-0.5 !text-[11px]" onClick={cancel}>
          Cancel
        </Btn>
        {err && <span className="text-[11px] text-rose-600">{err}</span>}
      </form>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <code className="font-mono text-xs">
        {phase === "shown" && value != null ? value : "••••••••••••"}
      </code>
      {phase === "shown" ? (
        <Btn
          variant="ghost"
          className="!px-1.5 !py-0.5 !text-[11px]"
          onClick={() => {
            setPhase("masked");
            setValue(null);
          }}
        >
          Hide
        </Btn>
      ) : (
        <Btn
          variant="ghost"
          className="!px-1.5 !py-0.5 !text-[11px]"
          onClick={() => {
            setErr(null);
            setPhase("asking");
          }}
        >
          Reveal
        </Btn>
      )}
    </span>
  );
}

function AccessLog({ id }: { id: string }) {
  const { data, loading } = useResource<{
    rows: {
      id: string;
      action: string;
      createdAt: number;
      actorEmail: string | null;
    }[];
  }>(() => cc(`/vault/${id}/access-log`), `log-${id}`);
  if (loading) return <Loading label="Loading access log…" />;
  return (
    <div className="py-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Access log
      </p>
      <ul className="space-y-0.5 text-xs text-slate-600">
        {(data?.rows ?? []).map((r) => (
          <li key={r.id}>
            <span className="font-mono">{r.action}</span> ·{" "}
            {fmtDate(r.createdAt)} · {r.actorEmail || "—"}
          </li>
        ))}
        {data?.rows.length === 0 && <li className="text-slate-400">—</li>}
      </ul>
    </div>
  );
}
