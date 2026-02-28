FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ src/
RUN npx tsc

FROM node:20-alpine
RUN apk add --no-cache rsync openssh-client
WORKDIR /app
COPY --from=builder /app/package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/src/db/ src/db/
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]
