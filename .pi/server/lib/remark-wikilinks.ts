import { visit } from "unist-util-visit";

/**
 * Convert Obsidian-style `[[target|display]]` wiki-links in card bodies
 * into proper markdown links so the board UI doesn't show the raw markup.
 *
 * Targets we resolve to a clickable URL:
 *   - `projects/<project>/board/<card>(.md)?` → `/projects/<project>?card=<card>`
 *   - `projects/<project>(.md)?`              → `/projects/<project>`
 *
 * For unresolved targets we still strip the `[[…]]` markup and emit the
 * display text (or the raw target) as plain text, so the user never sees
 * the surrounding brackets. We deliberately don't try to chase arbitrary
 * vault paths into `/v/<slug>` — that requires knowing what's been
 * rendered, which we don't.
 *
 * Operates on the MDAST: visits each `text` node, finds wiki-link
 * occurrences, and splices in `link` siblings around the surviving text
 * fragments. Code nodes are a different node type and so are untouched —
 * wiki-link syntax inside backticks stays literal.
 */
export function remarkWikilinks() {
	return (tree: unknown) => {
		const RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

		visit(
			tree as never,
			"text",
			(node: { value: string }, index: number | null, parent: { children: unknown[] } | null) => {
				if (index == null || !parent) return;
				const value = node.value;
				if (!value.includes("[[")) return;

				const newChildren: unknown[] = [];
				let lastEnd = 0;
				let match: RegExpExecArray | null;

				RE.lastIndex = 0;
				while ((match = RE.exec(value)) != null) {
					const [full, target, display] = match;
					const start = match.index;
					const end = start + full.length;

					if (start > lastEnd) {
						newChildren.push({ type: "text", value: value.slice(lastEnd, start) });
					}

					const url = resolveWikiTarget(target.trim());
					const text = (display ?? target).trim();

					if (url) {
						newChildren.push({
							type: "link",
							url,
							children: [{ type: "text", value: text }],
						});
					} else {
						newChildren.push({ type: "text", value: text });
					}
					lastEnd = end;
				}

				if (lastEnd === 0) return;

				if (lastEnd < value.length) {
					newChildren.push({ type: "text", value: value.slice(lastEnd) });
				}

				parent.children.splice(index, 1, ...newChildren);
				// Tell `visit` to skip the nodes we just spliced in (they're
				// already the form we want, no further processing needed).
				return index + newChildren.length;
			},
		);
	};
}

function resolveWikiTarget(target: string): string | null {
	const t = target.replace(/\.md$/i, "");
	const cardMatch = t.match(/^projects\/([^/]+)\/board\/([^/]+)$/);
	if (cardMatch) {
		const [, project, card] = cardMatch;
		return `/projects/${encodeURIComponent(project)}?card=${encodeURIComponent(card)}`;
	}
	const projMatch = t.match(/^projects\/([^/]+)$/);
	if (projMatch) {
		const [, project] = projMatch;
		return `/projects/${encodeURIComponent(project)}`;
	}
	return null;
}
