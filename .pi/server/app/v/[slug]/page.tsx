import { notFound } from "next/navigation";
import { compileMdxFile } from "@/lib/mdx";
import { DocLayout } from "@/components/docs/DocLayout";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  // Prefer the frontmatter title for the browser tab; fall back to the slug
  // so URLs without frontmatter still get a sensible tab label.
  const compiled = await compileMdxFile(slug);
  const title = typeof compiled?.frontmatter?.title === "string"
    ? compiled.frontmatter.title
    : slug;
  return { title };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const compiled = await compileMdxFile(slug);
  if (!compiled) notFound();
  return (
    <DocLayout toc={compiled.toc} frontmatter={compiled.frontmatter}>
      {compiled.content}
    </DocLayout>
  );
}
