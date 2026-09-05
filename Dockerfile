FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY back/package.json ./back/
COPY front/package.json ./front/
COPY shared/types/package.json ./shared/types/
COPY back ./back
COPY shared ./shared
RUN npm ci --include=dev && npm run build:back

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY back/package.json ./back/
COPY front/package.json ./front/
COPY shared ./shared
RUN npm ci --omit=dev
COPY --from=build /app/back/dist ./back/dist
WORKDIR /app/back
EXPOSE 3300
CMD ["node", "dist/index.js"]
