import type { Context } from "hono";
import { z } from "zod";
import { badRequest } from "./errors";
import { LIMITS } from "@shared/constants";

export async function parseBody<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("Expected a JSON body.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw badRequest("Some fields are invalid.", result.error.flatten());
  }
  return result.data;
}

export function parseQuery<T extends z.ZodTypeAny>(c: Context, schema: T): z.infer<T> {
  const result = schema.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!result.success) {
    throw badRequest("Invalid query parameters.", result.error.flatten());
  }
  return result.data;
}

/* --- reusable field schemas --- */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("That doesn't look like an email address.")
  .max(254);

export const passwordSchema = z
  .string()
  .min(LIMITS.password.min, `Use at least ${LIMITS.password.min} characters.`)
  .max(LIMITS.password.max);

export const displayNameSchema = z
  .string()
  .trim()
  .min(LIMITS.displayName.min)
  .max(LIMITS.displayName.max);

export const groupNameSchema = z
  .string()
  .trim()
  .min(LIMITS.groupName.min)
  .max(LIMITS.groupName.max);
