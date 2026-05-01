#!/bin/sh
set -eu

echo "Running Prisma migrations..."
node /app/node_modules/prisma/build/index.js migrate deploy

echo "Starting Next.js server..."
exec node /app/server.js