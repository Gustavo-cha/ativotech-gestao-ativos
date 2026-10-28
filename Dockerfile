# Ativos Tech — imagem de produção (site + API num único contêiner, um único banco de dados).
# Os dados ficam em /app/api/data — monte um volume nesse caminho (veja docker-compose.yml).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY api/package.json api/package-lock.json* api/
COPY web/package.json web/package-lock.json* web/
RUN npm ci --prefix api --omit=dev && npm ci --prefix web
COPY api api
COPY web web
COPY scripts scripts
RUN npm run build --prefix web && rm -rf web/.next/cache

FROM node:22-alpine
ENV NODE_ENV=production WEB_PORT=3000 PORT=3001
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /app/api/data
EXPOSE 3000
VOLUME ["/app/api/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "scripts/producao.js"]
