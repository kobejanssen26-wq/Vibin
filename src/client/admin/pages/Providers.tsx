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
  fmtNum,
} from "../ui";

interface Row {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  activityCount: number;
  verifiedCount: number;
}

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
                <Th>Kind</Th>
                <Th>Enabled</Th>
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
                      {p.id}
                    </div>
                  </Td>
                  <Td>{p.kind}</Td>
                  <Td>
                    <Badge tone={(p.enabled ? "green" : "slate") as never}>
                      {p.enabled ? "enabled" : "disabled"}
                    </Badge>
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
