import { useState } from "react";
import { cc } from "../api";
import { AdminApiError } from "../api";
import { useResource } from "../lib";
import {
  Badge,
  Btn,
  ErrorNote,
  Field,
  Input,
  Loading,
  PageTitle,
  Panel,
  Table,
  Td,
  Th,
  Tr,
  fmtDate,
} from "../ui";

/**
 * Team / Developers. The owner (and any developer the owner explicitly authorised with
 * "Manage developers") can see who has access, invite or add developers, change what they may
 * do and remove their access. The server enforces every rule; the owner row is never editable.
 */
interface Perm {
  key: string;
  label: string;
  description: string;
}
interface Member {
  id: string;
  email: string;
  displayName: string;
  role: "owner" | "developer";
  status: string;
  createdAt: number;
  permissions: string[];
  isYou: boolean;
  manageable: boolean;
}
interface Invite {
  id: string;
  email: string;
  permissions: string[];
  createdAt: number;
  expiresAt: number;
}
interface TeamResponse {
  you: { id: string; role: "owner" | "developer"; permissions: string[] };
  assignable: string[];
  defaults: string[];
  permissionCatalogue: Perm[];
  members: Member[];
  invites: Invite[];
}

const errText = (e: unknown) =>
  e instanceof AdminApiError || e instanceof Error ? e.message : "Something went wrong.";

function PermPicker({
  catalogue,
  assignable,
  value,
  onChange,
  disabled,
}: {
  catalogue: Perm[];
  assignable: string[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (key: string) => {
    const on = value.includes(key);
    let next = on ? value.filter((k) => k !== key) : [...value, key];
    if (!on && key === "files.write" && !next.includes("files.read")) next = [...next, "files.read"];
    if (on && key === "files.read") next = next.filter((k) => k !== "files.write");
    onChange(next);
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {catalogue.map((p) => {
        const allowed = assignable.includes(p.key);
        return (
          <label
            key={p.key}
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[13px] ${
              allowed && !disabled ? "cursor-pointer border-slate-200 hover:bg-slate-50" : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={value.includes(p.key)}
              disabled={!allowed || disabled}
              onChange={() => toggle(p.key)}
            />
            <span>
              <span className="font-medium text-slate-800">{p.label}</span>
              <span className="block text-xs text-slate-500">{p.description}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function Team() {
  const { data, loading, error, reload } = useResource<TeamResponse>(() => cc<TeamResponse>("/team"), "team");
  const [email, setEmail] = useState("");
  const [perms, setPerms] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [link, setLink] = useState<{ url: string; email: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  if (loading && !data) return <Loading label="Loading team…" />;
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;

  const chosen = perms ?? data.defaults.filter((p) => data.assignable.includes(p));
  const label = (key: string) => data.permissionCatalogue.find((p) => p.key === key)?.label ?? key;
  const isOwner = data.you.role === "owner";

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ tone: "error", text: errText(e) });
    } finally {
      setBusy(null);
    }
  };

  const invite = () =>
    run("invite", async () => {
      const r = await cc<{ link: string; expiresAt: number }>("/team/invite", {
        method: "POST",
        body: { email, permissions: chosen },
      });
      setLink({ url: r.link, email });
      setCopied(false);
      setEmail("");
      reload();
    });

  const addExisting = () =>
    run("add", async () => {
      await cc("/team/developers", { method: "POST", body: { email, permissions: chosen } });
      setMsg({ tone: "ok", text: `${email} is now a developer. They sign in at /admin with their normal VIBIN password and set up an authenticator.` });
      setEmail("");
      setLink(null);
      reload();
    });

  const savePerms = (m: Member) =>
    run(`save:${m.id}`, async () => {
      await cc(`/team/developers/${m.id}`, { method: "PATCH", body: { permissions: editPerms } });
      setEditing(null);
      setMsg({ tone: "ok", text: `Permissions updated for ${m.email}.` });
      reload();
    });

  const remove = (m: Member) => {
    if (!window.confirm(`Remove developer access for ${m.email}? They keep their normal VIBIN account but lose admin access immediately.`)) return;
    void run(`rm:${m.id}`, async () => {
      await cc(`/team/developers/${m.id}`, { method: "DELETE" });
      setMsg({ tone: "ok", text: `${m.email} no longer has developer access.` });
      reload();
    });
  };

  const revokeInvite = (i: Invite) =>
    run(`inv:${i.id}`, async () => {
      await cc(`/team/invites/${i.id}`, { method: "DELETE" });
      reload();
    });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <PageTitle title="Team / Developers" />
      {msg && (
        <div
          role={msg.tone === "error" ? "alert" : "status"}
          className={`mb-4 rounded-md border px-3 py-2 text-[13px] ${
            msg.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <Panel
        title="People with admin access"
        subtitle="The owner always has full control and can't be changed here. Developers only get what is ticked."
        bodyClassName="p-0"
        className="mb-5"
      >
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Role</Th>
                <Th>Can do</Th>
                <Th>Since</Th>
                <Th>{""}</Th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <Tr key={m.id}>
                  <Td>
                    <div className="font-medium text-slate-900">
                      {m.displayName} {m.isYou && <span className="text-xs font-normal text-slate-400">(you)</span>}
                    </div>
                    <div className="text-xs text-slate-500">{m.email}</div>
                  </Td>
                  <Td>{m.role === "owner" ? <Badge tone="lime">Owner</Badge> : <Badge tone="blue">Developer</Badge>}</Td>
                  <Td>
                    {m.role === "owner" ? (
                      <span className="text-xs text-slate-500">Everything</span>
                    ) : editing === m.id ? (
                      <div className="min-w-[280px] py-1">
                        <PermPicker catalogue={data.permissionCatalogue} assignable={data.assignable} value={editPerms} onChange={setEditPerms} />
                      </div>
                    ) : m.permissions.length ? (
                      <div className="flex flex-wrap gap-1">
                        {m.permissions.map((p) => (
                          <Badge key={p} tone="slate">
                            {label(p)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">No permissions: can sign in but sees nothing</span>
                    )}
                  </Td>
                  <Td>{fmtDate(m.createdAt)}</Td>
                  <Td>
                    {m.role === "developer" && m.manageable && (
                      <div className="flex justify-end gap-1.5">
                        {editing === m.id ? (
                          <>
                            <Btn variant="primary" className="!py-1 !text-xs" loading={busy === `save:${m.id}`} onClick={() => void savePerms(m)}>
                              Save
                            </Btn>
                            <Btn className="!py-1 !text-xs" onClick={() => setEditing(null)}>
                              Cancel
                            </Btn>
                          </>
                        ) : (
                          <>
                            <Btn
                              className="!py-1 !text-xs"
                              onClick={() => {
                                setEditing(m.id);
                                setEditPerms(m.permissions);
                              }}
                            >
                              Permissions
                            </Btn>
                            <Btn variant="danger" className="!py-1 !text-xs" loading={busy === `rm:${m.id}`} onClick={() => remove(m)}>
                              Remove
                            </Btn>
                          </>
                        )}
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Panel>

      <Panel
        title="Invite or add a developer"
        subtitle={
          isOwner
            ? "Create a one-time link to send them, or add someone who already has a VIBIN account."
            : "You can only hand out permissions you hold yourself."
        }
        className="mb-5"
      >
        <div className="space-y-4">
          <Field label="Email address">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="developer@example.com"
              className="w-full max-w-md"
              autoComplete="off"
            />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Permissions</p>
            <PermPicker catalogue={data.permissionCatalogue} assignable={data.assignable} value={chosen} onChange={setPerms} />
            <p className="mt-2 text-xs text-slate-500">
              Developers never get access to users, settings, the credential vault, outreach or analytics, and they can't change
              the owner. Protected files (login, permissions, deployment) stay owner-only even with "Files: edit".
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" disabled={!email.includes("@")} loading={busy === "invite"} onClick={() => void invite()}>
              Create invite link
            </Btn>
            <Btn disabled={!email.includes("@")} loading={busy === "add"} onClick={() => void addExisting()}>
              Add existing account
            </Btn>
          </div>

          {link && (
            <div className="rounded-md border border-brand-200 bg-brand-50 p-3 text-[13px]">
              <p className="font-semibold text-slate-800">Invitation for {link.email}</p>
              <p className="mt-0.5 text-xs text-slate-600">
                Send them this link yourself. It is shown only once, works once and expires in 7 days. No email is sent
                automatically.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <code className="block min-w-0 flex-1 break-all rounded bg-white px-2 py-1.5 font-mono text-xs ring-1 ring-slate-200">
                  {link.url}
                </code>
                <Btn onClick={() => void copy()}>{copied ? "Copied ✓" : "Copy link"}</Btn>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Pending invitations" bodyClassName="p-0">
        {data.invites.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-slate-500">No open invitations.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Permissions</Th>
                  <Th>Sent</Th>
                  <Th>Expires</Th>
                  <Th>{""}</Th>
                </tr>
              </thead>
              <tbody>
                {data.invites.map((i) => (
                  <Tr key={i.id}>
                    <Td>{i.email}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {i.permissions.map((p) => (
                          <Badge key={p} tone="slate">
                            {label(p)}
                          </Badge>
                        ))}
                      </div>
                    </Td>
                    <Td>{fmtDate(i.createdAt)}</Td>
                    <Td>{fmtDate(i.expiresAt)}</Td>
                    <Td>
                      <div className="flex justify-end">
                        <Btn className="!py-1 !text-xs" loading={busy === `inv:${i.id}`} onClick={() => void revokeInvite(i)}>
                          Revoke
                        </Btn>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Panel>
    </>
  );
}
