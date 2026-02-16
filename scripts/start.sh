#!/usr/bin/env bash
set -euo pipefail

echo "Starting AWA-V (production mode)..."

pnpm --filter @awa-v/agent-server start &
AGENT_PID=$!

pnpm --filter @awa-v/web dev &
WEB_PID=$!

trap "kill $AGENT_PID $WEB_PID 2>/dev/null; exit" SIGINT SIGTERM

echo "Agent Server: http://localhost:2078"
echo "Web UI: http://localhost:2077"

wait
