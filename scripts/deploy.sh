#!/usr/bin/env bash
# Deploy EQL-twitch-bot to the Lightsail host (same box as Chronicler).
# Usage: ./scripts/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-52.45.134.246}"
USER="${DEPLOY_USER:-ubuntu}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/lightsail/berrybot.pem}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-EQL-twitch-bot}"

if [[ ! -f "$KEY" ]]; then
  echo "Missing SSH key: $KEY" >&2
  exit 1
fi

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Missing $ROOT/.env — copy .env.example and fill Twitch creds first." >&2
  exit 1
fi

# Fail fast if required secrets are blank (do not print values).
missing=()
while IFS= read -r key; do
  val="$(grep -E "^${key}=" "$ROOT/.env" | tail -1 | cut -d= -f2- | tr -d '[:space:]')"
  if [[ -z "$val" ]]; then
    missing+=("$key")
  fi
done <<'EOF'
TWITCH_USERNAME
TWITCH_OAUTH_TOKEN
TWITCH_CHANNELS
EOF

if ((${#missing[@]})); then
  echo "Fill these in $ROOT/.env before deploy: ${missing[*]}" >&2
  exit 1
fi

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$USER@$HOST")
RSYNC=(rsync -az --delete
  --exclude node_modules
  --exclude dist
  --exclude .git
  --exclude .env
  --exclude data
  --exclude '*.log'
  -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new"
)

echo "→ rsync code → $USER@$HOST:~/$REMOTE_DIR"
"${RSYNC[@]}" "$ROOT/" "$USER@$HOST:~/$REMOTE_DIR/"

echo "→ scp .env (secrets stay off git)"
scp -i "$KEY" -o StrictHostKeyChecking=accept-new \
  "$ROOT/.env" "$USER@$HOST:~/$REMOTE_DIR/.env"

echo "→ docker compose up --build"
"${SSH[@]}" "cd ~/$REMOTE_DIR && docker compose up -d --build"

echo "→ recent logs"
"${SSH[@]}" "cd ~/$REMOTE_DIR && docker compose logs --tail=40 twitch"

echo "Done."
