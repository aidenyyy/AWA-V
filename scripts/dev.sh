#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-dev}"

echo "Starting AWA-V ($MODE mode)..."

if [ "$MODE" = "self" ]; then
  # Self-iteration mode: no file watching, immune to source changes
  echo ">> Self-iteration mode: server won't restart on file changes"
  pnpm --filter @awa-v/agent-server start &
  AGENT_PID=$!
else
  # Development mode: hot-reload on file changes
  pnpm --filter @awa-v/agent-server dev &
  AGENT_PID=$!
fi

pnpm --filter @awa-v/web dev &
WEB_PID=$!

trap "kill $AGENT_PID $WEB_PID 2>/dev/null; exit" SIGINT SIGTERM

echo "Agent Server: http://localhost:2078"
echo "Web UI: http://localhost:2077"

wait
