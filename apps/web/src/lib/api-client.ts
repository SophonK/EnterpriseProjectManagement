// Typed fetch wrapper for the @epm/api backend.
//
// Auth is a cookie-based session (httpOnly epm_access/epm_refresh set by /auth/callback),
// so the browser cannot read the token — every request just sends `credentials: "include"`
// and the cookie rides along (same-origin via the Vite proxy in dev). A 401 anywhere means
// the session is missing/expired: we broadcast `epm:unauthorized` so the auth layer can
// bounce to the login screen. Errors are RFC 7807 problem+json.

/** RFC 7807 problem detail as produced by the backend ProblemDetailsFilter. */
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  requestId?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetail;
  constructor(problem: ProblemDetail) {
    super(problem.detail ?? problem.title ?? `HTTP ${problem.status}`);
    this.name = "ApiError";
    this.status = problem.status;
    this.problem = problem;
  }
}

export const UNAUTHORIZED_EVENT = "epm:unauthorized";

async function toProblem(res: Response): Promise<ProblemDetail> {
  try {
    const body = (await res.json()) as ProblemDetail;
    if (body && typeof body.status === "number") return body;
    return { type: "about:blank", title: res.statusText, status: res.status, detail: JSON.stringify(body) };
  } catch {
    return { type: "about:blank", title: res.statusText, status: res.status };
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(await toProblem(res));
  }
  if (!res.ok) throw new ApiError(await toProblem(res));

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
