#!/usr/bin/env bash
# Starts the local development environment: the local Supabase stack (if it is not running yet) and the Next.js dev server.
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local (copy it from .env.local.example)." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker and try again." >&2
  exit 1
fi

# The Supabase CLI is a project devDependency, not a global install.
if pnpm exec supabase status >/dev/null 2>&1; then
  echo "Local Supabase is already running."
else
  echo "Starting local Supabase..."
  pnpm exec supabase start
fi

exec pnpm dev
