import { cc } from "../api";
import { RangePicker, useRange, useResource } from "../lib";
import {
  ErrorNote,
  Loading,
  NotEnough,
  Panel,
  PageTitle,
  StatTile,
  fmtNum,
  fmtPct,
} from "../ui";

interface Step {
  key: string;
  label: string;
  count: number;
  conversion: number | null;
  dropoff: number | null;
}
interface FunnelResp {
  range: { label: string };
  signups: number;
  steps: Step[];
  enough: boolean;
}
interface Bucket {
  eligible: number;
  retained: number;
  rate: number | null;
}
interface RetResp {
  d1: Bucket;
  d7: Bucket;
  d30: Bucket;
  enough: boolean;
}

export function Funnel() {
  const { query } = useRange();
  const funnel = useResource<FunnelResp>(
    () => cc<FunnelResp>(`/funnel?${query}`),
    `f-${query}`,
  );
  const ret = useResource<RetResp>(
    () => cc<RetResp>(`/retention`),
    "retention",
  );

  return (
    <>
      <PageTitle title="Funnel & retention" right={<RangePicker />} />
      {(funnel.error || ret.error) && (
        <ErrorNote message={funnel.error || ret.error || ""} />
      )}
      {funnel.loading && !funnel.data && <Loading />}

      {funnel.data && (
        <Panel
          title="Signup cohort funnel"
          subtitle={`Users who signed up in the range (${funnel.data.signups}), and how far they got.`}
        >
          {!funnel.data.enough ? (
            <NotEnough label="Not enough signups in this range yet (need ≥ 5)." />
          ) : (
            <div className="space-y-1.5">
              {funnel.data.steps.map((s) => {
                const pct = s.conversion ?? 0;
                return (
                  <div key={s.key} className="flex items-center gap-3">
                    <div className="w-36 shrink-0 text-[13px] text-slate-600">
                      {s.label}
                    </div>
                    <div className="relative h-7 flex-1 overflow-hidden rounded bg-slate-100">
                      <div
                        className="h-full rounded bg-brand-500/85"
                        style={{ width: `${Math.max(1, pct * 100)}%` }}
                      />
                      <span className="absolute inset-y-0 left-2 flex items-center text-[12px] font-medium text-slate-700">
                        {fmtNum(s.count)}
                      </span>
                    </div>
                    <div className="w-16 shrink-0 text-right text-[12px] tabular-nums text-slate-500">
                      {fmtPct(s.conversion)}
                    </div>
                    <div className="w-20 shrink-0 text-right text-[12px] tabular-nums">
                      {s.dropoff == null ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span className="text-rose-500">
                          −{fmtPct(s.dropoff)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-3 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <div className="w-36 shrink-0">Step</div>
                <div className="flex-1">Reached</div>
                <div className="w-16 shrink-0 text-right">of signups</div>
                <div className="w-20 shrink-0 text-right">drop-off</div>
              </div>
            </div>
          )}
        </Panel>
      )}

      <div className="mt-4">
        <Panel
          title="Retention"
          subtitle="Share of users (whose window has fully elapsed) who came back."
        >
          {ret.loading && !ret.data && <Loading />}
          {ret.data && !ret.data.enough && (
            <NotEnough label="Not enough matured users yet (need ≥ 10)." />
          )}
          {ret.data && ret.data.enough && (
            <div className="grid grid-cols-3 gap-2">
              {(["d1", "d7", "d30"] as const).map((k) => (
                <StatTile
                  key={k}
                  label={k.toUpperCase()}
                  value={fmtPct(ret.data![k].rate)}
                  hint={`${ret.data![k].retained} / ${ret.data![k].eligible}`}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
