# --- deps stage ---
FROM node:20-alpine AS deps
WORKDIR /app
# ffmpeg is needed later (local media), keep it in the runtime image.
RUN apk add --no-cache ffmpeg
COPY package.json pnpm-lock.yaml* .npmrc ./
RUN corepack enable && corepack prepare pnpm@latest --activate \
 && pnpm install --frozen-lockfile || pnpm install

# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && corepack prepare pnpm@latest --activate \
 && pnpm build

# --- runtime stage ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache ffmpeg tini
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
# Pre-create data dirs; mount via compose volumes
RUN mkdir -p /app/data/media /app/data/cache
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
