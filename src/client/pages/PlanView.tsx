import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiRequestError } from "../lib/api";
import {
  AvatarStack,
  Button,
  ErrorState,
  LoadingScreen,
} from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { ReportButton } from "../components/ReportButton";
import {
  IconCalendar,
  IconChat,
  IconCheck,
  IconClock,
  IconExternal,
  IconInfo,
  IconMapPin,
  IconShare,
  IconTag,
} from "../components/icons";
import { formatDay, formatDuration, formatWhen } from "../lib/format";
import { track } from "../lib/track";
import { AvailabilityNote } from "../components/AvailabilityNote";
import type { PlanDTO } from "@shared/types";

export function PlanView() {
  const { id, planId } = useParams();
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (planId) {
          const { plan } = await api<{ plan: PlanDTO }>(`/plans/${planId}`);
          setPlan(plan);
        } else if (id) {
          const { plans } = await api<{ plans: PlanDTO[] }>(
            `/groups/${id}/plans`,
          );
          setPlan(plans[0] ?? null);
        }
      } catch (e) {
        setErr(e instanceof ApiRequestError ? e.message : "Could not load plan.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, planId]);

  if (loading) return <LoadingScreen />;
  if (err) return <ErrorState message={err} />;
  if (!plan)
    return (
      <ErrorState
        title="No plan yet"
        message="This group hasn’t locked in a plan. Keep swiping!"
      />
    );

  const a = plan.activity;
  const booking = a.bookingUrl ?? a.ticketUrl;

  const share = async () => {
    track({ name: "activity_shared", groupId: plan.groupId, activityId: a.id });
    const url = `${location.origin}/plans/${plan.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `VIBIN plan: ${a.title}`, url });
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <PageHeader
        back={{ to: `/groups/${plan.groupId}`, label: plan.groupName }}
        title="It's a plan"
        action={
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-lime-400 text-navy">
            <IconCheck size={22} />
          </span>
        }
      />

      <div className="lg:grid lg:grid-cols-[1.6fr_1fr] lg:items-start lg:gap-6">
      <article className="card overflow-hidden">
        <div className="relative h-48 w-full overflow-hidden">
          {a.imageUrl ? (
            <img
              src={a.imageUrl}
              alt={a.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="relative grid h-full w-full place-items-center bg-vibin-blue">
              <div
                className="absolute inset-0 opacity-[0.12]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)",
                  backgroundSize: "22px 22px",
                }}
              />
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/12 text-3xl ring-1 ring-white/20">
                {a.categoryIcon}
              </span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-navy/75 to-transparent" />
          <span className="chip absolute left-3 top-3 border-white/20 bg-white/90 backdrop-blur">
            {a.categoryIcon} {a.categoryLabel}
          </span>
          <div className="absolute inset-x-4 bottom-3 text-white">
            <h2 className="text-xl font-extrabold leading-tight drop-shadow-sm">
              {a.title}
            </h2>
            {a.provider && (
              <p className="text-sm text-white/85">at {a.provider}</p>
            )}
          </div>
        </div>

        {/* ticket-style perforation */}
        <div className="relative">
          <span className="absolute -left-2 top-0 h-4 w-4 -translate-y-1/2 rounded-full bg-paper" />
          <span className="absolute -right-2 top-0 h-4 w-4 -translate-y-1/2 rounded-full bg-paper" />
          <div className="mx-4 border-t-2 border-dashed border-paper-line" />
        </div>

        <div className="space-y-3 p-4">
          <p className="text-sm leading-relaxed text-navy-500">{a.fullDescription}</p>
          <div className="grid gap-2 border-t border-paper-line pt-3 text-sm">
            <Row icon={<IconMapPin size={16} />} text={plan.locationLabel} />
            <Row icon={<IconCalendar size={16} />} text={formatWhen(plan.startsAt)} />
            <AvailabilityNote status={plan.availabilityStatus} className="-mt-1.5 pl-[26px]" />
            <Row icon={<IconTag size={16} />} text={a.priceLabel} />
            {a.durationMin ? (
              <Row icon={<IconClock size={16} />} text={formatDuration(a.durationMin)} />
            ) : null}
            {a.minAge ? (
              <Row icon={<IconInfo size={16} />} text={`Minimum age ${a.minAge}`} />
            ) : null}
          </div>
        </div>
      </article>

      <div className="mt-5 space-y-5 lg:mt-0">
      <div className="card p-4">
        <p className="mb-2 text-sm font-bold">Everyone's going</p>
        <AvatarStack people={plan.members} size={40} max={10} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {booking ? (
          <a
            href={`/api/go/activity/${a.id}?kind=${a.ticketUrl ? "ticket" : "booking"}&src=plan_screen&groupId=${encodeURIComponent(plan.groupId)}`}
            target="_blank"
            rel="noreferrer"
            className="btn-primary col-span-2"
          >
            <IconExternal size={18} />
            {a.ticketUrl ? "Get tickets" : "Book with the provider"}
          </a>
        ) : (
          <div className="col-span-2 rounded-2xl bg-paper-soft px-4 py-3 text-center text-sm text-navy-400">
            No online booking — {a.websiteUrl ? "check the provider's site" : "contact the venue directly"}.
          </div>
        )}
        {a.websiteUrl && (
          <a
            href={`/api/go/activity/${a.id}?kind=website&src=plan_screen&groupId=${encodeURIComponent(plan.groupId)}`}
            target="_blank"
            rel="noreferrer"
            className="btn-outline"
          >
            <IconExternal size={16} /> Website
          </a>
        )}
        {plan.startsAt && (
          <a
            href={plan.calendar.googleUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-outline"
            onClick={() =>
              track({
                name: "calendar_action",
                groupId: plan.groupId,
                activityId: a.id,
                props: { kind: "google" },
              })
            }
          >
            <IconCalendar size={16} /> Calendar
          </a>
        )}
        {plan.startsAt && (
          <a href={plan.calendar.icsUrl} className="btn-outline" download>
            .ics file
          </a>
        )}
        <button className="btn-outline" onClick={share}>
          <IconShare size={16} /> Share
        </button>
        <Link to={`/groups/${plan.groupId}?tab=chat`} className="btn-dark col-span-2">
          <IconChat size={16} /> Open group chat
        </Link>
      </div>

      <p className="rounded-2xl bg-paper-soft px-4 py-3 text-xs text-navy-400">
        {a.availabilityNote}
        {a.lastVerifiedAt && (
          <> Last checked {formatDay(a.lastVerifiedAt)}.</>
        )}
      </p>

      <div className="text-center">
        <ReportButton
          targetType="activity"
          targetId={a.id}
          label="Report a problem with this activity"
          modalTitle="Report this activity"
        />
      </div>
      </div>
      </div>
    </div>
  );
}

function Row({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <p className="flex items-center gap-2.5 text-navy">
      <span className="shrink-0 text-navy-400">{icon}</span>
      <span>{text}</span>
    </p>
  );
}
