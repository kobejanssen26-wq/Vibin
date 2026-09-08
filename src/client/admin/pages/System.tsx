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
  fmtDate,
  fmtNum,
} from "../ui";

interface Sys {
  version: {
    env: string;
    appUrl: string;
    buildId: string;
    serverTime: number;
  };
  services: {
    name: string;
    status: string;
    detail: string;
    latencyMs?: number;
  }[];
  database: { tables: { name: string; rows: number }[]; migrationsApplied: number };
  events: { total: number; last24h: number; byName: { name: string; n: number }[] };
}

const tone = (s: string) =>
  s === "operational"
    ? "green"
    : s === "degraded"
      ? "amber"
      : s === "down"
        ? "red"
        : "slate";

export function System() {
  const { data, loading, error, reload } = useResource<Sys>(
    () => cc<Sys>("/system"),
    "system",
  );

  return (
    <>
      <PageTitle title="System health" />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="space-y-4">
          <Panel title="Deployment">
            <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
              <Row k="Environment">{data.version.env}</Row>
              <Row k="App URL">{data.version.appUrl}</Row>
              <Row k="Build">{data.version.buildId}</Row>
              <Row k="Server time">{fmtDate(data.version.serverTime)}</Row>
              <Row k="Migrations applied">
                {data.database.migrationsApplied || "—"}
              </Row>
            </dl>
          </Panel>

          <Panel title="Services" subtitle="Status shown only for checks actually performed">
            <div className="grid gap-2 sm:grid-cols-2">
              {data.services.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-[13px]"
                >
                  <span className="text-slate-700">{s.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{s.detail}</span>
                    <Badge tone={tone(s.status) as never}>{s.status}</Badge>
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Table sizes" bodyClassName="">
              <Table>
                <thead>
                  <tr>
                    <Th>Table</Th>
                    <Th className="text-right">Rows</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.database.tables.map((t) => (
                    <Tr key={t.name}>
                      <Td mono>{t.name}</Td>
                      <Td className="text-right tabular-nums">
                        {fmtNum(t.rows)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Panel>

            <Panel
              title="Analytics events"
              subtitle={`${fmtNum(data.events.total)} total · ${fmtNum(data.events.last24h)} in last 24h`}
              bodyClassName=""
            >
              <Table>
                <thead>
                  <tr>
                    <Th>Event</Th>
                    <Th className="text-right">Count</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.byName.length === 0 && (
                    <tr>
                      <Td className="py-4 text-center text-slate-400">
                        No events recorded yet.
                      </Td>
                    </tr>
                  )}
                  {data.events.byName.map((e) => (
                    <Tr key={e.name}>
                      <Td mono>{e.name}</Td>
                      <Td className="text-right tabular-nums">{fmtNum(e.n)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-40 shrink-0 text-slate-500">{k}</dt>
      <dd className="break-all text-slate-800">{children}</dd>
    </div>
  );
}
