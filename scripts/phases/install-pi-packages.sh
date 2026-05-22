#!/usr/bin/env bash
#
# Phase: Install Pi project-local packages

source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

find_repo_root

# ---------------------------------------------------------------------------
# Pi project-local packages (restore from .pi/settings.json)
#
# Pi records project-local extension installs in .pi/settings.json. The
# .pi/npm/ tree is gitignored (regenerable), so on a fresh clone we replay
# each entry through `pi install -l`. Idempotent: pi skips packages that
# are already on disk and at the requested version.
# ---------------------------------------------------------------------------

PI_SETTINGS="${REPO_ROOT}/.pi/settings.json"

if [[ -f "$PI_SETTINGS" ]]; then
	# Pull the package list out via node — guaranteed present at this point.
	PI_PACKAGES=$(node -e '
		try {
			const s = require("'"$PI_SETTINGS"'");
			const pkgs = Array.isArray(s.packages) ? s.packages : [];
			console.log(pkgs.join("\n"));
		} catch (e) { process.exit(0); }
	' 2>/dev/null || true)

	if [[ -n "${PI_PACKAGES:-}" ]]; then
		while IFS= read -r pkg; do
			[[ -z "$pkg" ]] && continue
			info "ensuring Pi package: ${pkg}"
			# `pi install -l` is idempotent. Camoufox (used by the `research`
			# skill) lazily downloads its ~500 MB browser binary on first
			# tool invocation, not here.
			if pi install -l "$pkg" >/dev/null 2>&1; then
				ok "${pkg}"
			else
				warn "failed to install ${pkg} — re-run \`pi install -l ${pkg}\` to retry"
			fi
		done <<< "$PI_PACKAGES"
	else
		ok "no Pi project-local packages declared"
	fi
else
	ok "no .pi/settings.json — skipping Pi package restore"
fi

# ---------------------------------------------------------------------------
# Local patches against .pi/npm/ packages
#
# Some upstream playwright bugs bite us mid-research (Firefox uncaughtError
# with no source location crashes the entire Node process — see
# scripts/patches/playwright-core+1.60.0.patch). We carry small patches in
# scripts/patches/ and reapply them after every `pi install -l`. Idempotent:
# already-applied patches are skipped silently.
# ---------------------------------------------------------------------------

if [[ -d "${REPO_ROOT}/.pi/npm/node_modules" ]]; then
	bash "${REPO_ROOT}/scripts/apply-patches.sh" || warn "some patches failed — see output above"
else
	info "no .pi/npm/node_modules/ — skipping patches"
fi
