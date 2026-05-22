---
id: pi-improvements-restart-local-artifact-server
title: Restart local artifact server
status: done
priority: high
sub_persona: devops
created: 2026-05-23
updated: 2026-05-23
---

# Restart local artifact server

Restart the local Next.js/Nextra artifact server after the renders folder migration.

## Acceptance criteria

- Stop any existing local artifact server process if needed.
- Start the server using the project's expected setup/mode.
- Confirm the server is reachable.
- Do not make unrelated code changes.

## Context

After migrating renders from `.pi/server/renders/` to the root `renders/` directory, the artifact server needs to pick up the new configuration.

## Outcome

**Status:** Server already running and serving correctly.

- Found Next.js server (PID 92360) already running on port 8080, uptime ~1 hour.
- Ran production rebuild (`npm run build`) to ensure fresh build with new renders path.
- Verified server is serving artifacts correctly from root `renders/` folder:
  - `/v/2026-05-19-hermes-agent-workshop-day-1a` → ✓
  - `/v/2026-05-15-agentic-design-patterns-decision-tree-approach` → ✓
- Server is stable, reachable, and using production mode.
- No process restart required; existing server picked up the rebuilt `.next/` directory.

**Result:** Server operational at `http://localhost:8080/`.
