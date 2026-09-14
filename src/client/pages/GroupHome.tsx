import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { usePoll } from "../lib/usePoll";
import { api, ApiRequestError } from "../lib/api";
import {
  Avatar,
  ErrorState,
  LinkButton,
  LoadingScreen,
  SectionHead,
} from "../components/ui";
import { InviteBox } from "../components/InviteBox";
import { GroupChat } from "../components/GroupChat";
import { ReportButton } from "../components/ReportButton";
import { Reveal } from "../components/Reveal";
import { NearbyEvents } from "../components/NearbyEvents";
import { PageHeader } from "../components/PageHeader";
import { useConfirm } from "../components/Confirm";
import { IconChevronRight } from "../components/icons";
import { formatWhen } from "../lib/format";
import type { GroupDTO, MatchDTO, PlanDTO } from "@shared/types";

export function GroupHome() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<"plan" | "chat">(sp.get("tab") === "chat" ? "chat" : "plan");
  const highlightMessageId = sp.get("highlight");
  const [actionErr, setActionErr] = useState<string | null>(null);
  const { data, loading, error, refetch } = usePoll<{ group: GroupDTO }>(
    `/groups/${id}`,
    6000,
  );
  const matches = usePoll<{ matches: MatchDTO[] }>(`/groups/${id}/matches`, 10000);
  const plans = usePoll<{ plans: PlanDTO[] }>(`/groups/${id}/plans`, 10000);

  if (loading && !data) return <LoadingScreen />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  const group = data?.group;
  if (!group) return <ErrorState message="Group not found." />;

  const cta = primaryCta(group);

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ to: "/app", label: "Groups" }}
        title={group.name}
        subtitle={`${group.activeMemberCount} active member${
          group.activeMemberCount === 1 ? "" : "s"
        } · ${group.settings?.dateKnown ? "date set" : "date to decide"}`}
      />

      {actionErr && (
        <p className="rounded-xl bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
          {actionErr}
        </p>
      )}

      <div className="flex gap-1 rounded-2xl border border-paper-line bg-paper-soft p-1 text-sm font-semibold">
        {(["plan", "chat"] as const).map((t) => (
          <button
            key={t}
            className={`flex-1 rounded-xl py-2 capitalize transition-[background-color,color] ${
              tab === t
                ? "bg-paper-card text-navy shadow-sm"
                : "text-navy-400 hover:text-navy"
            }`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "chat" ? (
        <GroupChat groupId={id} highlightId={highlightMessageId} />
      ) : (
        <>
          {cta && (
            <Reveal className="relative overflow-hidden rounded-3xl bg-vibin-match p-5 text-white">
              <div className="dot-grid pointer-events-none absolute inset-0 text-white/60 opacity-[0.06]" />
              <p className="relative eyebrow text-lime-400">Next step</p>
              <p className="relative mt-1 text-lg font-extrabold">{cta.title}</p>
              <p className="relative mt-0.5 text-sm text-white/80">{cta.sub}</p>
              <button
                className="btn-lime relative mt-4 w-full"
                onClick={() => nav(cta.to)}
              >
                {cta.label}
              </button>
            </Reveal>
          )}

          {group.isCreator && group.status === "configuring" && (
            <LinkButton
              to={`/groups/${id}/configure`}
              variant="outline"
              className="w-full"
            >
              Edit group setup
            </LinkButton>
          )}

          <InviteBox code={group.inviteCode} url={group.inviteUrl} />

          {/* members */}
          <Reveal as="section" delay={60}>
            <SectionHead
              label="Crew"
              count={`${group.members.length}`}
            />
            <div className="hairline">
              {group.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3.5">
                  <Avatar name={m.displayName} url={m.avatarUrl} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {m.displayName}
                      {m.isYou && " (you)"}
                    </p>
                    <p className="text-xs text-navy-400">
                      {m.role === "creator" ? "Creator" : "Member"}
                      {m.status !== "active" && ` · ${m.status}`}
                    </p>
                  </div>
                  {!m.isYou && (
                    <div className="flex shrink-0 items-center gap-2">
                      <ReportButton
                        targetType="member"
                        targetId={m.id}
                        label="Report"
                        modalTitle={`Report ${m.displayName}`}
                      />
                      {group.isCreator && (
                        <MemberActions
                          groupId={id}
                          memberId={m.id}
                          memberName={m.displayName}
                          status={m.status}
                          onDone={refetch}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Reveal>

          {/* upcoming plans */}
          {plans.data && plans.data.plans.length > 0 && (
            <Reveal as="section" delay={120}>
              <SectionHead label="Upcoming" count={`${plans.data.plans.length}`} />
              <div className="hairline">
                {plans.data.plans.map((p) => (
                  <Link
                    key={p.id}
                    to={`/plans/${p.id}`}
                    className="flex items-center gap-3 p-3.5 transition-colors hover:bg-paper-soft"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-lime-400/20 text-lg">
                      {p.activity.categoryIcon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {p.activity.title}
                      </p>
                      <p className="truncate text-xs text-navy-400">
                        {formatWhen(p.startsAt)} · {p.locationLabel}
                      </p>
                    </div>
                    <IconChevronRight size={16} className="shrink-0 text-navy-300" />
                  </Link>
                ))}
              </div>
            </Reveal>
          )}

          {/* matches */}
          <Reveal as="section" delay={180}>
            <SectionHead
              label="Matches"
              count={matches.data ? `${matches.data.matches.length}` : undefined}
            />
            {matches.data?.matches.length ? (
              <div className="hairline">
                {matches.data.matches.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-lg">
                      {m.activity.categoryIcon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {m.activity.title}
                      </p>
                      <p className="text-xs text-navy-400">
                        {m.status === "complete"
                          ? `Planned · ${formatWhen(m.startsAt)}`
                          : m.needsDateMatch
                            ? "Needs a date"
                            : "Matched"}
                      </p>
                    </div>
                    {m.needsDateMatch && (
                      <Link
                        to={`/groups/${id}/date`}
                        className="btn-outline shrink-0 px-3 py-1.5 text-xs"
                      >
                        Vote
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="card p-6 text-center">
                <p className="text-sm font-semibold text-navy">No matches yet</p>
                <p className="mt-1 text-xs text-navy-400">
                  Keep swiping. It only counts when everyone likes the same thing.
                </p>
              </div>
            )}
          </Reveal>

          <Reveal delay={220}>
            <NearbyEvents settings={group.settings} />
          </Reveal>

          {group.isCreator && group.status !== "archived" && (
            <button
              className="w-full rounded-xl py-3 text-center text-sm font-semibold text-danger-600 transition-colors hover:bg-danger-50"
              onClick={async () => {
                const ok = await confirm({
                  title: "Archive this group?",
                  message:
                    "It disappears for everyone. Plans and chat history stay saved but the group can't be used again.",
                  confirmLabel: "Archive",
                  tone: "danger",
                });
                if (!ok) return;
                try {
                  await api(`/groups/${id}`, { method: "DELETE" });
                  nav("/app");
                } catch (e) {
                  setActionErr(
                    e instanceof ApiRequestError ? e.message : "Could not archive the group.",
                  );
                }
              }}
            >
              Archive group
            </button>
          )}
          {!group.isCreator && (
            <button
              className="w-full rounded-xl py-3 text-center text-sm font-medium text-navy-500 hover:bg-navy/5"
              onClick={async () => {
                const ok = await confirm({
                  title: "Leave this group?",
                  message: "You'll stop counting toward matches and lose access to the plan.",
                  confirmLabel: "Leave",
                  tone: "danger",
                });
                if (!ok) return;
                try {
                  await api(`/groups/${id}/leave`, { method: "POST", body: {} });
                  nav("/app");
                } catch (e) {
                  setActionErr(
                    e instanceof ApiRequestError ? e.message : "Could not leave the group.",
                  );
                }
              }}
            >
              Leave group
            </button>
          )}
          <div className="text-center">
            <ReportButton
              targetType="group"
              targetId={id}
              label="Report a problem with this group"
              modalTitle="Report this group"
            />
          </div>
        </>
      )}
    </div>
  );
}

function primaryCta(g: GroupDTO) {
  switch (g.status) {
    case "configuring":
      return g.isCreator
        ? {
            title: "Finish setup",
            sub: "Pick categories, place and date, then start swiping.",
            label: "Configure group",
            to: `/groups/${g.id}/configure`,
          }
        : {
            title: "Waiting on the creator",
            sub: "They’re still setting things up. Hang tight.",
            label: "Refresh",
            to: `/groups/${g.id}`,
          };
    case "swiping":
      return {
        title: "Swiping is on",
        sub: "Everyone needs to like the same activity for it to match.",
        label: "Continue swiping",
        to: `/groups/${g.id}/swipe`,
      };
    case "date_matching":
      return {
        title: "Pick a date",
        sub: "You matched an activity — now vote on when.",
        label: "Vote on dates",
        to: `/groups/${g.id}/date`,
      };
    case "planned":
      return {
        title: "It’s a plan 🎉",
        sub: "Everything’s locked in.",
        label: "View the plan",
        to: `/groups/${g.id}/plan`,
      };
    default:
      return null;
  }
}

function MemberActions({
  groupId,
  memberId,
  memberName,
  status,
  onDone,
}: {
  groupId: string;
  memberId: string;
  memberName: string;
  status: string;
  onDone: () => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const set = async (s: "active" | "inactive" | "removed") => {
    setBusy(true);
    try {
      await api(`/groups/${groupId}/members/${memberId}`, {
        method: "PATCH",
        body: { status: s },
      });
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex shrink-0 gap-1">
      <button
        className="btn-ghost px-2.5 py-1.5 text-xs"
        disabled={busy}
        onClick={() => set(status === "active" ? "inactive" : "active")}
        title={
          status === "active"
            ? "Inactive members don't hold up a match"
            : "Count this member toward matches again"
        }
      >
        {status === "active" ? "Set inactive" : "Set active"}
      </button>
      <button
        className="btn-ghost px-2.5 py-1.5 text-xs text-danger-600"
        disabled={busy}
        onClick={async () => {
          const ok = await confirm({
            title: `Remove ${memberName}?`,
            message: "They lose access to this group and stop counting toward matches.",
            confirmLabel: "Remove",
            tone: "danger",
          });
          if (ok) void set("removed");
        }}
      >
        Remove
      </button>
    </div>
  );
}
