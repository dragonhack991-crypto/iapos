FROM node:20-alpine AS base

FROM base AS deps
# libc6-compat for compatibility with some native modules
# openssl required by Prisma query engine on Alpine
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install OpenSSL and CA certs (required by Prisma), create non-root user
RUN apk add --no-cache openssl ca-certificates \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Static assets
COPY --from=builder /app/public ./public

# Next.js standalone output (includes a minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma schema + migrations (needed for migrate deploy at startup)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Prisma runtime artifacts (generated client + query engine + CLI)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

# Entrypoint script: runs migrations then starts Next.js
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["sh", "./docker-entrypoint.sh"]
