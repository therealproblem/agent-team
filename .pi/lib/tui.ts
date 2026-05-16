/**
 * tui — shared TUI primitives for in-repo Pi extensions.
 *
 * `reminders`, `server`, and `news-ingest` all surface ambient status
 * messages with the same colored-box treatment: drop Pi's default
 * `[customType]` label, render the content inside a `customMessageBg`
 * box. They also share the same fire-and-forget `sendMessage` helper.
 * Both live here so new extensions can pick them up in two lines.
 *
 * Keep this module tiny — primitives only. Extension-specific logic
 * stays in the extension.
 */

import type {
	ExtensionAPI,
	MessageRenderer,
} from "@earendil-works/pi-coding-agent";
import { Box, Container, Spacer, Text } from "@earendil-works/pi-tui";

/**
 * MessageRenderer that wraps the message content in a colored box and
 * drops the `[customType]` label. Equivalent to the per-extension
 * renderers that lived in reminders/server/news-ingest before.
 */
export function createBoxRenderer(): MessageRenderer {
	return (message, _options, theme) => {
		const container = new Container();
		container.addChild(new Spacer(1));
		const box = new Box(1, 1, (t: string) => theme.bg("customMessageBg", t));
		const text =
			typeof message.content === "string"
				? message.content
				: message.content
						.filter(
							(c): c is { type: "text"; text: string } => c.type === "text",
						)
						.map((c) => c.text)
						.join("\n");
		box.addChild(new Text(theme.fg("customMessageText", text), 0, 0));
		container.addChild(box);
		return container;
	};
}

/**
 * Surface a status message in the TUI without spending an agent turn.
 * Pairs with `createBoxRenderer` — `customType` must match the key the
 * extension registered with `pi.registerMessageRenderer`.
 */
export function surface(
	pi: ExtensionAPI,
	customType: string,
	text: string,
	details?: object,
): void {
	pi.sendMessage(
		{
			customType,
			content: text,
			display: true,
			details,
		},
		{ triggerTurn: false },
	);
}
