FROM node:20-bookworm-slim

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  ffmpeg \
  yt-dlp \
  dumb-init \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/runtime_tmp

EXPOSE 3000

CMD ["dumb-init", "node", "server.js"]
