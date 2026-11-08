# Expert app (TanStack Start, served by Nitro's Node server). Build from expert-app/:
#   docker build -t data-peaks-expert --build-arg VITE_API_URL=https://api.example.com expert-app
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

# VITE_* values are baked into the browser bundle at build time.
# The browser calls the API directly, so the API must list this app's origin in CORS_ORIGINS.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL \
    NITRO_PRESET=node-server
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
COPY --from=build /app/.output ./.output
USER node
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
