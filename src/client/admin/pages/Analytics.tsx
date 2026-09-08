import { Link } from "react-router-dom";
import { cc } from "../api";
import { RangePicker, useRange, useResource } from "../lib";
import {
  ErrorNote,
  Loading,
  NotEnough,
  Panel,
  PageTitle,
  Table,
  Td,
  Th,
  Tr,
  fmtNum,
  fmtPct,
} from "../ui";

interface Ranked {
  id: string;
  title: string;
  category: string;
  views: number;
  likes: number;
  passes: number;
  matches: number;
  plans: number;
  bookingClicks: number;
  swipes: number;
  likeRate: number | null;
  planConversion: number | null;
}
interface RankResp {
  range: { label: string };
  mostViewed: Ranked[];
  mostLiked: Ranked[];
  highestLikeRate: Ranked[];
  mostMatched: Ranked[];
  highestPlanConversion: Ranked[];
  mostBookingClicks: Ranked[];
  mostPassed: Ranked[];
}
interface CatRow {
  category: string;
  swipes: number;
  likes: number;
  passes: number;
  matches: number;
  plans: number;
  views: number;
  bookingClicks: number;
  likeRate: number | null;
}

export function Analytics() {
  const { query } = useRange();
  const ranks = useResource<RankResp>(
    () => cc<RankResp>(`/rankings/activities?${query}&limit=10`),
    `r-${query}`,
  );
  const cats = useResource<{ categories: CatRow[] }>(
    () => cc<{ categories: CatRow[] }>(`/rankings/categories?${query}`),
    `c-${query}`,
  );

  const board = (title: string, rows: Ranked[], metric: (r: Ranked) => string) => (
    <Panel title={title} bodyClassName="">
      {rows.length === 0 ? (
        <NotEnough />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Activity</Th>
              <Th className="text-right">Value</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <Tr key={r.id}>
                <Td className="w-8 text-slate-400">{i + 1}</Td>
                <Td>
                  <Link
                    to={`/admin/activities/${r.id}`}
                    className="text-brand-600 hover:underline"
                  >
                    {r.title}
                  </Link>
                  <span className="ml-1 text-xs text-slate-400">{r.category}</span>
                </Td>
                <Td className="text-right font-medium tabular-nums">
                  {metric(r)}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  );

  return (
    <>
      <PageTitle title="Analytics" right={<RangePicker />} />
      {(ranks.error || cats.error) && (
        <ErrorNote
          message={ranks.error || cats.error || ""}
          onRetry={() => {
            ranks.reload();
            cats.reload();
          }}
        />
      )}
      {ranks.loading && !ranks.data && <Loading />}

      {cats.data && (
        <Panel
          title="By category"
          subtitle={`Range: ${ranks.data?.range.label ?? ""}`}
          bodyClassName=""
        >
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Views</Th>
                <Th>Likes</Th>
                <Th>Passes</Th>
                <Th>Like rate</Th>
                <Th>Matches</Th>
                <Th>Plans</Th>
                <Th>Booking clicks</Th>
              </tr>
            </thead>
            <tbody>
              {cats.data.categories.length === 0 && (
                <tr>
                  <Td className="py-4 text-center text-slate-400">
                    No category activity in range.
                  </Td>
                </tr>
              )}
              {cats.data.categories
                .slice()
                .sort((a, b) => b.likes - a.likes)
                .map((c) => (
                  <Tr key={c.category}>
                    <Td className="font-medium">{c.category}</Td>
                    <Td>{fmtNum(c.views)}</Td>
                    <Td>{fmtNum(c.likes)}</Td>
                    <Td>{fmtNum(c.passes)}</Td>
                    <Td>{fmtPct(c.likeRate)}</Td>
                    <Td>{fmtNum(c.matches)}</Td>
                    <Td>{fmtNum(c.plans)}</Td>
                    <Td>{fmtNum(c.bookingClicks)}</Td>
                  </Tr>
                ))}
            </tbody>
          </Table>
        </Panel>
      )}

      {ranks.data && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {board("Most viewed", ranks.data.mostViewed, (r) => fmtNum(r.views))}
          {board("Most liked", ranks.data.mostLiked, (r) => fmtNum(r.likes))}
          {board(
            "Highest like rate (≥3 swipes)",
            ranks.data.highestLikeRate,
            (r) => fmtPct(r.likeRate),
          )}
          {board("Most matched", ranks.data.mostMatched, (r) =>
            fmtNum(r.matches),
          )}
          {board(
            "Highest plan conversion",
            ranks.data.highestPlanConversion,
            (r) => fmtPct(r.planConversion),
          )}
          {board(
            "Most booking clicks",
            ranks.data.mostBookingClicks,
            (r) => fmtNum(r.bookingClicks),
          )}
          {board("Most passed", ranks.data.mostPassed, (r) => fmtNum(r.passes))}
        </div>
      )}
    </>
  );
}
