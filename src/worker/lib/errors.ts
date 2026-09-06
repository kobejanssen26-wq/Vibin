import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * Typed application error. Routes throw these; the global error handler in
 * index.ts turns them into a consistent JSON body: { error, message, details }.
 * Raw exceptions are never surfaced to the client.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, "bad_request", msg, details);
export const unauthorized = (msg = "You need to sign in.") =>
  new AppError(401, "unauthorized", msg);
export const forbidden = (msg = "You don't have access to this.") =>
  new AppError(403, "forbidden", msg);
export const notFound = (msg = "Not found.") =>
  new AppError(404, "not_found", msg);
export const conflict = (msg: string, details?: unknown) =>
  new AppError(409, "conflict", msg, details);
export const tooMany = (msg = "Too many requests. Slow down a little.") =>
  new AppError(429, "rate_limited", msg);

export function toResponse(err: unknown, c: Context) {
  if (err instanceof AppError) {
    return c.json(
      { error: err.code, message: err.message, details: err.details },
      err.status as never,
    );
  }
  if (err instanceof HTTPException) {
    return c.json(
      { error: "http_error", message: err.message },
      err.status as never,
    );
  }
  console.error("Unhandled error:", err);
  return c.json(
    { error: "internal", message: "Something went wrong on our side." },
    500,
  );
}
