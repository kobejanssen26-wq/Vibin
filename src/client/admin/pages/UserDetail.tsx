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
  user: {
    id: string;
    email: string;
    role: string;
    status: string;
    emailVerifiedAt: number | null;
    createdAt: number;
    updatedAt: number;
    displayName?: string | null;
    age?: number | null;
    locationLabel?: string | null;
    bio?: string | null;
  };
  groups: {
    id: string;
    name: string;
    status: string;
    memberRole: string;
    memberStatus: string;
    joinedAt: number;
  }[];
  activity: { likes: number; passes: number; superlikes: number; total: number };
  plans: number;
  recentSwipes: {
    value: string;
    createdAt: number;
    title: string;
    category: string;
  }[];
  timeline: {
    name: string;
    activityId: string | null;
    groupId: string | null;
    createdAt: number;
  }[];
}

const voteTone = (v: string) =>
  v === "like" ? "green" : v === "superlike" ? "lime" : "slate";

export function UserDetail() {
  const { id = "" } = useParams();
  const { data, loading, error, reload } = useResource<Detail>(
    () => cc<Detail>(`/users/${id}`),
    id,
  );

  return (
    <>
      <PageTitle
        title={data?.user.displayName || "User"}
        crumbs={
          <Link to="/admin/users" className="hover:underline">
            ← Users
          </Link>
        }
      />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="space-y-4">
          <Panel title="Account">
            <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
              <Row k="Email">{data.user.email}</Row>
              <Row k="User ID">
                <code className="font-mono text-xs">{data.user.id}</code>
              </Row>
              <Row k="Role">
                <Badge tone={data.user.role === "owner" ? "lime" : "blue"}>
                  {data.user.role}
                </Badge>
              </Row>
              <Row k="Status">
                <Badge
                  tone={
                    (data.user.status === "active"
                      ? "green"
                      : data.user.status === "suspended"
                        ? "amber"
                        : "red") as never
                  }
                >
                  {data.user.status}
                </Badge>
              </Row>
              <Row k="Email verified">
                {data.user.emailVerifiedAt ? fmtDate(data.user.emailVerifiedAt) : "no"}
              </Row>
              <Row k="Joined">{fmtDate(data.user.createdAt)}</Row>
              <Row k="Location">{data.user.locationLabel || "—"}</Row>
              <Row k="Age">{data.user.age ?? "—"}</Row>
            </dl>
          </Panel>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Groups" value={fmtNum(data.groups.length)} />
            <StatTile label="Swipes" value={fmtNum(data.activity.total)} />
            <StatTile
              label="Likes"
              value={fmtNum(data.activity.likes + data.activity.superlikes)}
            />
            <StatTile label="Plans" value={fmtNum(data.plans)} />
          </div>

          <Panel title={`Groups · ${data.groups.length}`} bodyClassName="">
            <Table>
              <thead>
                <tr>
                  <Th>Group</Th>
                  <Th>Group status</Th>
                  <Th>Member role</Th>
                  <Th>Member status</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody>
                {data.groups.length === 0 && (
                  <tr>
                    <Td className="py-4 text-center text-slate-400" >
                      No memberships.
                    </Td>
                  </tr>
                )}
                {data.groups.map((g) => (
                  <Tr key={g.id}>
                    <Td>
                      <Link
                        to={`/admin/groups/${g.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        {g.name}
                      </Link>
                    </Td>
                    <Td>{g.status}</Td>
                    <Td>{g.memberRole}</Td>
                    <Td>{g.memberStatus}</Td>
                    <Td className="text-xs text-slate-500">
                      {fmtDay(g.joinedAt)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Recent swipes" bodyClassName="">
              <Table>
                <thead>
                  <tr>
                    <Th>Activity</Th>
                    <Th>Vote</Th>
                    <Th>When</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSwipes.length === 0 && (
                    <tr>
                      <Td className="py-4 text-center text-slate-400">
                        No swipes.
                      </Td>
                    </tr>
                  )}
                  {data.recentSwipes.map((s, i) => (
                    <Tr key={i}>
                      <Td>{s.title}</Td>
                      <Td>
                        <Badge tone={voteTone(s.value) as never}>
                          {s.value === "nope" ? "pass" : s.value}
                        </Badge>
                      </Td>
                      <Td className="text-xs text-slate-500">
                        {fmtDate(s.createdAt)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Panel>

            <Panel title="Event timeline" bodyClassName="">
              <Table>
                <thead>
                  <tr>
                    <Th>Event</Th>
                    <Th>When</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.timeline.length === 0 && (
                    <tr>
                      <Td className="py-4 text-center text-slate-400">
                        No tracked events yet.
                      </Td>
                    </tr>
                  )}
                  {data.timeline.map((t, i) => (
                    <Tr key={i}>
                      <Td className="font-mono text-xs">{t.name}</Td>
                      <Td className="text-xs text-slate-500">
                        {fmtDate(t.createdAt)}
                      </Td>
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
      <dt className="w-32 shrink-0 text-slate-500">{k}</dt>
      <dd className="text-slate-800">{children}</dd>
    </div>
  );
}
