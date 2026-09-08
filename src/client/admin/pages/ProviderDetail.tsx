import { Link, useParams } from "react-router-dom";
import { cc } from "../api";
import { useResource } from "../lib";
import {
  ErrorNote,
  Loading,
  Panel,
  PageTitle,
  StatTile,
  Table,
  Td,
  Th,
  Tr,
  fmtNum,
  fmtPct,
} from "../ui";

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
    bookingClicks: number;
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
}

export function ProviderDetail() {
  const { id = "" } = useParams();
  const { data, loading, error, reload } = useResource<Detail>(
    () => cc<Detail>(`/providers/${id}`),
    id,
  );

  return (
    <>
      <PageTitle
        title={(data?.provider.name as string) || "Provider"}
        crumbs={
          <Link to="/admin/providers" className="hover:underline">
            ← Providers
          </Link>
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
              <StatTile
                label="Booking clicks"
                value={fmtNum(data.totals.bookingClicks)}
              />
            </div>
          </Panel>

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
