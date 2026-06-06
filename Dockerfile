# ─── Build + production runtime ───────────────────────────────────────────────
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN npm ci \
  && npm run build -w @tabernacle/erp-premium-domain \
  && npm run build -w @tabernacle/erp-premium-db \
  && npm run build -w @tabernacle/erp-premium-api \
  && npm run build -w @tabernacle/erp-premium-desktop \
  && npm prune --omit=dev

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3847
ENV TABERNACLE_DATA_DIR=/data
ENV WEB_DIST_DIR=/app/apps/desktop/dist

WORKDIR /app/apps/api

EXPOSE 3847

VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3847/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
