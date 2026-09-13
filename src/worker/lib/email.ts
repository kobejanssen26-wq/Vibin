import type { Env } from "../env";

/**
 * Transactional email. In development (no EMAIL_API_KEY) the message is written
 * to the Worker log instead of being sent — the verification/reset link is
 * printed so you can copy it. This is deliberately visible, not fake: the app
 * tells the user "check your email (or the server console in dev)".
 *
 * To enable real delivery, set EMAIL_API_KEY and implement `send` against your
 * provider (e.g. Resend, Postmark, MailChannels). The interface stays the same.
 */
export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail(env: Env, msg: OutboundEmail): Promise<void> {
  if (!env.EMAIL_API_KEY) {
    if (env.APP_ENV === "development") {
      // Dev convenience: the verification / reset link is printed to the
      // Worker console so you can copy it. Never do this in production.
      console.log(
        `\n[email:dev] To: ${msg.to}\n[email:dev] Subject: ${msg.subject}\n[email:dev] ${msg.text}\n`,
      );
    } else {
      // Production with no provider configured: do NOT log the link (it could
      // contain a reset token). Surface a warning for the operator instead.
      console.warn(
        `Email not sent to ${msg.to} ("${msg.subject}") — EMAIL_API_KEY is not set.`,
      );
    }
    return;
  }
  // Resend. A provider hiccup (outage, rate-limit, transient 5xx) must never
  // break the caller's flow — a failed verification / reset mail is recoverable
  // (the user can ask for another), a 500 on signup is not. Log and move on.
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM ?? "VIBIN <noreply@vibin.be>",
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      console.error("Email send failed:", res.status, (await res.text()).slice(0, 300));
    }
  } catch (err) {
    console.error("Email send threw:", err instanceof Error ? err.message : String(err));
  }
}

export function verifyEmailBody(url: string): OutboundEmail["text"] {
  return `Welcome to VIBIN!\n\nConfirm your email address to finish setting up your account:\n${url}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this message.`;
}

export function changeEmailVerifyBody(url: string): OutboundEmail["text"] {
  return `Confirm this is your new VIBIN email address:\n${url}\n\nThis link expires in 24 hours. If you didn't request this change, contact us — your old email can still be used to reach support.`;
}

export function resetEmailBody(url: string): OutboundEmail["text"] {
  return `Someone (hopefully you) asked to reset your VIBIN password.\n\nReset it here:\n${url}\n\nThis link expires in 1 hour. If you didn't request this, ignore this message — your password won't change.`;
}
