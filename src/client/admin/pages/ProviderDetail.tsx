import { useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  StatTile,
  Table,
  Td,
  Th,
  Tr,
  fmtDate,
  fmtNum,
  fmtPct,
} from "../ui";
import { CRM_TONE } from "./Providers";

interface Contact {
  id: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  contactPage: string | null;
  address: string | null;
  contactPerson: string | null;
  role: string | null;
  preferredMethod: string | null;
  notes: string;
  nextFollowUpAt: number | null;
  updatedAt: number;
}
interface Comm {
  id: string;
  contactId: string | null;
  kind: string;
  occurredAt: number;
  subject: string;
  status: string;
  notes: string;
  byEmail: string | null;
}
interface Act {
  id: string;
  title: string;
  category: string;
  city: string | null;
  status: string;
  metrics: {
    views: number;
    likes: number;
    superlikes: number;
    passes: number;
    matches: number;
    plans: number;
    likeRate: number | null;
  };
}
interface Detail {
  provider: Record<string, unknown>;
  activities: Act[];
  totals: {
    views: number;
    likes: number;
    passes: number;
    matches: number;
    plans: number;
    bookingClicks: number;
  };
  contacts: Contact[];
  communications: Comm[];
  lastContactAt: number | null;
  nextFollowUp: number | null;
}

const CRM = [
  "not_contacted",
  "contacted",
  "interested",
  "partner",
  "not_interested",
  "follow_up",
  "needs_review",
  "outdated",
  "inactive",
];

export function ProviderDetail() {
  const { id = "" } = useParams();
  const { data, loading, error, reload } = useResource<Detail>(
    () => cc<Detail>(`/providers/${id}`),
    id,
  );

  const crmStatus = (data?.provider.crm_status as string) ?? "not_contacted";
  const setCrm = async (status: string) => {
    await cc(`/providers/${id}/crm-status`, {
      method: "PUT",
      body: { status },
    });
    reload();
  };

  return (
    <>
      <PageTitle
        title={(data?.provider.name as string) || "Provider"}
        crumbs={
          <Link to="/admin/providers" className="hover:underline">
            ← Providers
          </Link>
        }
        right={
          data && (
            <div className="flex items-center gap-2">
              <Badge tone={(CRM_TONE[crmStatus] ?? "slate") as never}>
                {crmStatus.replace(/_/g, " ")}
              </Badge>
              <Select
                value={crmStatus}
                onChange={(e) => void setCrm(e.target.value)}
              >
                {CRM.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </div>
          )
        }
      />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="space-y-4">
          <Panel title="Aggregated performance">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Activities" value={fmtNum(data.activities.length)} />
              <StatTile label="Views" value={fmtNum(data.totals.views)} />
              <StatTile label="Likes" value={fmtNum(data.totals.likes)} />
              <StatTile label="Passes" value={fmtNum(data.totals.passes)} />
              <StatTile label="Matches" value={fmtNum(data.totals.matches)} />
              <StatTile label="Plans" value={fmtNum(data.totals.plans)} />
            </div>
          </Panel>

          <Contacts providerId={id} contacts={data.contacts} onChange={reload} />
          <Communications
            providerId={id}
            contacts={data.contacts}
            comms={data.communications}
            onChange={reload}
          />

          <Panel title={`Activities · ${data.activities.length}`} bodyClassName="">
            <Table>
              <thead>
                <tr>
                  <Th>Activity</Th>
                  <Th>Status</Th>
                  <Th>Views</Th>
                  <Th>Likes</Th>
                  <Th>Passes</Th>
                  <Th>Like rate</Th>
                  <Th>Matches</Th>
                  <Th>Plans</Th>
                </tr>
              </thead>
              <tbody>
                {data.activities.map((a) => (
                  <Tr key={a.id}>
                    <Td>
                      <Link
                        to={`/admin/activities/${a.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        {a.title}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {a.category} · {a.city || "—"}
                      </div>
                    </Td>
                    <Td className="text-xs">{a.status}</Td>
                    <Td>{fmtNum(a.metrics.views)}</Td>
                    <Td>{fmtNum(a.metrics.likes + a.metrics.superlikes)}</Td>
                    <Td>{fmtNum(a.metrics.passes)}</Td>
                    <Td>{fmtPct(a.metrics.likeRate)}</Td>
                    <Td>{fmtNum(a.metrics.matches)}</Td>
                    <Td>{fmtNum(a.metrics.plans)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        </div>
      )}
    </>
  );
}

/* ------------------------------- contacts ------------------------------- */

const emptyContact = {
  businessName: "",
  email: "",
  phone: "",
  website: "",
  contactPage: "",
  address: "",
  contactPerson: "",
  role: "",
  preferredMethod: "",
  notes: "",
};

function Contacts({
  providerId,
  contacts,
  onChange,
}: {
  providerId: string;
  contacts: Contact[];
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...emptyContact });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await cc(`/providers/${providerId}/contacts`, {
        method: "POST",
        body: form,
      });
      setForm({ ...emptyContact });
      setAdding(false);
      onChange();
    } finally {
      setBusy(false);
    }
  };
  const del = async (cid: string) => {
    if (!confirm("Delete this contact?")) return;
    await cc(`/contacts/${cid}`, { method: "DELETE" });
    onChange();
  };

  return (
    <Panel
      title={`Business contacts · ${contacts.length}`}
      subtitle="Business information only. Kept where legitimately obtained."
      right={
        <Btn variant="neutral" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "Add contact"}
        </Btn>
      }
      bodyClassName=""
    >
      {adding && (
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          {(
            [
              ["businessName", "Business name"],
              ["email", "Business email"],
              ["phone", "Phone"],
              ["website", "Website"],
              ["contactPage", "Contact page URL"],
              ["contactPerson", "Contact person"],
              ["role", "Role / title"],
              ["preferredMethod", "Preferred method"],
              ["address", "Address"],
            ] as [keyof typeof form, string][]
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <Input
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                className="w-full"
              />
            </Field>
          ))}
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full"
              />
            </Field>
          </div>
          <div>
            <Btn
              variant="primary"
              loading={busy}
              disabled={
                !form.businessName && !form.email && !form.contactPerson
              }
              onClick={submit}
            >
              Save contact
            </Btn>
          </div>
        </div>
      )}
      {contacts.length === 0 && !adding ? (
        <div className="py-6 text-center text-sm text-slate-400">
          No contacts recorded.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {contacts.map((c) => (
            <div key={c.id} className="p-4 text-[13px]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">
                    {c.businessName || c.contactPerson || "Contact"}
                  </p>
                  {c.contactPerson && c.businessName && (
                    <p className="text-slate-500">
                      {c.contactPerson}
                      {c.role ? ` · ${c.role}` : ""}
                    </p>
                  )}
                </div>
                <Btn
                  variant="ghost"
                  className="!py-1 !text-xs"
                  onClick={() => del(c.id)}
                >
                  Delete
                </Btn>
              </div>
              <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {c.email && (
                  <Kv k="Email">
                    <a
                      href={`mailto:${c.email}`}
                      className="text-brand-600 hover:underline"
                    >
                      {c.email}
                    </a>
                  </Kv>
                )}
                {c.phone && <Kv k="Phone">{c.phone}</Kv>}
                {c.website && (
                  <Kv k="Website">
                    <a
                      href={c.website}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-brand-600 hover:underline"
                    >
                      {c.website}
                    </a>
                  </Kv>
                )}
                {c.contactPage && (
                  <Kv k="Contact page">
                    <a
                      href={c.contactPage}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-brand-600 hover:underline"
                    >
                      open
                    </a>
                  </Kv>
                )}
                {c.address && <Kv k="Address">{c.address}</Kv>}
                {c.preferredMethod && (
                  <Kv k="Prefers">{c.preferredMethod}</Kv>
                )}
              </dl>
              {c.notes && (
                <p className="mt-2 text-slate-600">{c.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------- communications ---------------------------- */

function Communications({
  providerId,
  contacts,
  comms,
  onChange,
}: {
  providerId: string;
  contacts: Contact[];
  comms: Comm[];
  onChange: () => void;
}) {
  const [form, setForm] = useState({
    kind: "note",
    subject: "",
    status: "",
    notes: "",
    contactId: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await cc(`/providers/${providerId}/communications`, {
        method: "POST",
        body: { ...form, contactId: form.contactId || null },
      });
      setForm({ kind: "note", subject: "", status: "", notes: "", contactId: "" });
      onChange();
    } finally {
      setBusy(false);
    }
  };
  const del = async (cid: string) => {
    if (!confirm("Delete this log entry?")) return;
    await cc(`/communications/${cid}`, { method: "DELETE" });
    onChange();
  };

  return (
    <Panel title={`Communication log · ${comms.length}`} bodyClassName="">
      <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
        <Field label="Type">
          <Select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
            className="w-full"
          >
            {["email", "call", "meeting", "note", "other"].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Subject">
          <Input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="w-full"
          />
        </Field>
        <Field label="Status">
          <Input
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            placeholder="sent / replied / …"
            className="w-full"
          />
        </Field>
        <Field label="Contact">
          <Select
            value={form.contactId}
            onChange={(e) => setForm({ ...form, contactId: e.target.value })}
            className="w-full"
          >
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.businessName || c.contactPerson || c.id.slice(0, 8)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-3">
          <Field label="Notes">
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full"
            />
          </Field>
        </div>
        <div className="flex items-end">
          <Btn
            variant="primary"
            loading={busy}
            disabled={!form.subject && !form.notes}
            onClick={submit}
          >
            Log
          </Btn>
        </div>
      </div>
      {comms.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400">
          No communications logged.
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Type</Th>
              <Th>Subject</Th>
              <Th>Status</Th>
              <Th>By</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {comms.map((c) => (
              <Tr key={c.id}>
                <Td className="whitespace-nowrap text-xs text-slate-500">
                  {fmtDate(c.occurredAt)}
                </Td>
                <Td>
                  <Badge tone="slate">{c.kind}</Badge>
                </Td>
                <Td>
                  {c.subject || "—"}
                  {c.notes && (
                    <div className="text-xs text-slate-500">{c.notes}</div>
                  )}
                </Td>
                <Td className="text-xs">{c.status || "—"}</Td>
                <Td className="text-xs text-slate-400">{c.byEmail || "—"}</Td>
                <Td>
                  <Btn
                    variant="ghost"
                    className="!py-1 !text-xs"
                    onClick={() => del(c.id)}
                  >
                    Delete
                  </Btn>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}

function Kv({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-slate-500">{k}</dt>
      <dd className="min-w-0 break-words text-slate-800">{children}</dd>
    </div>
  );
}
