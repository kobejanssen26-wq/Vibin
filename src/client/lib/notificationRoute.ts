import type { NotificationDTO } from "@shared/types";

/**
 * Where a click on a notification should land. `groupId` is present on
 * every group-originated notification (notifyGroup always injects it
 * server-side), so this only needs a per-kind switch for the rest of the
 * path — no guessing, no fallback to a generic page when we know exactly
 * what happened.
 */
export function notificationHref(n: NotificationDTO): string | null {
  if (n.kind === "support_reply") {
    const ticketId = n.data.ticketId;
    return typeof ticketId === "string" && ticketId ? `/help/${ticketId}` : "/help";
  }

  const groupId = n.data.groupId;
  if (typeof groupId !== "string" || !groupId) return null;

  switch (n.kind) {
    case "message": {
      const messageId = n.data.messageId;
      const params = new URLSearchParams({ tab: "chat" });
      if (typeof messageId === "string" && messageId) params.set("highlight", messageId);
      return `/groups/${groupId}?${params.toString()}`;
    }
    case "swiping_started":
      return `/groups/${groupId}/swipe`;
    case "date_voting_started":
      return `/groups/${groupId}/date`;
    case "plan_confirmed":
      return `/groups/${groupId}/plan`;
    case "member_joined":
    default:
      return `/groups/${groupId}`;
  }
}
