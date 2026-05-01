#!/bin/sh
set -eu

echo "Running Prisma migrations..."
# Use the bundled Prisma CLI directly — avoids npx network downloads and permission issues
node /app/node_modules/prisma/build/index.js migrate deploy

echo "Starting Next.js server..."
exec node /app/server.js
