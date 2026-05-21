#!/usr/bin/env bash
# Launch AURA's Express server with the local Ollama box (redq) wired in.
#
# Layered on top of whatever is in your shell — does not clobber existing
# LLM provider env vars, so if you already have ANTHROPIC_API_KEY / GROQ_API_KEY
# / etc. exported, those providers will appear in the picker alongside Ollama.
#
# Usage:
#   ./scripts/start-with-ollama.sh           # node server.js
#   ./scripts/start-with-ollama.sh dev       # vite dev server (frontend)

set -euo pipefail

# ── Ollama on the redq Linux box ────────────────────────────────────────────
export OLLAMA_ENABLED=true
export OLLAMA_API_BASE="${OLLAMA_API_BASE:-http://192.168.100.177:11434/v1}"

# Quick reachability check so failures are loud instead of silent.
if ! curl -fsS --max-time 2 "${OLLAMA_API_BASE%/v1}/api/tags" >/dev/null; then
  echo "[start-with-ollama] WARN: ${OLLAMA_API_BASE} is unreachable (continuing anyway — picker will simply omit the Ollama group)."
else
  echo "[start-with-ollama] Ollama OK at ${OLLAMA_API_BASE}"
fi

case "${1:-start}" in
  dev)   exec npm run dev   ;;
  start) exec npm run start ;;
  *)     exec npm run "$1"  ;;
esac
