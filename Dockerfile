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

# Fix ports: Next.js on 3000, Socket on 3003, Caddy on Railway's $PORT
# Generate a new Caddyfile that correctly proxies Next.js and Socket.io
RUN echo '{ \n\
    http_port {$PORT} \n\
} \n\
:{$PORT} { \n\
    handle /socket.io/* { \n\
        reverse_proxy localhost:3003 \n\
    } \n\
    handle { \n\
        reverse_proxy localhost:3000 \n\
    } \n\
}' > Caddyfile

# Generate database schema (creates the SQLite file)
RUN bun run db:push
RUN bun run db:seed

# Railway injects $PORT. We force Next.js to 3000 so it doesn't steal $PORT from Caddy
CMD PORT=3000 bun run start & bun run socket & caddy run --config Caddyfile --adapter caddyfile
