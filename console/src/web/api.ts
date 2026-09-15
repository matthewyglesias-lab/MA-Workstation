import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  BrowserCacheLocation,
} from "@azure/msal-browser";
import type { Actor, Overview, RuntimeInfo } from "../shared/contracts.js";
import type { InjectionCase } from "../shared/injections.js";
let preview: typeof import("./preview.js") | undefined;
let config: RuntimeInfo;
let msal: PublicClientApplication | undefined;
let csrfToken = "";
let logoutPending: Promise<void> | undefined;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
function locked() {
  csrfToken = "";
  window.dispatchEvent(new Event("console:locked"));
}
export async function initialize() {
  if (import.meta.env.VITE_CONSOLE_PREVIEW === "true") {
    preview = await import("./preview.js");
    await preview.initializePreview();
    config = {
      mode: "preview",
      authMode: "pin",
      clinicTimezone: "America/Los_Angeles",
    };
    return config;
  }
  const response = await fetch("/api/config", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok)
    throw new ApiError(
      "The service is unavailable. Try again.",
      response.status,
    );
  config = (await response.json()) as RuntimeInfo;
  if (
    config.authMode === "entra" ||
    (config.mode === "sql" && !config.authMode)
  ) {
    msal = new PublicClientApplication({
      auth: {
        clientId: config.webClientId!,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
        redirectUri: location.origin,
      },
      cache: { cacheLocation: BrowserCacheLocation.SessionStorage },
    });
    await msal.initialize();
    const result = await msal.handleRedirectPromise();
    if (result?.account) msal.setActiveAccount(result.account);
  }
  return config;
}
export async function signIn(staffCode?: string, pin?: string) {
  if (logoutPending) await logoutPending;
  if (msal) return msal.loginRedirect({ scopes: [config.apiScope!] });
  if (preview) {
    const session = await preview.previewSignIn(staffCode || "", pin || "");
    csrfToken = session.csrfToken;
    return;
  }
  const response = await fetch("/api/auth/pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ staffCode, pin }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.message || "Sign-in failed.",
      response.status,
      result.code,
    );
  csrfToken = result.csrfToken;
}
export function signOut() {
  if (!logoutPending)
    logoutPending = performSignOut().finally(() => {
      logoutPending = undefined;
    });
  return logoutPending;
}
async function performSignOut() {
  try {
    if (preview) {
      preview.previewSignOut();
      return;
    }
    if (msal) {
      await msal.logoutRedirect({ postLogoutRedirectUri: location.origin });
      return;
    }
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok && response.status !== 401)
      throw new ApiError(
        "Sign-out could not reach the server. Close this browser window.",
        response.status,
      );
  } finally {
    locked();
  }
}
async function authorization(): Promise<Record<string, string>> {
  if (!msal) return {};
  const account = msal.getActiveAccount() || msal.getAllAccounts()[0];
  if (!account) {
    locked();
    throw new ApiError("Sign in to continue.", 401);
  }
  try {
    const result = await msal.acquireTokenSilent({
      account,
      scopes: [config.apiScope!],
    });
    return { Authorization: `Bearer ${result.accessToken}` };
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      locked();
      throw new ApiError("Sign in again to continue.", 401);
    }
    throw error;
  }
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  if (preview) {
    try {
      return await preview.previewRequest<T>(path, method, body, key);
    } catch (error) {
      if ((error as { status?: number }).status === 401) locked();
      throw error;
    }
  }
  const headers: Record<string, string> = { ...(await authorization()) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (key) headers["Idempotency-Key"] = key;
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) locked();
    throw new ApiError(
      result.message || "The request could not be confirmed.",
      response.status,
      result.code,
    );
  }
  return result as T;
}
export const getOverview = () => request<Overview>("/overview");
export const getInjections = () => request<InjectionCase[]>("/injections");
export async function getSession() {
  const result = await request<{ actor: Actor; csrfToken?: string }>(
    "/session",
  );
  csrfToken = result.csrfToken || "";
  return result;
}
