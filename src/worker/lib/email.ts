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
    console.log(
      `\n[email:dev] To: ${msg.to}\n[email:dev] Subject: ${msg.subject}\n[email:dev] ${msg.text}\n`,
    );
    return;
  }
  // Example: Resend. Replace with your provider of choice.
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? "Mingo <hello@mingo.app>",
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    }),
  });
  if (!res.ok) {
    console.error("Email send failed:", res.status, await res.text());
    throw new Error("email_send_failed");
  }
}

export function verifyEmailBody(url: string): OutboundEmail["text"] {
  return `Welcome to Mingo!\n\nConfirm your email address to finish setting up your account:\n${url}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this message.`;
}

export function resetEmailBody(url: string): OutboundEmail["text"] {
  return `Someone (hopefully you) asked to reset your Mingo password.\n\nReset it here:\n${url}\n\nThis link expires in 1 hour. If you didn't request this, ignore this message — your password won't change.`;
}
