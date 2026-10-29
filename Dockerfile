# syntax=docker/dockerfile:1

FROM node:24.22.2-bookworm-slim AS build
# better-sqlite3 is compiled here; the runtime image only gets the result.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/test-kit/package.json packages/test-kit/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY packages packages
RUN pnpm --filter @rin-language/core-web build \
  && pnpm --filter @rin-language/core-server build \
  && pnpm --filter @rin-language/core-server --prod --legacy deploy /out/server

FROM node:24.22.2-bookworm-slim AS runtime
ENV NODE_ENV=production \
  APP_HOST=0.0.0.0 \
  APP_PORT=3000 \
  APP_CONFIG_DIR=/app/config \
  APP_DATABASE_PATH=/var/lib/rin/rin.sqlite \
  APP_WEB_DIR=/app/web
WORKDIR /app
COPY --from=build /out/server ./server
COPY --from=build /repo/packages/web/dist ./web
COPY config ./config
COPY data ./data
# The one place the server may write: the database.
RUN mkdir -p /var/lib/rin && chown node:node /var/lib/rin
USER node
EXPOSE 3000
CMD ["node", "server/dist/main.js"]
