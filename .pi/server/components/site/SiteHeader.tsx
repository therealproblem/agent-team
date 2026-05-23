import Link from "next/link";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { LogoutButton } from "@/components/site/LogoutButton";
import { cookies } from "next/headers";

const SITE_TITLE = process.env.AGENTS_TEAM_SERVER_TITLE ?? "agents-team";

async function isAuthEnabled(): Promise<boolean> {
  const token = process.env.AGENTS_TEAM_AUTH_TOKEN;
  return !!(token && token.trim() !== "");
}

async function isLoggedIn(): Promise<boolean> {
  if (!(await isAuthEnabled())) return true;
  
  const cookieStore = await cookies();
  const session = cookieStore.get("agents-team-session")?.value;
  return !!session;
}

export async function SiteHeader() {
  const authEnabled = await isAuthEnabled();
  const loggedIn = await isLoggedIn();
  
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background">
      <div className="flex h-12 items-center justify-between gap-2 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {/* Portal slot for per-page mobile menu (e.g. DocLayout TOC sheet).
              Empty on pages that don't render into it. */}
          <div id="site-header-mobile-slot" className="flex lg:hidden" />
          <Link
            href="/"
            className="font-serif text-base font-semibold tracking-tight text-foreground truncate"
            data-no-style
          >
            <b>{SITE_TITLE}</b>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {authEnabled && loggedIn && <LogoutButton />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
