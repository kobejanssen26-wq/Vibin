import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiRequestError } from "../lib/api";
import { AvatarStack, ErrorState, LoadingScreen } from "../components/ui";
import { formatWhen } from "../lib/format";
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
    <div className="space-y-5">
      <div>
        <Link to={`/groups/${plan.groupId}`} className="text-sm text-navy-400">
          ← {plan.groupName}
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-3xl">🎉</span>
          <h1 className="text-2xl font-extrabold">It’s a plan!</h1>
        </div>
      </div>

      <div className="card overflow-hidden">
        {a.imageUrl ? (
          <img src={a.imageUrl} alt="" className="h-44 w-full object-cover" />
        ) : (
          <div className="grid h-44 w-full place-items-center bg-vibin-blue text-6xl">
            {a.categoryIcon}
          </div>
        )}
        <div className="space-y-2 p-4">
          <h2 className="text-xl font-extrabold">{a.title}</h2>
          <p className="text-sm text-navy-400">{a.description}</p>
          <div className="grid grid-cols-1 gap-1 pt-1 text-sm">
            <Row icon="📍" text={plan.locationLabel} />
            <Row icon="📅" text={formatWhen(plan.startsAt)} />
            <Row icon="💰" text={a.priceLabel} />
            {a.durationMin && <Row icon="⏱️" text={`${a.durationMin} min`} />}
            {a.minAge && <Row icon="🔞" text={`${a.minAge}+`} />}
          </div>
        </div>
      </div>

      <div className="card p-4">
        <p className="mb-2 text-sm font-bold">Everyone’s going</p>
        <AvatarStack people={plan.members} size={40} max={10} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {booking ? (
          <a href={booking} target="_blank" rel="noreferrer" className="btn-primary">
            {a.ticketUrl ? "Get tickets" : "Book now"}
          </a>
        ) : (
          <button
            className="btn-ghost cursor-not-allowed opacity-60"
            title="No booking link for this activity"
            disabled
          >
            Booking not available
          </button>
        )}
        {a.websiteUrl && (
          <a
            href={a.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost"
          >
            Open website
          </a>
        )}
        {plan.startsAt && (
          <>
            <a
              href={plan.calendar.googleUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost"
            >
              Google Calendar
            </a>
            <a href={plan.calendar.icsUrl} className="btn-ghost" download>
              Download .ics
            </a>
          </>
        )}
        <button className="btn-ghost" onClick={share}>
          Share
        </button>
        <Link to={`/groups/${plan.groupId}`} className="btn-dark">
          Group chat
        </Link>
      </div>

      <p className="rounded-2xl bg-paper-soft px-4 py-3 text-xs text-navy-400">
        {a.availabilityNote}
      </p>

      <ReportLink targetType="activity" targetId={a.id} />
    </div>
  );
}

function Row({ icon, text }: { icon: string; text: string }) {
  return (
    <p className="flex items-center gap-2">
      <span>{icon}</span>
      <span>{text}</span>
    </p>
  );
}

function ReportLink({
  targetType,
  targetId,
}: {
  targetType: string;
  targetId: string;
}) {
  const [sent, setSent] = useState(false);
  return sent ? (
    <p className="text-center text-xs text-navy-400">
      Thanks — we’ll review it.
    </p>
  ) : (
    <button
      className="w-full text-center text-xs text-navy-400 underline"
      onClick={async () => {
        const detail = prompt("What's wrong with this activity’s info?");
        if (detail == null) return;
        try {
          await api("/reports", {
            method: "POST",
            body: { targetType, targetId, reason: "incorrect_info", detail },
          });
          setSent(true);
        } catch {
          alert("Could not send the report.");
        }
      }}
    >
      Report incorrect information
    </button>
  );
}
