#!/usr/bin/env bash
#
# Phase: Clean up legacy artifacts

source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

find_repo_root

removed_any=false

# Repo-local folders left by the shim, piclaw bind mounts, or retired extensions.
for legacy_dir in services home .piclaw .pi/extensions/meta-logger .pi/meta-logs; do
	if [[ -e "${REPO_ROOT}/${legacy_dir}" ]]; then
		info "removing legacy folder: ${legacy_dir}/"
		rm -rf "${REPO_ROOT}/${legacy_dir}"
		removed_any=true
	fi
done

# Tmp files from the old pi-rpc-shim.
for legacy_file in /tmp/pi-rpc-shim.pid /tmp/pi-rpc-shim.log; do
	if [[ -e "$legacy_file" ]]; then
		info "removing ${legacy_file}"
		rm -f "$legacy_file"
		removed_any=true
	fi
done

# Containers from prior frontends (only if Docker is reachable).
if have docker && docker info >/dev/null 2>&1; then
	for legacy_container in piclaw open-webui; do
		if docker ps -aq -f "name=^${legacy_container}$" 2>/dev/null | grep -q .; then
			info "removing legacy container: ${legacy_container}"
			docker rm -f "$legacy_container" >/dev/null 2>&1 || true
			removed_any=true
		fi
	done
fi

if [[ "$removed_any" == "true" ]]; then
	ok "legacy artifacts cleaned up"
else
	ok "no legacy artifacts found"
fi
