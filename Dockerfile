# syntax=docker/dockerfile:1

# =============================================================================
# Everything is built for the target architecture (arm64), under QEMU emulation
# on an amd64 CI runner. That is slower than building on the runner's native
# architecture and copying the result across, and it is a deliberate choice:
# Prisma ships TWO native binaries, and only one of them can be cross-targeted.
#
#   * the query engine, used by the app at runtime — selectable via
#     `binaryTargets` in prisma/schema.prisma
#   * the schema engine, used by `prisma migrate deploy` in the entrypoint —
#     downloaded by the CLI for whichever platform ran `npm ci`, with no
#     equivalent knob in the schema
#
# So a cross-build produces an image whose migrations cannot run at all: the
# container starts, tries to migrate with an amd64 binary on an arm64 host, and
# dies. Emulating the build costs minutes per release; getting this wrong costs
# a broken deploy. If release builds ever get too slow to live with, the way
# out is a native arm64 runner, not cross-compilation.
# =============================================================================

FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Copied on their own so this layer is cached against the lockfile alone and
# npm ci is skipped whenever only application code changed.
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Writes node_modules/.prisma/client, including the arm64 engine binary.
RUN npx prisma generate
RUN npm run build

# =============================================================================
# Runtime.
# =============================================================================
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

# Both Prisma engines probe for libssl at startup. node:20-bookworm-slim ships
# the library but not the openssl package that Prisma's detection looks for, so
# without this it warns "failed to detect the libssl/openssl version", falls
# back to an openssl-1.1.x build of the engine, and then fails outright when the
# entrypoint runs migrations. Verified: removing this line breaks boot.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    APP_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Next's standalone bundle: a self-contained server.js plus only the
# node_modules Next traced. Static assets are not part of that trace and have
# to be copied separately. (If this app ever grows a public/ directory, it
# needs its own COPY line here too — it is not traced either.)
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

# The entrypoint shells out to `prisma migrate deploy`. That is a CLI
# invocation which no source file imports, so Next never traced it — and
# neither the CLI, the generated client's engines, nor the migration SQL made
# it into the standalone bundle. All three are carried over deliberately.
COPY --from=build --chown=node:node /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/prisma ./prisma

COPY --chmod=0755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
