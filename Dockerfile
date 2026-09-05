FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json .npmrc tsconfig.base.json ./
COPY back/package.json ./back/
COPY front/package.json ./front/
COPY shared/types/package.json ./shared/types/

RUN npm ci --omit=dev \
  --workspace=finsight-ai-serve \
  --workspace=@shared/types \
  --include-workspace-root

COPY back ./back
COPY shared ./shared

WORKDIR /app/back
EXPOSE 3300
CMD ["npx", "tsx", "src/index.ts"]
