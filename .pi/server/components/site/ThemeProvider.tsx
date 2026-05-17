"use client";

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

/*
 * Thin re-export so we can mount `<ThemeProvider>` from the RSC root layout
 * without making layout.tsx itself a client component. next-themes attaches
 * `class="dark"` (or removes it) on the <html> element; `.dark` selectors in
 * globals.css then redefine every brand/shadcn token.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
