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
import { ActivityExpanded } from "../components/ActivityExpanded";
import { formatWhen } from "../lib/format";
import { useLang } from "../lib/i18n";
import type { GroupDTO, MatchDTO, PlanDTO } from "@shared/types";

export function GroupHome() {
  const { t } = useLang();
  const { id = "" } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<"plan" | "chat">(sp.get("tab") === "chat" ? "chat" : "plan");
  const highlightMessageId = sp.get("highlight");
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [expandedMatch, setExpandedMatch] = useState<MatchDTO | null>(null);
  const { data, loading, error, refetch } = usePoll<{ group: GroupDTO }>(
    `/groups/${id}`,
    6000,
  );
  const matches = usePoll<{ matches: MatchDTO[] }>(`/groups/${id}/matches`, 10000);
  const plans = usePoll<{ plans: PlanDTO[] }>(`/groups/${id}/plans`, 10000);

  if (loading && !data) return <LoadingScreen />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  const group = data?.group;
  if (!group) return <ErrorState message={t("group.notFound")} />;

  const cta = primaryCta(group, t);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader
        back={{ to: "/app", label: t("group.back") }}
        title={group.name}
        subtitle={`${t(group.activeMemberCount === 1 ? "group.activeMemberOne" : "group.activeMemberOther", { n: group.activeMemberCount })} · ${
          group.settings?.dateKnown ? t("group.dateSet") : t("group.dateToDecide")
        }`}
      />

      {actionErr && (
        <p className="rounded-xl bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
          {actionErr}
        </p>
      )}

      <div className="flex gap-1 rounded-2xl border border-paper-line bg-paper-soft p-1 text-sm font-semibold">
        {(["plan", "chat"] as const).map((tb) => (
          <button
            key={tb}
            className={`flex-1 rounded-xl py-2 capitalize transition-[background-color,color] ${
              tab === tb
                ? "bg-paper-card text-navy shadow-sm"
                : "text-navy-400 hover:text-navy"
            }`}
            onClick={() => setTab(tb)}
          >
            {t(`group.tab.${tb}` as never)}
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
              <p className="relative eyebrow text-lime-400">{t("group.nextStep")}</p>
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
              {t("group.editSetup")}
            </LinkButton>
          )}

          <InviteBox code={group.inviteCode} url={group.inviteUrl} />

          {/* members */}
          <Reveal as="section" delay={60}>
            <SectionHead
              label={t("group.crew")}
              count={`${group.members.length}`}
            />
            <div className="hairline">
              {group.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3.5">
                  <Avatar name={m.displayName} url={m.avatarUrl} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {m.displayName}
                      {m.isYou && t("group.you")}
                    </p>
                    <p className="text-xs text-navy-400">
                      {m.role === "creator" ? t("group.roleCreator") : t("group.roleMember")}
                      {m.status !== "active" && ` · ${m.status}`}
                    </p>
                  </div>
                  {!m.isYou && (
                    <div className="flex shrink-0 items-center gap-2">
                      <ReportButton
                        targetType="member"
                        targetId={m.id}
                        label={t("group.report")}
                        modalTitle={t("group.reportMember", { name: m.displayName })}
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
              <SectionHead label={t("group.upcoming")} count={`${plans.data.plans.length}`} />
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
              label={t("group.matches")}
              count={matches.data ? `${matches.data.matches.length}` : undefined}
            />
            {matches.data?.matches.length ? (
              <div className="hairline">
                {matches.data.matches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-paper-soft"
                    onClick={() => setExpandedMatch(m)}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-lg">
                      {m.activity.categoryIcon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {m.activity.title}
                      </p>
                      <p className="text-xs text-navy-400">
                        {m.status === "complete"
                          ? t("group.plannedAt", { when: formatWhen(m.startsAt) })
                          : m.needsDateMatch
                            ? t("group.needsDate")
                            : t("group.matched")}
                      </p>
                    </div>
                    {m.needsDateMatch && (
                      <Link
                        to={`/groups/${id}/date`}
                        onClick={(e) => e.stopPropagation()}
                        className="btn-outline shrink-0 px-3 py-1.5 text-xs"
                      >
                        {t("group.vote")}
                      </Link>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="card p-6 text-center">
                <p className="text-sm font-semibold text-navy">{t("group.noMatchesTitle")}</p>
                <p className="mt-1 text-xs text-navy-400">
                  {t("group.noMatchesBody")}
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
                  title: t("group.archiveConfirmTitle"),
                  message: t("group.archiveConfirmBody"),
                  confirmLabel: t("group.archiveConfirmAction"),
                  tone: "danger",
                });
                if (!ok) return;
                try {
                  await api(`/groups/${id}`, { method: "DELETE" });
                  nav("/app");
                } catch (e) {
                  setActionErr(
                    e instanceof ApiRequestError ? e.message : t("group.archiveError"),
                  );
                }
              }}
            >
              {t("group.archiveGroup")}
            </button>
          )}
          {!group.isCreator && (
            <button
              className="w-full rounded-xl py-3 text-center text-sm font-medium text-navy-500 hover:bg-navy/5"
              onClick={async () => {
                const ok = await confirm({
                  title: t("group.leaveConfirmTitle"),
                  message: t("group.leaveConfirmBody"),
                  confirmLabel: t("group.leaveConfirmAction"),
                  tone: "danger",
                });
                if (!ok) return;
                try {
                  await api(`/groups/${id}/leave`, { method: "POST", body: {} });
                  nav("/app");
                } catch (e) {
                  setActionErr(
                    e instanceof ApiRequestError ? e.message : t("group.leaveError"),
                  );
                }
              }}
            >
              {t("group.leaveGroup")}
            </button>
          )}
          <div className="text-center">
            <ReportButton
              targetType="group"
              targetId={id}
              label={t("group.reportGroup")}
              modalTitle={t("group.reportGroupTitle")}
            />
          </div>
        </>
      )}

      {expandedMatch && (
        <ActivityExpanded
          activity={expandedMatch.activity}
          groupId={id}
          onClose={() => setExpandedMatch(null)}
        />
      )}
    </div>
  );
}

function primaryCta(g: GroupDTO, t: ReturnType<typeof useLang>["t"]) {
  switch (g.status) {
    case "configuring":
      return g.isCreator
        ? {
            title: t("group.cta.configuring.title"),
            sub: t("group.cta.configuring.body"),
            label: t("group.cta.configuring.action"),
            to: `/groups/${g.id}/configure`,
          }
        : {
            title: t("group.cta.waiting.title"),
            sub: t("group.cta.waiting.body"),
            label: t("group.cta.waiting.action"),
            to: `/groups/${g.id}`,
          };
    case "swiping":
      return {
        title: t("group.cta.swiping.title"),
        sub: t("group.cta.swiping.body"),
        label: t("group.cta.swiping.action"),
        to: `/groups/${g.id}/swipe`,
      };
    case "date_matching":
      return {
        title: t("group.cta.dateMatching.title"),
        sub: t("group.cta.dateMatching.body"),
        label: t("group.cta.dateMatching.action"),
        to: `/groups/${g.id}/date`,
      };
    case "planned":
      return {
        title: t("group.cta.planned.title"),
        sub: t("group.cta.planned.body"),
        label: t("group.cta.planned.action"),
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
  const { t } = useLang();
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
            ? t("group.member.inactiveHint")
            : t("group.member.activeHint")
        }
      >
        {status === "active" ? t("group.member.setInactive") : t("group.member.setActive")}
      </button>
      <button
        className="btn-ghost px-2.5 py-1.5 text-xs text-danger-600"
        disabled={busy}
        onClick={async () => {
          const ok = await confirm({
            title: t("group.member.removeConfirmTitle", { name: memberName }),
            message: t("group.member.removeConfirmBody"),
            confirmLabel: t("group.member.remove"),
            tone: "danger",
          });
          if (ok) void set("removed");
        }}
      >
        {t("group.member.remove")}
      </button>
    </div>
  );
}
