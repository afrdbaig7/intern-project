#!/bin/sh
set -e

RAILWAY_PORT="${PORT:-8080}"

echo "🚀 Starting services (Railway PORT=$RAILWAY_PORT)..."

# Generate Caddyfile at runtime with the actual port
cat > /app/Caddyfile <<EOF
{
    http_port $RAILWAY_PORT
}

:$RAILWAY_PORT {
    handle /socket.io/* {
        reverse_proxy localhost:3003
    }
    handle {
        reverse_proxy localhost:3000
    }
}
EOF

echo "✅ Generated Caddyfile (listening on :$RAILWAY_PORT)"

# Start Next.js on port 3000
export NODE_ENV=production
export PORT=3000
export HOSTNAME=0.0.0.0
export DATABASE_URL="file:/app/db/custom.db"

cd /app
echo "🚀 Starting Next.js on port 3000..."
bun .next/standalone/server.js &

echo "🚀 Starting Socket.IO service on port 3003..."
bun --hot mini-services/socket-service/index.ts &

sleep 2

echo "🚀 Starting Caddy on port $RAILWAY_PORT..."
echo "🎉 All services started!"
exec caddy run --config /app/Caddyfile --adapter caddyfile
