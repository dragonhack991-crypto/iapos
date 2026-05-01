#!/bin/sh
set -eu

echo "Waiting for db..."
until nc -z db 5432; do
  sleep 1
done

echo "Running Prisma migrations..."
node node_modules/prisma/build/index.js migrate deploy

echo "Running seed..."
npm run db:seed || true

echo "Starting Next.js server..."
exec node server.js