import { useState } from "react";
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
  Table,
  Td,
  Th,
  Tr,
  fmtDate,
} from "../ui";

interface Flag {
  key: string;
  enabled: boolean;
  description: string;
  updatedAt: number;
  updatedByEmail: string | null;
}

export function Flags() {
  const { data, loading, error, reload } = useResource<{ flags: Flag[] }>(
    () => cc<{ flags: Flag[] }>("/flags"),
    "flags",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const toggle = async (f: Flag) => {
    setBusy(f.key);
    try {
      await cc(`/flags/${f.key}`, {
        method: "PUT",
        body: { enabled: !f.enabled },
      });
      reload();
    } finally {
      setBusy(null);
    }
  };
  const create = async () => {
    setErr(null);
    setBusy("new");
    try {
      await cc(`/flags/${newKey.trim()}`, {
        method: "PUT",
        body: { enabled: false, description: newDesc.trim() },
      });
      setNewKey("");
      setNewDesc("");
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };
  const remove = async (key: string) => {
    if (!confirm(`Delete flag "${key}"?`)) return;
    setBusy(key);
    try {
      await cc(`/flags/${key}`, { method: "DELETE" });
      reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageTitle title="Feature flags" />
      <p className="mb-3 text-[13px] text-slate-500">
        Server-evaluated toggles for rollout. They are <strong>not</strong> an
        authorization mechanism.
      </p>
      {error && <ErrorNote message={error} onRetry={reload} />}

      <Panel bodyClassName="">
        {loading && !data && <Loading />}
        {data && (
          <Table>
            <thead>
              <tr>
                <Th>Key</Th>
                <Th>State</Th>
                <Th>Description</Th>
                <Th>Updated</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.flags.length === 0 && (
                <tr>
                  <Td className="py-6 text-center text-slate-400">
                    No flags yet.
                  </Td>
                </tr>
              )}
              {data.flags.map((f) => (
                <Tr key={f.key}>
                  <Td mono>{f.key}</Td>
                  <Td>
                    <Badge tone={(f.enabled ? "green" : "slate") as never}>
                      {f.enabled ? "on" : "off"}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-slate-600">
                    {f.description || "—"}
                  </Td>
                  <Td className="text-xs text-slate-400">
                    {fmtDate(f.updatedAt)}
                    {f.updatedByEmail ? ` · ${f.updatedByEmail}` : ""}
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <Btn
                        variant="neutral"
                        className="!py-1 !text-xs"
                        loading={busy === f.key}
                        onClick={() => toggle(f)}
                      >
                        {f.enabled ? "Disable" : "Enable"}
                      </Btn>
                      <Btn
                        variant="ghost"
                        className="!py-1 !text-xs"
                        onClick={() => remove(f.key)}
                      >
                        Delete
                      </Btn>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <div className="mt-4">
        <Panel title="New flag">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Key (a-z, 0-9, _)">
              <Input
                value={newKey}
                onChange={(e) =>
                  setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                }
                placeholder="new_onboarding"
                className="w-56"
              />
            </Field>
            <Field label="Description">
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-72"
              />
            </Field>
            <Btn
              variant="primary"
              loading={busy === "new"}
              disabled={newKey.length < 2}
              onClick={create}
            >
              Create (off)
            </Btn>
          </div>
          {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
        </Panel>
      </div>
    </>
  );
}
