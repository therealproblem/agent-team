export const HEALTH_PROBE_TIMEOUT_MS = 3_000;
export const HEALTH_POLL_FAILURE_THRESHOLD = 3;

export interface HealthPollTransition {
	next: "ready" | "down";
	shouldSurfaceStopped: boolean;
}

export function nextHealthPollTransition(
	lastKnownState: "ready" | "down" | null,
	consecutiveFailures: number,
	bound: boolean,
): { consecutiveFailures: number; transition: HealthPollTransition | null } {
	const nextConsecutiveFailures = bound ? 0 : consecutiveFailures + 1;
	if (!bound && nextConsecutiveFailures < HEALTH_POLL_FAILURE_THRESHOLD) {
		return { consecutiveFailures: nextConsecutiveFailures, transition: null };
	}

	const next: "ready" | "down" = bound ? "ready" : "down";
	if (next === lastKnownState) {
		return { consecutiveFailures: nextConsecutiveFailures, transition: null };
	}

	return {
		consecutiveFailures: nextConsecutiveFailures,
		transition: {
			next,
			shouldSurfaceStopped: next === "down" && lastKnownState === "ready",
		},
	};
}
