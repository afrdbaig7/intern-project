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

# Set DATABASE_URL for Prisma
ENV DATABASE_URL="file:/app/db/custom.db"

# Generate Prisma client and build Next.js
RUN bun run db:generate
RUN bun run build

# Create database and seed
RUN bun run db:push
RUN bun run db:seed

# Copy static files into standalone output
RUN cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/

# Make entrypoint executable
RUN chmod +x docker-entrypoint.sh

EXPOSE 8080

CMD ["sh", "docker-entrypoint.sh"]
