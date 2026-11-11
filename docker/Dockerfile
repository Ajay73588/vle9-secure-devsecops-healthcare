# Stage 1: Install production dependencies cleanly
FROM node:22-alpine AS deps
WORKDIR /build
RUN apk update && apk upgrade --no-cache
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Stage 2: Minimal hardened non-root runtime image
FROM node:22-alpine AS runtime
LABEL org.opencontainers.image.title="SecureCare Healthcare Portal" \
      org.opencontainers.image.description="VLE-9 Secure DevSecOps Synthetic Healthcare System" \
      org.opencontainers.image.vendor="VLE-9"

ENV NODE_ENV=production \
    PORT=3000

RUN apk update && apk upgrade --no-cache && \
    addgroup -g 10001 -S appgroup && \
    adduser -u 10001 -S appuser -G appgroup -H -D

WORKDIR /app
COPY --from=deps --chown=10001:10001 /build/node_modules ./node_modules
COPY --chown=10001:10001 app/package.json ./
COPY --chown=10001:10001 app/src ./src
COPY --chown=10001:10001 app/public ./public

USER 10001:10001
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]

