#!/usr/bin/env bash
# Prepares a fresh workspace: MongoDB, .env, dependencies, Antelope modules.
# Orca runs this from the worktree root when a workspace is created.
set -euo pipefail

MONGO_CONTAINER=mongo
MONGO_IMAGE=mongo:8

start_mongo() {
  if ! command -v docker >/dev/null; then
    echo "docker is not available in this workspace; skipping MongoDB" >&2
    return 0
  fi
  if docker ps --format '{{.Names}}' | grep -qx "$MONGO_CONTAINER"; then
    return 0
  fi
  if docker ps -a --format '{{.Names}}' | grep -qx "$MONGO_CONTAINER"; then
    docker start "$MONGO_CONTAINER" >/dev/null
  else
    docker run -d --name "$MONGO_CONTAINER" --restart unless-stopped \
      -p 127.0.0.1:27017:27017 "$MONGO_IMAGE" >/dev/null
  fi
  for _ in $(seq 1 60); do
    docker exec "$MONGO_CONTAINER" mongosh --quiet --eval 'db.adminCommand("ping")' >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "MongoDB did not become ready in time" >&2
  return 1
}

write_env() {
  [ -f .env ] && return 0
  cp .env.example .env
  # DMS_SESSION_SECRET must be at least 32 characters or every login fails.
  local secret
  secret=$(openssl rand -hex 32)
  sed -i "s|^DMS_SESSION_SECRET=.*|DMS_SESSION_SECRET=${secret}|" .env
}

install_modules() {
  # `ajs` fetches each module's package manager through corepack; a cold cache can
  # lose a race between parallel module installs, and the retry then finds it warm.
  pnpm exec ajs project modules install || {
    echo "module install failed, retrying once with a warm corepack cache" >&2
    pnpm exec ajs project modules install
  }
}

echo "==> MongoDB"
start_mongo

echo "==> .env"
write_env

echo "==> dependencies"
pnpm install
pnpm --dir frontend-vue install

echo "==> antelope modules"
install_modules

echo "workspace ready: 'pnpm dev' (backend) and 'pnpm frontend:dev' (dashboard)"
