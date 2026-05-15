// Bare 404 — Nextra's default would render a sidebar listing top-level routes,
// which defeats URL-secrecy.
export default function NotFound() {
  return (
    <main style={{ padding: "4rem 2rem", textAlign: "center" }}>
      <h1>404</h1>
    </main>
  );
}
