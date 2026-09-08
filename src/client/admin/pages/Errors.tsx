import { cc } from "../api";
import { RangePicker, useRange, useResource } from "../lib";
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
  fmtDate,
  fmtNum,
} from "../ui";

interface Group {
  source: string;
  route: string;
  message: string;
  env: string;
  count: number;
  lastSeenAt: number;
  statuses: number[];
}
interface Resp {
  range: { label: string };
  total: number;
  groups: Group[];
}

export function Errors() {
  const { query } = useRange();
  const { data, loading, error, reload } = useResource<Resp>(
    () => cc<Resp>(`/errors?${query}`),
    query,
  );

  return (
    <>
      <PageTitle title="Errors" right={<RangePicker />} />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <Panel
          subtitle={`${fmtNum(data.total)} error event${data.total === 1 ? "" : "s"} in range · ${data.groups.length} distinct`}
          bodyClassName=""
        >
          {data.groups.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              No frontend or backend errors recorded in this range.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Source</Th>
                  <Th>Route</Th>
                  <Th>Message</Th>
                  <Th>Status</Th>
                  <Th>Env</Th>
                  <Th>Count</Th>
                  <Th>Last seen</Th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((g, i) => (
                  <Tr key={i}>
                    <Td>
                      <Badge
                        tone={(g.source === "backend" ? "red" : "amber") as never}
                      >
                        {g.source}
                      </Badge>
                    </Td>
                    <Td mono>{g.route}</Td>
                    <Td className="max-w-md break-words text-xs">{g.message}</Td>
                    <Td className="text-xs">
                      {g.statuses.length ? g.statuses.join(", ") : "—"}
                    </Td>
                    <Td className="text-xs">{g.env}</Td>
                    <Td>{fmtNum(g.count)}</Td>
                    <Td className="text-xs text-slate-500">
                      {fmtDate(g.lastSeenAt)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      )}
    </>
  );
}
