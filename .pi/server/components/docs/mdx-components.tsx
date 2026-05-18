import type { ComponentProps, ReactNode } from "react";
import { Mermaid } from "@/components/docs/Mermaid";
import { D2 } from "@/components/docs/D2";
import { Separator } from "@/components/ui/separator";
import {
  Table as KitTable,
  TableBody as KitTableBody,
  TableCell as KitTableCell,
  TableHead as KitTableHead,
  TableHeader as KitTableHeader,
  TableRow as KitTableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/*
 * Element overrides for MDX rendered into DocLayout. Tailwind classes only —
 * no inline styles. Headings get an anchor-on-hover affordance using the
 * id rehype-slug attaches.
 */

function HeadingAnchor({ id }: { id?: string }) {
  if (!id) return null;
  return (
    <a
      href={`#${id}`}
      aria-label="Anchor link"
      className="ml-2 text-muted-foreground/0 transition-colors hover:text-primary group-hover:text-muted-foreground"
    >
      #
    </a>
  );
}

function H1({ children, id, className, ...rest }: ComponentProps<"h1">) {
  return (
    <h1
      id={id}
      className={cn(
        "group mt-0 mb-6 font-serif text-4xl font-semibold tracking-tight",
        className,
      )}
      {...rest}
    >
      {children}
      <HeadingAnchor id={id} />
    </h1>
  );
}

function H2({ children, id, className, ...rest }: ComponentProps<"h2">) {
  return (
    <h2
      id={id}
      className={cn(
        "group mt-12 mb-3 font-serif text-2xl font-semibold tracking-tight",
        className,
      )}
      {...rest}
    >
      {children}
      <HeadingAnchor id={id} />
    </h2>
  );
}

function H3({ children, id, className, ...rest }: ComponentProps<"h3">) {
  return (
    <h3
      id={id}
      className={cn(
        "group mt-8 mb-2 font-serif text-xl font-semibold tracking-tight",
        className,
      )}
      {...rest}
    >
      {children}
      <HeadingAnchor id={id} />
    </h3>
  );
}

function H4({ children, id, className, ...rest }: ComponentProps<"h4">) {
  return (
    <h4
      id={id}
      className={cn(
        "group mt-6 mb-2 font-serif text-lg font-semibold",
        className,
      )}
      {...rest}
    >
      {children}
      <HeadingAnchor id={id} />
    </h4>
  );
}

function H5({ children, id, className, ...rest }: ComponentProps<"h5">) {
  return (
    <h5
      id={id}
      className={cn("group mt-6 mb-2 font-serif text-base font-semibold", className)}
      {...rest}
    >
      {children}
      <HeadingAnchor id={id} />
    </h5>
  );
}

function H6({ children, id, className, ...rest }: ComponentProps<"h6">) {
  return (
    <h6
      id={id}
      className={cn(
        "group mt-6 mb-2 font-serif text-sm font-semibold uppercase tracking-wider",
        className,
      )}
      {...rest}
    >
      {children}
      <HeadingAnchor id={id} />
    </h6>
  );
}

function P({ className, ...rest }: ComponentProps<"p">) {
  return <p className={cn("my-4 leading-7", className)} {...rest} />;
}

function A({ className, ...rest }: ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "text-primary underline-offset-4 hover:underline",
        className,
      )}
      {...rest}
    />
  );
}

function Ul({ className, ...rest }: ComponentProps<"ul">) {
  return <ul className={cn("my-4 ml-6 list-disc space-y-2", className)} {...rest} />;
}

function Ol({ className, ...rest }: ComponentProps<"ol">) {
  return <ol className={cn("my-4 ml-6 list-decimal space-y-2", className)} {...rest} />;
}

function Li({ className, ...rest }: ComponentProps<"li">) {
  return <li className={cn("leading-7", className)} {...rest} />;
}

function Hr(_props: ComponentProps<"hr">) {
  // Use the kit's Separator so vault renders share the same rule treatment
  // as the rest of the app (proper role="separator" semantics, theme-aware).
  return <Separator className="my-10 bg-border" />;
}

function Blockquote({ className, ...rest }: ComponentProps<"blockquote">) {
  return (
    <blockquote
      className={cn(
        "my-6 border-l-4 border-primary bg-muted px-4 py-2 italic",
        className,
      )}
      {...rest}
    />
  );
}

function Pre({ className, children, ...rest }: ComponentProps<"pre">) {
  return (
    <pre
      className={cn(
        "my-4 overflow-x-auto border border-border bg-muted p-4 text-sm leading-relaxed",
        className,
      )}
      {...rest}
    >
      {children}
    </pre>
  );
}

function InlineCode({ className, ...rest }: ComponentProps<"code">) {
  const isBlock =
    "data-language" in rest ||
    (typeof className === "string" && className.includes("language-"));

  if (isBlock) {
    return <code className={cn("font-mono", className)} {...rest} />;
  }

  return (
    <code
      className={cn(
        "bg-black/[0.06] px-1.5 py-0.5 text-[0.9em] font-mono",
        className,
      )}
      {...rest}
    />
  );
}

/*
 * Tables now use the shadcn kit's Table primitives directly so vault
 * renders and /components share the same row-hover behaviour, padding
 * scale, and border treatment. Delphi-flavoured className overrides
 * (Burnt Umber header bg, uppercase caption-style head text, editorial
 * cell padding) match the /components gallery's Table demo.
 */
function Table({ className, ...rest }: ComponentProps<"table">) {
  return (
    <div className="my-6 rounded-[16px] bg-card border border-border overflow-hidden">
      <KitTable className={cn("w-full", className)} {...rest} />
    </div>
  );
}

function Thead({ className, ...rest }: ComponentProps<"thead">) {
  return (
    <KitTableHeader
      className={cn("bg-primary [&_tr]:border-0", className)}
      {...rest}
    />
  );
}

function Tbody({ className, ...rest }: ComponentProps<"tbody">) {
  return <KitTableBody className={className} {...rest} />;
}

function Tr({ className, ...rest }: ComponentProps<"tr">) {
  return (
    <KitTableRow
      className={cn("border-border hover:bg-cloud-fog/40 transition-colors", className)}
      {...rest}
    />
  );
}

function Th({ className, ...rest }: ComponentProps<"th">) {
  return (
    <KitTableHead
      className={cn(
        "h-auto px-5 py-4 text-left font-medium uppercase tracking-[0.1em] text-[10px] text-primary-foreground whitespace-normal",
        className,
      )}
      {...rest}
    />
  );
}

function Td({ className, ...rest }: ComponentProps<"td">) {
  return (
    <KitTableCell
      className={cn(
        "px-5 py-4 align-top text-[15px] leading-[1.4] text-foreground whitespace-normal",
        className,
      )}
      {...rest}
    />
  );
}

function Img({ className, alt, ...rest }: ComponentProps<"img">) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt ?? ""}
      className={cn("my-6 max-w-full border border-border", className)}
      {...rest}
    />
  );
}

export const mdxComponents = {
  h1: H1,
  h2: H2,
  h3: H3,
  h4: H4,
  h5: H5,
  h6: H6,
  p: P,
  a: A,
  ul: Ul,
  ol: Ol,
  li: Li,
  hr: Hr,
  blockquote: Blockquote,
  pre: Pre,
  code: InlineCode,
  table: Table,
  thead: Thead,
  tbody: Tbody,
  tr: Tr,
  th: Th,
  td: Td,
  img: Img,
  Mermaid,
  D2,
} as const;

export type MdxComponents = typeof mdxComponents;
