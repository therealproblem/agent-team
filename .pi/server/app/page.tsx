export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 md:py-24">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">
        Local artifact server
      </h1>
      <p className="mt-4 leading-7">
        Presentations live at{" "}
        <code className="bg-black/[0.06] px-1.5 py-0.5 text-[0.9em] font-mono">
          /v/&lt;YYYY-MM-DD&gt;-&lt;slug&gt;
        </code>
        , PDFs at{" "}
        <code className="bg-black/[0.06] px-1.5 py-0.5 text-[0.9em] font-mono">
          /p/&lt;YYYY-MM-DD&gt;-&lt;slug&gt;.pdf
        </code>
        . Protected indexes are available at{" "}
        <code className="bg-black/[0.06] px-1.5 py-0.5 text-[0.9em] font-mono">
          /v/list
        </code>{" "}
        and{" "}
        <code className="bg-black/[0.06] px-1.5 py-0.5 text-[0.9em] font-mono">
          /p/list
        </code>
        .
      </p>
    </main>
  );
}
