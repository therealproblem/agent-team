import Link from "next/link";
import { ThemeToggle } from "@/components/site/ThemeToggle";

const SITE_TITLE = process.env.AGENTS_TEAM_SERVER_TITLE ?? "agents-team";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background">
      <div className="flex h-12 items-center justify-between px-4 md:px-6">
        <Link
          href="/"
          className="font-serif text-base font-semibold tracking-tight text-foreground"
          data-no-style
        >
          <b>{SITE_TITLE}</b>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
