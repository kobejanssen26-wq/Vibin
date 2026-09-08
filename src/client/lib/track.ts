/**
 * Client analytics — the handful of events the server can't observe directly
 * (activity impressions, booking clicks, front-end errors). Fire-and-forget,
 * batched, deduped, and silent on failure. Never send anything sensitive.
 */
type ClientEvent =
  | "activity_viewed"
  | "booking_clicked"
  | "calendar_action"
  | "client_error";

interface Payload {
  name: ClientEvent;
  groupId?: string;
  activityId?: string;
  props?: Record<string, string | number | boolean>;
  dedupeKey?: string;
}

const queue: Payload[] = [];
const seen = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  if (queue.length === 0) return;
  const batch = queue.splice(0, 20);
  const body = JSON.stringify(batch.length === 1 ? batch[0] : batch);
  // keepalive lets it survive a page navigation
  fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {
    /* analytics must never break the app */
  });
}

export function track(e: Payload): void {
  if (e.dedupeKey) {
    if (seen.has(e.dedupeKey)) return;
    seen.add(e.dedupeKey);
  }
  queue.push(e);
  if (!timer) timer = setTimeout(flush, 1500);
}

/** Install once from main.tsx. Throttles error spam to 5 per session. */
export function installErrorTracking(): void {
  let errCount = 0;
  const report = (message: string, source?: string) => {
    if (errCount++ >= 5) return;
    track({
      name: "client_error",
      props: {
        source: "frontend",
        message: message.slice(0, 200),
        path: location.pathname,
        ...(source ? { at: source.slice(0, 120) } : {}),
      },
    });
  };
  window.addEventListener("error", (ev) =>
    report(ev.message || String(ev.error), `${ev.filename}:${ev.lineno}`),
  );
  window.addEventListener("unhandledrejection", (ev) =>
    report(
      ev.reason instanceof Error
        ? ev.reason.message
        : String(ev.reason ?? "unhandled rejection"),
    ),
  );
}
