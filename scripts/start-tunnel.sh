#!/usr/bin/env bash
set -euo pipefail

PROVIDER="${TUNNEL_PROVIDER:-cloudflare}"
TARGET_PORT="${TUNNEL_PORT:-3000}"
TARGET_HOST="${TUNNEL_LOCAL_HOST:-localhost}"
SUBDOMAIN="${TUNNEL_SUBDOMAIN:-api-local}"
HOST="${TUNNEL_HOST:-https://localtunnel.me}"

echo "Starting tunnel (${PROVIDER}) for ${TARGET_HOST}:${TARGET_PORT}"

run_cloudflared() {
  local args=("tunnel" "--url" "${TARGET_HOST}:${TARGET_PORT}")

  if [ -n "${CLOUDFLARED_TOKEN:-}" ]; then
    args+=("--token" "${CLOUDFLARED_TOKEN}")
  elif [ -n "${CLOUDFLARED_HOSTNAME:-}" ]; then
    args+=("--hostname" "${CLOUDFLARED_HOSTNAME}")
  fi

  echo "Command: cloudflared ${args[*]}"
  exec cloudflared "${args[@]}"
}

run_localtunnel() {
  echo "Requested URL: ${HOST%/}/${SUBDOMAIN}"
  exec lt \
    --port "${TARGET_PORT}" \
    --local-host "${TARGET_HOST}" \
    --subdomain "${SUBDOMAIN}" \
    --host "${HOST}"
}

case "${PROVIDER}" in
  cloudflare)
    if command -v cloudflared &>/dev/null; then
      run_cloudflared
    else
      echo "cloudflared not found, falling back to localtunnel..."
      run_localtunnel
    fi
    ;;
  localtunnel)
    run_localtunnel
    ;;
  *)
    echo "Unknown TUNNEL_PROVIDER: ${PROVIDER}. Use 'cloudflare' or 'localtunnel'." >&2
    exit 1
    ;;
esac
