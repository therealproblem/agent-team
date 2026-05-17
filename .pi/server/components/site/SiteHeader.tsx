import Link from "next/link";
import { ThemeToggle } from "@/components/site/ThemeToggle";

const SITE_TITLE = process.env.AGENTS_TEAM_SERVER_TITLE ?? "agents-team";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background">
      <div className="flex h-12 items-center justify-between gap-2 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {/* Portal slot for per-page mobile menu (e.g. DocLayout TOC sheet).
              Empty on pages that don't render into it. */}
          <div id="site-header-mobile-slot" className="flex md:hidden" />
          <Link
            href="/"
            className="font-serif text-base font-semibold tracking-tight text-foreground truncate"
            data-no-style
          >
            <b>{SITE_TITLE}</b>
          </Link>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
