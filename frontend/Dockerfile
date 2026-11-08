# Moderator dashboard (Next.js). Build from frontend/:
#   docker build -t data-peaks-dashboard --build-arg NEXT_PUBLIC_API_URL=https://api.example.com frontend
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

# NEXT_PUBLIC_* values are baked into the bundle at build time
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_USE_MOCK="false"
ARG NEXT_PUBLIC_DEMO_FALLBACK="false"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_USE_MOCK=$NEXT_PUBLIC_USE_MOCK \
    NEXT_PUBLIC_DEMO_FALLBACK=$NEXT_PUBLIC_DEMO_FALLBACK \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.ts ./
COPY --from=build /app/mock ./mock
USER node
EXPOSE 3000
# MODERATOR_KEY and API_INTERNAL_URL are read at runtime
CMD ["sh", "-c", "node_modules/.bin/next start -H 0.0.0.0 -p ${PORT}"]
