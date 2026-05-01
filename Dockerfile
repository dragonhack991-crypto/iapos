FROM node:20-alpine AS base

FROM base AS deps
# Compatibilidad + OpenSSL para Prisma en Alpine
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# IMPORTANTE: copiar prisma antes de npm ci para que postinstall (prisma generate) encuentre schema.prisma
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# OpenSSL + certs y usuario no-root
RUN apk add --no-cache openssl ca-certificates \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Assets estáticos
# COPY --from=builder /app/public ./public

# Next standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma schema/migrations + runtime artifacts
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

# Entrypoint
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["sh", "./docker-entrypoint.sh"]