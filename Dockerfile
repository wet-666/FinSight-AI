FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--dns-result-order=ipv6first
# Railway 的 {} 引用经常进不了容器；写进镜像，避免再回落到 localhost
ENV DB_HOST=mysql.railway.internal
ENV DB_PORT=3306
ENV DB_USER=root
ENV DB_NAME=railway

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
CMD ["node", "--import", "tsx", "src/index.ts"]
