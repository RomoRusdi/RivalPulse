export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/backend";
export const DEMO_MODE = process.env.NEXT_PUBLIC_AUTH_MODE === "demo" || process.env.NEXT_PUBLIC_USE_MOCKS === "true";

export class ApiError extends Error {
  constructor(message: string, readonly cause?: unknown, readonly status?: number, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

let identityGeneration = 0;
const pendingRequests = new Set<AbortController>();
const TAB_KEY = "rivalpulse.tab-session.v1";
export function sessionHeaders(): Headers {
  const headers = new Headers();
  if (typeof window !== "undefined") {
    try { const token = window.sessionStorage.getItem(TAB_KEY); if (token) headers.set("X-Tab-Session", token); } catch { /* Missing storage cannot grant temporary access. */ }
  }
  return headers;
}
export function saveLoginSession(payload: unknown) {
  const value = payload as { remembered?: boolean; tabToken?: string | null };
  try {
    if (value.tabToken) window.sessionStorage.setItem(TAB_KEY, value.tabToken);
    else window.sessionStorage.removeItem(TAB_KEY);
  } catch {
    if (!value.remembered) throw new ApiError("Temporary login needs browser session storage. Enable it or choose Keep me signed in.");
  }
}
export function clearTabSession() { try { window.sessionStorage.removeItem(TAB_KEY); } catch { /* Already unavailable. */ } }
export function trackAccountStream(controller: AbortController) { pendingRequests.add(controller); return () => pendingRequests.delete(controller); }
/** Changes on every sign-in, sign-out or account switch; tab caches key on it. */
export function accountGeneration() { return identityGeneration; }
export function cancelAccountRequests() {
  identityGeneration += 1;
  for (const controller of pendingRequests) controller.abort();
  pendingRequests.clear();
}

export function sessionExpired() {
  cancelAccountRequests();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("rivalpulse:session-expired"));
}

export async function apiRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const generation = identityGeneration;
  const headers = new Headers(init.headers);
  sessionHeaders().forEach((value, key) => headers.set(key, value));
  headers.set("Content-Type", "application/json");
  if (!DEMO_MODE && !["GET", "HEAD", "OPTIONS"].includes(init.method ?? "GET")) {
    const csrf = await apiRequest("/api/v1/auth/csrf") as { token: string };
    headers.set("X-CSRF-Token", csrf.token);
  }
  if (generation !== identityGeneration) throw new ApiError("Your session changed. Please log in again.");
  const controller = new AbortController();
  pendingRequests.add(controller);
  const abort = () => controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  if (init.signal?.aborted) abort();
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "include", cache: "no-store", signal: controller.signal });
    const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (generation !== identityGeneration) throw new ApiError("Your session changed. Please log in again.");
    if (!response.ok) {
      if (response.status === 401 && path !== "/api/v1/auth/login") sessionExpired();
      throw new ApiError(publicErrorMessage(payload?.code, payload?.message, response.status), undefined, response.status, payload?.code);
    }
    return payload;
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw new ApiError("Unable to connect to RivalPulse. Check your connection and try again.", cause);
  } finally {
    pendingRequests.delete(controller);
    init.signal?.removeEventListener("abort", abort);
  }
}

function publicErrorMessage(code: unknown, message: unknown, status: number): string {
  const expected = new Set(["VERIFICATION_INVALID", "VERIFICATION_COOLDOWN", "VERIFICATION_UNAVAILABLE", "INVALID_CREDENTIALS", "INVALID_PASSWORD", "REGISTRATION_DISABLED", "REGISTRATION_FAILED", "RATE_LIMITED", "UNAUTHORIZED", "CSRF_REJECTED", "CONVERSATION_STALE", "CONVERSATION_CONFLICT", "LLM_KEY_STORAGE_UNAVAILABLE", "LLM_CLOUD_CONSENT_REQUIRED", "LLM_KEY_REQUIRED", "LLM_KEY_NOT_REQUIRED", "LLM_KEY_REJECTED", "LLM_UNAVAILABLE"]);
  if (typeof code === "string" && expected.has(code) && typeof message === "string") return message;
  if (code === "WATCHLIST_REQUIRED") return "Add companies to your watchlist before starting research.";
  if (code === "UNKNOWN_COMPANY") return "One or more companies are unavailable. Choose a company from the watchlist search.";
  if (code === "CATALOG_NOT_READY" || code === "ACCESS_NOT_CONFIGURED" || code === "ACCOUNTS_DISABLED") return "Workspace access is temporarily unavailable. Contact your administrator.";
  if (code === "PROVIDER_CREDENTIALS_MISSING") return "Connect your Sectors API key in Settings → Sectors data connection to run research. Chat and saved findings still work.";
  if (code === "PROVIDER_AUTH_FAILED") return "Sectors rejected the saved API key. Replace it in Settings → Sectors data connection.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status === 422) return "Check the information you entered and try again.";
  if (status === 403) return "This action isn’t available for your account. Refresh the page or contact your administrator.";
  if (status === 404) return "This information isn’t available in your workspace.";
  if (status === 409) return "Another update is in progress. Refresh the page and try again.";
  return "RivalPulse is temporarily unable to complete this request. Try again in a moment.";
}

export function loginDestination(): string {
  const value = new URLSearchParams(window.location.search).get("returnTo");
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/";
  const url = new URL(value, window.location.origin);
  if (url.origin !== window.location.origin || ["/login", "/signup"].includes(url.pathname)) return "/";
  return url.pathname + url.search + url.hash;
}

export function broadcastAuthChange() {
  try { window.localStorage.setItem("rivalpulse.auth.changed", crypto.randomUUID()); } catch { /* Storage is optional. */ }
}
