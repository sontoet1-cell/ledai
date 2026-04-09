FROM node:20-bookworm-slim

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  ffmpeg \
  yt-dlp \
  dumb-init \
  python3 \
  python3-pip \
  && rm -rf /var/lib/apt/lists/*

RUN chmod +x /usr/bin/yt-dlp || true
RUN python3 -m pip install --no-cache-dir -U yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/runtime_tmp

EXPOSE 3000

CMD ["dumb-init", "node", "server.js"]
