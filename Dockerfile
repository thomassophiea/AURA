# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (layer-cached unless package files change)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built frontend assets and server files
COPY --from=builder /app/build ./build
COPY server.js ./
COPY --from=builder /app/server ./server

# Non-root user for security.
#
# Ownership and modes are normalised rather than inherited: a build context
# uploaded from a workstation carries that workstation's permissions, and a
# source tree checked out mode 700 produced an image whose own runtime user
# could not read `server.js`. The image must not depend on the umask of
# whoever built it.
RUN addgroup -S aura && adduser -S aura -G aura \
  && chown -R aura:aura /app \
  && find /app -type d -exec chmod 755 {} + \
  && find /app -type f -exec chmod 644 {} +
USER aura

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
