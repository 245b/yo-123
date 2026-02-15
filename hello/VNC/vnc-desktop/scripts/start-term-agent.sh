#!/usr/bin/env bash
set -euo pipefail

if [[ "${TERM_AGENT_IMPL:-python}" == "ts" ]]; then
  exec bun /projects/operator/hello/VNC/vnc-desktop/scripts/term-agent-server.ts
fi

exec python /opt/scripts/term-agent.py
