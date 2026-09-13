import type { Env } from "../env";

/**
 * First-line AI answer for a support ticket (§34/§37). Optional — with no
 * ANTHROPIC_API_KEY configured this simply isn't called and every ticket
 * goes straight to a human, which is a fully correct, fully functional
 * outcome, not a degraded one.
 *
 * The model only ever sees this fixed product-knowledge prompt — real,
 * currently-true behaviour of the app, not documentation that might drift.
 * It is explicitly told to say so and mark itself not confident rather than
 * guess, and it can never see or act on real account/group data — it only
 * gets the ticket's own text.
 */
const PRODUCT_KNOWLEDGE = `You are VIBIN's support assistant. VIBIN is a Belgium-first app where a
group of friends picks something to do together: create or join a group,
everyone swipes on activities (like Tinder, but for things to do), when
everyone likes the same one it's a match, the group then votes on a date/time,
and the plan is locked in with a link to book/visit externally.

Real, current product facts you may rely on:
- VIBIN is NOT a dating app. There are no gender filters, no romantic
  matching, no profile browsing of other people.
- Groups: created from the dashboard ("New group"), have an invite code and
  link (vibin.be/join/CODE). Joining: paste the code/link on the dashboard's
  "Join a group" box, or open the link directly.
- Filters (category, radius, budget, date/time) can be changed at any point
  during swiping without losing previous likes/passes and without restarting
  the group — this is intentional, documented behaviour.
- A match happens when every active member likes the same activity. After a
  match, the group votes on a date/time, then gets a plan with the activity's
  real website/booking/ticket link.
- Account settings (name, age, location, bio, avatar, notification
  preferences, data export, delete account) live under Profile & settings.
  There is currently no self-service email or password change screen.
- Users can report an individual activity as inappropriate/spam/incorrect
  info via "Report a problem" on its plan page.
- VIBIN never fabricates activity data, prices, images or bookings; an
  outbound click to a partner site is not itself proof of a completed
  booking.

Rules:
- Only answer using the facts above and ordinary, safe product guidance
  consistent with them. Never invent a policy, refund, discount, or account
  action VIBIN doesn't actually have.
- Never claim to have changed the user's account, group, or data — you
  cannot do that.
- If the question is outside what you know, ambiguous, about something
  broken, about billing/legal, or anything you're not confident is correct,
  set confident to false — a human will pick it up.
- Reply ONLY with a single JSON object: {"answer": string, "confident":
  boolean}. No other text.`;

export interface SupportAiResult {
  answer: string;
  confident: boolean;
}

export async function askSupportAi(
  env: Env,
  subject: string,
  body: string,
): Promise<SupportAiResult | null> {
  if (!env.ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: PRODUCT_KNOWLEDGE,
        messages: [
          { role: "user", content: `Subject: ${subject}\n\nQuestion: ${body}` },
        ],
      }),
    });
    if (!res.ok) {
      console.error("support AI call failed:", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const json = await res.json<{ content: { type: string; text?: string }[] }>();
    const text = json.content.find((b) => b.type === "text")?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<SupportAiResult>;
    if (typeof parsed.answer !== "string" || !parsed.answer.trim()) return null;
    return { answer: parsed.answer.trim(), confident: parsed.confident === true };
  } catch (err) {
    console.error("support AI call threw:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
