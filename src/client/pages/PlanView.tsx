import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiRequestError } from "../lib/api";
import {
  AvatarStack,
  Button,
  ErrorState,
  LoadingScreen,
  Modal,
} from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import {
  CategoryIcon,
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
    <div className="space-y-4">
      <PageHeader
        back={{ to: `/groups/${plan.groupId}`, label: plan.groupName }}
        title="It's a plan"
        action={
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-lime-400 text-navy">
            <IconCheck size={18} />
          </span>
        }
      />

      <article className="card overflow-hidden">
        <div className="relative h-44 w-full overflow-hidden bg-navy">
          {a.imageUrl ? (
            <img
              src={a.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-white/25">
              <CategoryIcon id={a.category} size={48} />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-navy/80 to-transparent" />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-2 py-1 text-[12px] font-semibold text-navy">
            <CategoryIcon id={a.category} size={13} /> {a.categoryLabel}
          </span>
          <div className="absolute inset-x-4 bottom-3 text-white">
            <h2 className="text-lg font-bold leading-tight tracking-[-0.01em]">
              {a.title}
            </h2>
            {a.provider && (
              <p className="text-[13px] text-white/75">at {a.provider}</p>
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
          <p className="text-sm leading-relaxed text-navy-500">{a.description}</p>
          <div className="grid gap-2 border-t border-paper-line pt-3 text-sm">
            <Row icon={<IconMapPin size={16} />} text={plan.locationLabel} />
            <Row icon={<IconCalendar size={16} />} text={formatWhen(plan.startsAt)} />
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

      <div className="card p-4">
        <p className="mb-2 text-sm font-bold">Everyone's going</p>
        <AvatarStack people={plan.members} size={40} max={10} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {booking ? (
          <a
            href={booking}
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
            href={a.websiteUrl}
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
        <Link to={`/groups/${plan.groupId}`} className="btn-dark col-span-2">
          <IconChat size={16} /> Open group chat
        </Link>
      </div>

      <p className="rounded-2xl bg-paper-soft px-4 py-3 text-xs text-navy-400">
        {a.availabilityNote}
        {a.lastVerifiedAt && (
          <> Last checked {formatDay(a.lastVerifiedAt)}.</>
        )}
      </p>

      <ReportLink targetType="activity" targetId={a.id} />
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

const REPORT_REASONS = [
  { id: "incorrect_info", label: "Details are wrong (price, address, hours…)" },
  { id: "inappropriate", label: "Inappropriate or unsafe" },
  { id: "spam", label: "Spam or not a real activity" },
  { id: "other", label: "Something else" },
] as const;

function ReportLink({
  targetType,
  targetId,
}: {
  targetType: string;
  targetId: string;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState<string>("incorrect_info");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (sent) {
    return (
      <p className="text-center text-xs text-navy-400">
        Thanks — our team will take a look.
      </p>
    );
  }

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api("/reports", {
        method: "POST",
        body: { targetType, targetId, reason, detail: detail.trim() },
      });
      setSent(true);
      setOpen(false);
    } catch (e) {
      setErr(
        e instanceof ApiRequestError ? e.message : "Could not send the report.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="w-full text-center text-xs font-medium text-navy-400 underline underline-offset-2 hover:text-navy"
        onClick={() => setOpen(true)}
      >
        Report a problem with this activity
      </button>
      {open && (
        <Modal title="Report this activity" onClose={() => setOpen(false)}>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold text-navy-700">
              What's the issue?
            </legend>
            {REPORT_REASONS.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-paper-line px-3 py-2.5 text-sm has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50"
              >
                <input
                  type="radio"
                  name="reason"
                  className="h-4 w-4 accent-brand-500"
                  checked={reason === r.id}
                  onChange={() => setReason(r.id)}
                />
                {r.label}
              </label>
            ))}
          </fieldset>
          <textarea
            className="field mt-3 min-h-[80px] resize-none"
            placeholder="Add any detail that helps (optional)"
            maxLength={1000}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
          {err && (
            <p className="mt-2 text-sm font-medium text-danger-600">{err}</p>
          )}
          <Button className="mt-3 w-full" loading={busy} onClick={submit}>
            Send report
          </Button>
        </Modal>
      )}
    </>
  );
}
