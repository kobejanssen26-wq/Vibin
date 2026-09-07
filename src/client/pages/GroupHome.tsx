import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { usePoll } from "../lib/usePoll";
import { api, ApiRequestError } from "../lib/api";
import {
  Avatar,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingScreen,
} from "../components/ui";
import { InviteBox } from "../components/InviteBox";
import { GroupChat } from "../components/GroupChat";
import { PageHeader } from "../components/PageHeader";
import { useConfirm } from "../components/Confirm";
import { formatWhen } from "../lib/format";
import type { GroupDTO, MatchDTO, PlanDTO } from "@shared/types";

export function GroupHome() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [tab, setTab] = useState<"plan" | "chat">("plan");
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

      <div className="flex gap-1 rounded-2xl bg-paper-soft p-1 text-sm font-semibold">
        {(["plan", "chat"] as const).map((t) => (
          <button
            key={t}
            className={`flex-1 rounded-xl py-2 capitalize transition ${
              tab === t ? "bg-white text-navy shadow-card" : "text-navy-400"
            }`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "chat" ? (
        <GroupChat groupId={id} />
      ) : (
        <>
          {cta && (
            <div className="card bg-vibin-blue p-5 text-white">
              <p className="font-bold">{cta.title}</p>
              <p className="mt-0.5 text-sm text-white/90">{cta.sub}</p>
              <button
                className="btn mt-3 w-full bg-white text-navy"
                onClick={() => nav(cta.to)}
              >
                {cta.label}
              </button>
            </div>
          )}

          {group.isCreator && group.status === "configuring" && (
            <LinkButton to={`/groups/${id}/configure`} variant="ghost" className="w-full">
              Edit group setup
            </LinkButton>
          )}

          <InviteBox code={group.inviteCode} url={group.inviteUrl} />

          {/* members */}
          <section className="card p-4">
            <h2 className="mb-3 font-bold">Members</h2>
            <ul className="space-y-2">
              {group.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3">
                  <Avatar name={m.displayName} url={m.avatarUrl} size={36} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">
                      {m.displayName}
                      {m.isYou && " (you)"}
                    </p>
                    <p className="text-xs text-navy-400">
                      {m.role === "creator" ? "Creator" : "Member"}
                      {m.status !== "active" && ` · ${m.status}`}
                    </p>
                  </div>
                  {group.isCreator && !m.isYou && (
                    <MemberActions
                      groupId={id}
                      memberId={m.id}
                      memberName={m.displayName}
                      status={m.status}
                      onDone={refetch}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* upcoming plans */}
          <section className="card p-4">
            <h2 className="mb-3 font-bold">Upcoming plans</h2>
            {plans.data?.plans.length ? (
              <ul className="space-y-2">
                {plans.data.plans.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/plans/${p.id}`}
                      className="block rounded-2xl bg-paper-soft p-3"
                    >
                      <p className="font-semibold">{p.activity.title}</p>
                      <p className="text-sm text-navy-400">
                        {formatWhen(p.startsAt)} · {p.locationLabel}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-navy-400">No confirmed plans yet.</p>
            )}
          </section>

          {/* matches */}
          <section className="card p-4">
            <h2 className="mb-3 font-bold">Matches</h2>
            {matches.data?.matches.length ? (
              <ul className="space-y-2">
                {matches.data.matches.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded-2xl bg-paper-soft p-3"
                  >
                    <span className="text-2xl">{m.activity.categoryIcon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{m.activity.title}</p>
                      <p className="text-xs text-navy-400">
                        {m.status === "complete"
                          ? `Planned · ${formatWhen(m.startsAt)}`
                          : m.needsDateMatch
                            ? "Matched · needs a date"
                            : "Matched"}
                      </p>
                    </div>
                    {m.needsDateMatch && (
                      <Link
                        to={`/groups/${id}/date`}
                        className="btn-ghost px-3 py-1.5 text-xs"
                      >
                        Vote
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                emoji="🃏"
                title="No matches yet"
                message="Keep swiping — a match needs everyone."
              />
            )}
          </section>

          {group.isCreator && group.status !== "archived" && (
            <button
              className="w-full rounded-xl py-3 text-center text-sm font-medium text-danger-600 hover:bg-danger-50"
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
