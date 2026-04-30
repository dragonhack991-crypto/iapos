#!/bin/sh
set -e

echo "Ejecutando migraciones de base de datos..."
node node_modules/prisma/build/index.js migrate deploy

echo "Iniciando servidor..."
exec node server.js
