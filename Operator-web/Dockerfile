FROM oven/bun:1.1.29

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json bun.lock ./
RUN bun install

COPY . .
RUN bun run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "server/index.ts"]
