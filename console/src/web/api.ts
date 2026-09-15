import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  BrowserCacheLocation,
} from "@azure/msal-browser";
import type { Actor, Overview, RuntimeInfo } from "../shared/contracts.js";
let config: RuntimeInfo;
let msal: PublicClientApplication | undefined;
export async function initialize() {
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) throw new Error("The console service is unavailable.");
  config = (await response.json()) as RuntimeInfo;
  if (config.mode === "sql") {
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
export async function signIn() {
  await msal?.loginRedirect({ scopes: [config.apiScope!] });
}
export async function signOut() {
  await msal?.logoutRedirect({ postLogoutRedirectUri: location.origin });
}
async function authorization(): Promise<Record<string, string>> {
  if (!msal) return {};
  const account = msal.getActiveAccount() || msal.getAllAccounts()[0];
  if (!account)
    throw new Error("Sign in with your clinic Microsoft account to continue.");
  try {
    const result = await msal.acquireTokenSilent({
      account,
      scopes: [config.apiScope!],
    });
    return { Authorization: `Bearer ${result.accessToken}` };
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError)
      throw new Error(
        "Your session needs attention. Sign in again to continue.",
      );
    throw error;
  }
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  const headers: Record<string, string> = { ...(await authorization()) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (key) headers["Idempotency-Key"] = key;
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.message || "The request could not be confirmed.");
  return result as T;
}
export const getOverview = () => request<Overview>("/overview");
export const getSession = () => request<{ actor: Actor }>("/session");
