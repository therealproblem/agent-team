import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import "../styles/globals.css";

const SITE_TITLE = process.env.AGENTS_TEAM_SERVER_TITLE ?? "agents-team";

export const metadata: Metadata = {
  title: { default: SITE_TITLE, template: `%s · ${SITE_TITLE}` },
  description: "",
  robots: { index: false, follow: false },
};

const navbar = <Navbar logo={<b>{SITE_TITLE}</b>} />;
const footer = <Footer>—</Footer>;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pageMap = await getPageMap();
  return (
    <html lang="en" suppressHydrationWarning>
      <Head />
      <body>
        {/*
         * CSS-only mobile TOC drawer (hamburger menu).
         * On mobile (< md), the TOC element is positioned off-screen and
         * slides in when the checkbox below is toggled via its labels.
         * The hamburger label is fixed top-left; the backdrop covers the
         * page so tapping outside the drawer closes it.
         */}
        <input type="checkbox" id="toc-toggle" className="toc-toggle-input" />
        <label
          htmlFor="toc-toggle"
          className="toc-toggle-label"
          aria-label="Toggle table of contents"
        >
          <span aria-hidden="true">≡</span>
        </label>
        <label
          htmlFor="toc-toggle"
          className="toc-toggle-backdrop"
          aria-hidden="true"
        ></label>
        <Layout
          navbar={navbar}
          footer={footer}
          pageMap={pageMap}
          darkMode={false}
          nextThemes={{ forcedTheme: "light", defaultTheme: "light" }}
          sidebar={{ defaultOpen: false, toggleButton: false }}
          editLink={null}
          feedback={{ content: null }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
