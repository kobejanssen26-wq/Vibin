import { CSRF_COOKIE, CSRF_HEADER } from "@shared/constants";
import type { ApiError } from "@shared/types";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

function csrfToken(): string {
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`),
  );
  return m ? decodeURIComponent(m[1]!) : "";
}

type Options = Omit<RequestInit, "body"> & { body?: unknown };

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const method = (opts.method ?? "GET").toUpperCase();
  const headers = new Headers(opts.headers);
  let body: BodyInit | undefined;

  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opts.body);
  }
  if (method !== "GET" && method !== "HEAD") {
    headers.set(CSRF_HEADER, csrfToken());
  }

  const res = await fetch(`/api${path}`, {
    ...opts,
    method,
    headers,
    body,
    credentials: "same-origin",
  });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const err = (isJson ? payload : { message: payload }) as ApiError;
    throw new ApiRequestError(
      res.status,
      err.error ?? "error",
      err.message ?? "Something went wrong.",
      err.details,
    );
  }
  return payload as T;
}
