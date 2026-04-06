#!/bin/sh
set -eu

TARGET_PORT="${TUNNEL_PORT:-3000}"
TARGET_HOST="${TUNNEL_LOCAL_HOST:-api}"
SUBDOMAIN="${TUNNEL_SUBDOMAIN:-api-local}"
TUNNEL_HOST="${TUNNEL_HOST:-https://localtunnel.me}"

echo "Starting tunnel for ${TARGET_HOST}:${TARGET_PORT}"
echo "Requested URL: ${TUNNEL_HOST%/}/${SUBDOMAIN}"

exec lt \
  --port "${TARGET_PORT}" \
  --local-host "${TARGET_HOST}" \
  --subdomain "${SUBDOMAIN}" \
  --host "${TUNNEL_HOST}"
