import { customAlphabet, nanoid } from "nanoid";

/** URL-safe, collision-resistant primary keys. */
export const newId = (): string => nanoid(21);

/** Human-friendly, unambiguous invite codes (no 0/O/1/I/L). */
const inviteAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const inviteGen = customAlphabet(inviteAlphabet, 6);
export const newInviteCode = (): string => inviteGen();

/** Opaque session identifier stored in KV and the session cookie. */
export const newSessionId = (): string => nanoid(32);
