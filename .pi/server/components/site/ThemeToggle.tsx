"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/*
 * Two-state toggle (light ↔ dark). Hydrates after mount to avoid a flash
 * of mismatched icon between SSR and client. The actual class swap on
 * <html> is owned by next-themes.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted ? resolvedTheme === "dark" : false;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="size-9 rounded-[10px] text-deep-cognac hover:bg-cloud-fog shadow-none"
    >
      {mounted ? (
        isDark ? <Sun className="size-4" strokeWidth={1.75} /> : <Moon className="size-4" strokeWidth={1.75} />
      ) : (
        // SSR placeholder keeps layout stable.
        <span className="size-4 inline-block" aria-hidden />
      )}
    </Button>
  );
}
