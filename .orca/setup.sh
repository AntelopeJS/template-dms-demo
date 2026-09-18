#!/usr/bin/env bash
# Bootstraps a development environment for this project: MongoDB, .env,
# dependencies and Antelope modules. Orca runs it from the worktree root when a
# workspace is created; it is also safe to run by hand.
#
# Every step is optional and idempotent: an existing MongoDB, .env or install is
# left alone, so running it on a machine that is already set up changes nothing.
set -euo pipefail

MONGO_CONTAINER=mongo
MONGO_IMAGE=mongo:8
MONGO_PORT=27017

mongo_already_running() {
  # Anything listening on the port — a local mongod, a compose stack, a tunnel —
  # is assumed to be the database this project should use.
  if command -v nc >/dev/null; then
    nc -z 127.0.0.1 "$MONGO_PORT" 2>/dev/null && return 0
  elif command -v bash >/dev/null; then
    timeout 1 bash -c "</dev/tcp/127.0.0.1/$MONGO_PORT" 2>/dev/null && return 0
  fi
  return 1
}

start_mongo() {
  if [ -n "${MONGODB_URL:-}" ]; then
    echo "MONGODB_URL is set, using it as-is"
    return 0
  fi
  if mongo_already_running; then
    echo "something already listens on 127.0.0.1:$MONGO_PORT, leaving it alone"
    return 0
  fi
  if ! command -v docker >/dev/null; then
    echo "no MongoDB on $MONGO_PORT and no docker here:" >&2
    echo "start one yourself, or set MONGODB_URL in .env" >&2
    return 0
  fi
  if docker ps -a --format '{{.Names}}' | grep -qx "$MONGO_CONTAINER"; then
    docker start "$MONGO_CONTAINER" >/dev/null
  else
    docker run -d --name "$MONGO_CONTAINER" --restart unless-stopped \
      -p "127.0.0.1:$MONGO_PORT:27017" "$MONGO_IMAGE" >/dev/null
  fi
  for _ in $(seq 1 60); do
    docker exec "$MONGO_CONTAINER" mongosh --quiet --eval 'db.adminCommand("ping")' >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "MongoDB did not become ready in time" >&2
  return 1
}

write_env() {
  if [ -f .env ]; then
    echo ".env already exists, leaving it alone"
    return 0
  fi
  cp .env.example .env
  # DMS_SESSION_SECRET must hold at least 32 characters or every login fails.
  local secret
  secret=$(openssl rand -hex 32)
  sed -i "s|^DMS_SESSION_SECRET=.*|DMS_SESSION_SECRET=${secret}|" .env
  echo "wrote .env with a generated DMS_SESSION_SECRET"
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

echo "ready: 'pnpm dev' (backend) and 'pnpm frontend:dev' (dashboard)"
