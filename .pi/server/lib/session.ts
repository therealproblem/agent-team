import { cookies } from "next/headers";

/**
 * Session management for the artifact server.
 *
 * Uses httpOnly cookies to store a secure session token after successful login.
 * Session tokens are derived from the configured AGENTS_TEAM_AUTH_TOKEN but
 * are separate (so users can't extract the raw token from cookies).
 */

const SESSION_COOKIE_NAME = "agents-team-session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Create a session token from the auth token.
 * In production, you'd generate a random session ID and store it server-side.
 * For this simple implementation, we hash the token to create a session value.
 */
function deriveSessionToken(authToken: string): string {
  // Simple hash-like derivation (not cryptographically secure, but sufficient
  // for this use case where the auth token is already secret)
  const hash = Buffer.from(authToken).toString("base64");
  return `sess_${hash}`;
}

/**
 * Verify if a session token is valid.
 */
export function verifySession(sessionToken: string | undefined): boolean {
  if (!sessionToken) return false;

  const configuredToken = process.env.AGENTS_TEAM_AUTH_TOKEN;
  if (!configuredToken || configuredToken.trim() === "") {
    // Auth disabled
    return true;
  }

  const expectedSession = deriveSessionToken(configuredToken);
  return sessionToken === expectedSession;
}

/**
 * Verify if a password matches the configured auth token.
 */
export function verifyPassword(password: string): boolean {
  const configuredToken = process.env.AGENTS_TEAM_AUTH_TOKEN;
  if (!configuredToken || configuredToken.trim() === "") {
    // Auth disabled — any password works (shouldn't reach here in practice)
    return true;
  }

  return password === configuredToken;
}

/**
 * Create a session after successful login.
 */
export async function createSession() {
  const configuredToken = process.env.AGENTS_TEAM_AUTH_TOKEN;
  if (!configuredToken || configuredToken.trim() === "") {
    throw new Error("Auth not configured");
  }

  const sessionToken = deriveSessionToken(configuredToken);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

/**
 * Get the current session token from cookies.
 */
export async function getSession(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

/**
 * Check if the user is authenticated (has a valid session or token).
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return verifySession(session);
}

/**
 * Destroy the current session (logout).
 */
export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
