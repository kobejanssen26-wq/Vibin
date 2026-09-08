import { Link, useParams } from "react-router-dom";
import { cc } from "../api";
import { useResource } from "../lib";
import {
  Badge,
  ErrorNote,
  Loading,
  Panel,
  PageTitle,
  StatTile,
  Table,
  Td,
  Th,
  Tr,
  fmtDate,
  fmtDay,
  fmtNum,
} from "../ui";

interface Detail {
  group: {
    id: string;
    name: string;
    status: string;
    creatorId: string;
    createdAt: number;
  };
  settings: Record<string, unknown> | null;
  members: {
    userId: string;
    role: string;
    status: string;
    joinedAt: number;
    email: string;
    displayName: string | null;
  }[];
  votes: { likes: number; passes: number; superlikes: number };
  matches: {
    id: string;
    status: string;
    startsAt: number | null;
    matchedAt: number;
    completedAt: number | null;
    title: string;
    category: string;
  }[];
  plans: {
    id: string;
    startsAt: number | null;
    locationLabel: string;
    createdAt: number;
    title: string;
  }[];
  messageCount: number;
  deckSize: number;
}

export function GroupDetail() {
  const { id = "" } = useParams();
  const { data, loading, error, reload } = useResource<Detail>(
    () => cc<Detail>(`/groups/${id}`),
    id,
  );

  return (
    <>
      <PageTitle
        title={data?.group.name || "Group"}
        crumbs={
          <Link to="/admin/groups" className="hover:underline">
            ← Groups
          </Link>
        }
      />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="space-y-4">
          <Panel title="Overview">
            <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
              <Row k="Group ID">
                <code className="font-mono text-xs">{data.group.id}</code>
              </Row>
              <Row k="Status">
                <Badge tone="blue">{data.group.status}</Badge>
              </Row>
              <Row k="Creator">
                <Link
                  to={`/admin/users/${data.group.creatorId}`}
                  className="text-brand-600 hover:underline"
                >
                  {data.members.find((m) => m.userId === data.group.creatorId)
                    ?.displayName || data.group.creatorId}
                </Link>
              </Row>
              <Row k="Created">{fmtDate(data.group.createdAt)}</Row>
              <Row k="Deck size">{fmtNum(data.deckSize)}</Row>
              <Row k="Messages">{fmtNum(data.messageCount)}</Row>
            </dl>
          </Panel>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Members" value={fmtNum(data.members.length)} />
            <StatTile
              label="Likes"
              value={fmtNum(data.votes.likes + data.votes.superlikes)}
            />
            <StatTile label="Passes" value={fmtNum(data.votes.passes)} />
            <StatTile label="Matches" value={fmtNum(data.matches.length)} />
          </div>

          <Panel title={`Members · ${data.members.length}`} bodyClassName="">
            <Table>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <Tr key={m.userId}>
                    <Td>
                      <Link
                        to={`/admin/users/${m.userId}`}
                        className="text-brand-600 hover:underline"
                      >
                        {m.displayName || "—"}
                      </Link>
                      <div className="text-xs text-slate-500">{m.email}</div>
                    </Td>
                    <Td>{m.role}</Td>
                    <Td>
                      <Badge
                        tone={(m.status === "active" ? "green" : "slate") as never}
                      >
                        {m.status}
                      </Badge>
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {fmtDay(m.joinedAt)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={`Matches · ${data.matches.length}`} bodyClassName="">
              <Table>
                <thead>
                  <tr>
                    <Th>Activity</Th>
                    <Th>Status</Th>
                    <Th>Starts</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.matches.length === 0 && (
                    <tr>
                      <Td className="py-4 text-center text-slate-400">
                        No matches.
                      </Td>
                    </tr>
                  )}
                  {data.matches.map((m) => (
                    <Tr key={m.id}>
                      <Td>{m.title}</Td>
                      <Td>
                        <Badge
                          tone={
                            (m.status === "complete" ? "green" : "blue") as never
                          }
                        >
                          {m.status}
                        </Badge>
                      </Td>
                      <Td className="text-xs text-slate-500">
                        {m.startsAt ? fmtDate(m.startsAt) : "—"}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Panel>

            <Panel title={`Plans · ${data.plans.length}`} bodyClassName="">
              <Table>
                <thead>
                  <tr>
                    <Th>Activity</Th>
                    <Th>When</Th>
                    <Th>Where</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.plans.length === 0 && (
                    <tr>
                      <Td className="py-4 text-center text-slate-400">
                        No plans.
                      </Td>
                    </tr>
                  )}
                  {data.plans.map((p) => (
                    <Tr key={p.id}>
                      <Td>{p.title}</Td>
                      <Td className="text-xs text-slate-500">
                        {p.startsAt ? fmtDate(p.startsAt) : "activity only"}
                      </Td>
                      <Td className="text-xs text-slate-500">
                        {p.locationLabel}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Panel>
          </div>

          {data.settings && (
            <Panel title="Settings (raw)">
              <pre className="overflow-x-auto rounded bg-slate-50 p-3 text-[11px] text-slate-600">
                {JSON.stringify(data.settings, null, 2)}
              </pre>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-slate-500">{k}</dt>
      <dd className="text-slate-800">{children}</dd>
    </div>
  );
}
