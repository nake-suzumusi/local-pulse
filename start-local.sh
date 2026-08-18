#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22.13.0 or later is required: https://nodejs.org/"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing Local Pulse dependencies..."
  npm install
fi

exec npm run local
