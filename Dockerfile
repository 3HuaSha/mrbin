FROM node:22-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev

COPY . .
RUN npm run build

FROM node:22-slim AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server.mjs ./server.mjs

EXPOSE 3000

CMD ["npm", "run", "start"]
