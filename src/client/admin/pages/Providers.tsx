import { Link } from "react-router-dom";
import { cc } from "../api";
import { useResource } from "../lib";
import {
  Badge,
  ErrorNote,
  Loading,
  Panel,
  PageTitle,
  Table,
  Td,
  Th,
  Tr,
  fmtDay,
  fmtNum,
} from "../ui";

interface Row {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  crmStatus: string;
  activityCount: number;
  verifiedCount: number;
  contactCount: number;
  lastContactAt: number | null;
}

export const CRM_TONE: Record<string, string> = {
  not_contacted: "slate",
  contacted: "blue",
  interested: "blue",
  partner: "green",
  not_interested: "red",
  follow_up: "amber",
  needs_review: "amber",
  outdated: "amber",
  inactive: "slate",
};

export function Providers() {
  const { data, loading, error, reload } = useResource<{ rows: Row[] }>(
    () => cc<{ rows: Row[] }>("/providers"),
    "providers",
  );

  return (
    <>
      <PageTitle title="Providers" />
      <Panel bodyClassName="">
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data && <Loading />}
        {data && (
          <Table>
            <thead>
              <tr>
                <Th>Provider</Th>
                <Th>CRM status</Th>
                <Th>Contacts</Th>
                <Th>Last contact</Th>
                <Th>Activities</Th>
                <Th>Verified</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <Link
                      to={`/admin/providers/${p.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {p.name}
                    </Link>
                    <div className="font-mono text-[11px] text-slate-400">
                      {p.kind} · {p.id}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={(CRM_TONE[p.crmStatus] ?? "slate") as never}>
                      {p.crmStatus.replace(/_/g, " ")}
                    </Badge>
                  </Td>
                  <Td>{fmtNum(p.contactCount)}</Td>
                  <Td className="text-xs text-slate-500">
                    {p.lastContactAt ? fmtDay(p.lastContactAt) : "—"}
                  </Td>
                  <Td>{fmtNum(p.activityCount)}</Td>
                  <Td>
                    {fmtNum(p.verifiedCount)}
                    {p.activityCount > 0 && (
                      <span className="ml-1 text-xs text-slate-400">
                        ({Math.round((p.verifiedCount / p.activityCount) * 100)}%)
                      </span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
