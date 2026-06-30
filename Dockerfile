FROM oven/bun:1 as base

# Install Caddy
RUN apt-get update && apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
RUN curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
RUN curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
RUN apt-get update && apt-get install -y caddy

WORKDIR /app

# Copy package files and install
COPY package.json bun.lock ./
COPY mini-services/socket-service/package.json ./mini-services/socket-service/
RUN bun install

# Copy source
COPY . .

# Generate Prisma client and build Next.js
ENV DATABASE_URL="file:/app/db/custom.db"
RUN bun run db:generate
RUN bun run build

# Expose Railway's default port
EXPOSE 8080
ENV PORT=3000

# Modify Caddyfile to listen on Railway's PORT instead of 80
RUN sed -i 's/:80/:8080/g' Caddyfile

# Generate database schema (creates the SQLite file)
RUN bun run db:push
RUN bun run db:seed

# Start Next.js, the socket service, and Caddy
CMD bun run start & bun run socket & caddy run --config Caddyfile --adapter caddyfile
