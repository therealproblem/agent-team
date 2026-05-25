import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Authentication middleware for the artifact server.
 *
 * Problem: The server treats URL possession as access control for published
 * artifacts (`/v/*` and `/p/*`), which should remain true, but app pages
 * (board, projects, news, etc.) should not be publicly accessible when
 * `AGENTS_TEAM_SERVER_PUBLIC_URL` is set (i.e., server is exposed beyond
 * localhost).
 *
 * Solution:
 *  - Browser users: Redirect to `/login` if not authenticated (via session cookie)
 *  - API/programmatic access: Support bearer token via header or query param
 *  - Public routes (`/v/*`, `/p/*`) remain accessible to everyone
 *
 * Configuration:
 *  - Set `AGENTS_TEAM_AUTH_TOKEN` in `.env` to enable auth.
 *  - If unset or empty, auth is DISABLED (local dev default).
 *  - Users can log in via `/login` (sets session cookie) OR use token directly
 *    via `Authorization: Bearer <token>` header or `auth=<token>` query param.
 *
 * When auth fails:
 *  - Browser requests (Accept: text/html): Redirect to `/login?redirectTo=<path>`
 *  - API requests: Return 401 JSON response
 */

const PROTECTED_ARTIFACT_INDEX_PATHS = ["/v/list", "/p/list"];
const PUBLIC_PREFIXES = ["/v/", "/p/"];
const FRAMEWORK_PREFIXES = ["/_next/"];

// Auth-related paths that should always be accessible
const AUTH_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/logout"]);

// Static assets that published `/v` and `/p` pages need to render correctly.
// These are small and don't expose sensitive data — only allow what's required.
const ALLOWED_STATIC_PATHS = new Set([
  "/favicon.ico",
  // Add any other required static assets here as needed
]);

const SESSION_COOKIE_NAME = "agents-team-session";

/**
 * Derive the expected session token from the auth token.
 * Must match the logic in lib/session.ts.
 */
function deriveSessionToken(authToken: string): string {
  const hash = Buffer.from(authToken).toString("base64");
  return `sess_${hash}`;
}

/**
 * Check if the request is from a browser (prefers HTML).
 */
function isBrowserRequest(request: NextRequest): boolean {
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function isProtectedArtifactIndexPath(pathname: string): boolean {
  return PROTECTED_ARTIFACT_INDEX_PATHS.some(
    (protectedPath) => pathname === protectedPath || pathname === `${protectedPath}/`,
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Public artifact routes — always allow, except protected index pages.
  if (
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) &&
    !isProtectedArtifactIndexPath(pathname)
  ) {
    return NextResponse.next();
  }

  // 2. Framework assets (JS/CSS bundles for `/v` and `/p` pages) — always allow
  if (FRAMEWORK_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // 3. Explicitly allowed static assets — always allow
  if (ALLOWED_STATIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // 4. Auth-related paths — always allow (login page, login/logout endpoints)
  if (AUTH_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // 5. Check if auth is enabled
  const configuredToken = process.env.AGENTS_TEAM_AUTH_TOKEN;
  if (!configuredToken || configuredToken.trim() === "") {
    // Auth disabled — allow everything (local dev default)
    return NextResponse.next();
  }

  // 6. Check for valid session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const expectedSession = deriveSessionToken(configuredToken);
  
  if (sessionCookie === expectedSession) {
    return NextResponse.next();
  }

  // 7. Check for bearer token (header OR query param) for API/programmatic access
  const authHeader = request.headers.get("authorization");
  const headerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  const queryToken = request.nextUrl.searchParams.get("auth");
  const providedToken = headerToken ?? queryToken;

  if (providedToken === configuredToken) {
    return NextResponse.next();
  }

  // 8. Auth failed
  if (isBrowserRequest(request)) {
    // Browser request — redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  } else {
    // API request — return 401 JSON
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Bearer realm="agents-team"',
        },
      }
    );
  }
}

// Only run middleware on paths that aren't already public.
// This config is an optimization — the logic above handles the actual checks.
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /v/* (HTML renders), except /v/list
     * - /p/* (PDF exports), except /p/list
     * - /_next/static (static files)
     * - /_next/image (image optimization)
     * - /favicon.ico, /robots.txt, etc.
     *
     * The actual auth logic is in the middleware function above — this matcher
     * is just a performance hint to Next.js to skip middleware for paths we
     * know are public.
     */
    "/v/list/:path*",
    "/p/list/:path*",
    "/((?!v/|p/|_next/static|_next/image|favicon.ico).*)",
  ],
};
