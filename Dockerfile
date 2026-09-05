FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json .npmrc tsconfig.base.json ./
COPY back/package.json ./back/
COPY front/package.json ./front/
COPY shared/types/package.json ./shared/types/

RUN npm ci --include=dev \
  --workspace=finsight-ai-serve \
  --workspace=@shared/types \
  --include-workspace-root

COPY back ./back
COPY shared ./shared
RUN npm run build:back

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json .npmrc ./
COPY back/package.json ./back/
COPY front/package.json ./front/
COPY shared/types/package.json ./shared/types/
RUN npm ci --omit=dev \
  --workspace=finsight-ai-serve \
  --workspace=@shared/types \
  --include-workspace-root

COPY --from=build /app/back/dist ./back/dist
COPY shared ./shared

WORKDIR /app/back
EXPOSE 3300
CMD ["node", "dist/index.js"]
