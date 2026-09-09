/**
 * Push delivery to the iOS / Android apps via Expo's push service
 * (https://docs.expo.dev/push-notifications/sending-notifications/).
 *
 * Expo relays to APNs / FCM using the credentials configured on the EAS
 * project, so the Worker needs no APNs key or FCM secret — just an HTTPS POST.
 * A user's `notificationPrefs.channels` map gates each kind; tokens Expo
 * reports as unregistered are pruned.
 *
 * This is best-effort: a failure here is logged, never thrown — a missed push
 * must not break the request that triggered it (the in-app notification row is
 * already written by notifyUsers()).
 */
import { inArray } from "drizzle-orm";
import type { DB } from "../db/client";
import { notificationPrefs, pushTokens } from "../db/schema";

const EXPO_URL = "https://exp.host/--/api/v2/push/send";

export interface PushPayload {
  kind: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

/** kind -> the notificationPrefs.channels key that gates it (default: allow). */
const KIND_TO_PREF: Record<string, string> = {
  member_joined: "joins",
  swiping_started: "activityMatch",
  activity_match: "activityMatch",
  date_voting_started: "dateVoting",
  plan_confirmed: "dateMatch",
  message: "messages",
};

export async function pushToUsers(
  db: DB,
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;
  try {
    const prefKey = KIND_TO_PREF[payload.kind];
    const [tokens, prefs] = await Promise.all([
      db
        .select({ userId: pushTokens.userId, token: pushTokens.token })
        .from(pushTokens)
        .where(inArray(pushTokens.userId, ids)),
      prefKey
        ? db
            .select({
              userId: notificationPrefs.userId,
              channels: notificationPrefs.channels,
            })
            .from(notificationPrefs)
            .where(inArray(notificationPrefs.userId, ids))
        : Promise.resolve([] as { userId: string; channels: string }[]),
    ]);
    if (tokens.length === 0) return;

    const muted = new Set<string>();
    if (prefKey) {
      for (const p of prefs) {
        try {
          const ch = JSON.parse(p.channels) as Record<string, boolean>;
          if (ch[prefKey] === false) muted.add(p.userId);
        } catch {
          /* malformed prefs -> treat as allow */
        }
      }
    }

    const messages = tokens
      .filter((t) => !muted.has(t.userId))
      .map((t) => ({
        to: t.token,
        title: payload.title,
        body: payload.body ?? "",
        data: payload.data ?? {},
        sound: "default" as const,
        channelId: "default",
        priority: "high" as const,
      }));
    if (messages.length === 0) return;

    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const res = await fetch(EXPO_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.error("expo push failed:", res.status, (await res.text()).slice(0, 200));
        continue;
      }
      const json = (await res.json()) as {
        data?: { status: string; details?: { error?: string } }[];
      };
      const dead: string[] = [];
      json.data?.forEach((r, idx) => {
        if (
          r.status === "error" &&
          r.details?.error === "DeviceNotRegistered"
        ) {
          dead.push(batch[idx]!.to);
        }
      });
      if (dead.length) {
        await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
      }
    }
  } catch (err) {
    console.error(
      "pushToUsers threw:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
