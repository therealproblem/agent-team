import { generateStaticParamsFor, importPage } from "nextra/pages";
import { useMDXComponents as getMDXComponents } from "../../mdx-components";

export const generateStaticParams = generateStaticParamsFor("mdxPath");

interface PageProps {
  params: Promise<{ mdxPath?: string[] }>;
}

export async function generateMetadata(props: PageProps) {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath ?? []);
  // Root page: bare site title, no `Index · …` template suffix.
  if (!params.mdxPath || params.mdxPath.length === 0) {
    const siteTitle = process.env.AGENTS_TEAM_SERVER_TITLE ?? "agents-team";
    return { ...metadata, title: { absolute: siteTitle } };
  }
  return metadata;
}

const Wrapper = getMDXComponents({}).wrapper;

export default async function Page(props: PageProps) {
  const params = await props.params;
  // importPage calls notFound() internally on miss — Next routes that to
  // app/not-found.tsx, which is a bare 404 (no sidebar enumeration).
  const result = await importPage(params.mdxPath ?? []);
  const { default: MDXContent, toc, metadata } = result;
  return Wrapper ? (
    <Wrapper toc={toc} metadata={metadata}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  ) : (
    <MDXContent {...props} params={params} />
  );
}
