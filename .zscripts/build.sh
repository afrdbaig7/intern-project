#!/bin/bash

exec 2>&1

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NEXTJS_PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -d "$NEXTJS_PROJECT_DIR" ]; then
    echo "❌ Error: Next.js project directory not found: $NEXTJS_PROJECT_DIR"
    exit 1
fi

echo "🚀 Starting build for Next.js app and mini-services..."
echo "📁 Next.js project path: $NEXTJS_PROJECT_DIR"

# Switch to Next.js project directory
cd "$NEXTJS_PROJECT_DIR" || exit 1

# Set environment variables
export NEXT_TELEMETRY_DISABLED=1

BUILD_DIR="/tmp/build_fullstack_$BUILD_ID"
echo "📁 Cleaning and creating build directory: $BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Install dependencies
echo "📦 Installing dependencies..."
bun install

# Build Next.js app
echo "🔨 Building Next.js app..."
bun run build

# Build mini-services
# Check if mini-services directory exists in Next.js project
if [ -d "$NEXTJS_PROJECT_DIR/mini-services" ]; then
    echo "🔨 Building mini-services..."
    # Use mini-services script in workspace-agent directory
    sh "$SCRIPT_DIR/mini-services-install.sh"
    sh "$SCRIPT_DIR/mini-services-build.sh"

    # Copy mini-services-start.sh to mini-services-dist directory
    echo "  - Copying mini-services-start.sh to $BUILD_DIR"
    cp "$SCRIPT_DIR/mini-services-start.sh" "$BUILD_DIR/mini-services-start.sh"
    chmod +x "$BUILD_DIR/mini-services-start.sh"
else
    echo "ℹ️  mini-services directory not found, skipping"
fi

# Copy all build artifacts to temporary build directory
echo "📦 Collecting build artifacts to $BUILD_DIR..."

# Copy Next.js standalone build output
if [ -d ".next/standalone" ]; then
    echo "  - Copying .next/standalone"
    cp -r .next/standalone "$BUILD_DIR/next-service-dist/"
fi

# Copy Next.js static files
if [ -d ".next/static" ]; then
    echo "  - Copying .next/static"
    mkdir -p "$BUILD_DIR/next-service-dist/.next"
    cp -r .next/static "$BUILD_DIR/next-service-dist/.next/"
fi

if [ -d "public" ]; then
    echo "  - Copying public"
    cp -r public "$BUILD_DIR/next-service-dist/"
fi

# Copy test environment database to build artifacts; production environment will use this database directly
if [ -f "./db/custom.db" ]; then
    echo "🗄️  Copying test environment database to build artifacts..."
    mkdir -p "$BUILD_DIR/db"
    cp -r ./db/. "$BUILD_DIR/db/"

    echo "🗄️  Syncing database schema in build artifacts..."
    DATABASE_URL="file:$BUILD_DIR/db/custom.db" bun run db:push
    echo "✅ Build artifact database prepared"
    ls -lah "$BUILD_DIR/db"
else
    echo "❌ Test environment database file ./db/custom.db not found, cannot continue building production package"
    exit 1
fi

# Copy Caddyfile (if exists)
if [ -f "Caddyfile" ]; then
    echo "  - Copying Caddyfile"
    cp Caddyfile "$BUILD_DIR/"
else
    echo "ℹ️  Caddyfile not found, skipping"
fi

# Copy start.sh script
echo "  - Copying start.sh to $BUILD_DIR"
cp "$SCRIPT_DIR/start.sh" "$BUILD_DIR/start.sh"
chmod +x "$BUILD_DIR/start.sh"

# Package to $BUILD_DIR.tar.gz
PACKAGE_FILE="${BUILD_DIR}.tar.gz"
echo ""
echo "📦 Packaging build artifacts to $PACKAGE_FILE..."
cd "$BUILD_DIR" || exit 1
tar -czf "$PACKAGE_FILE" .
cd - > /dev/null || exit 1

# # Clean up temporary directory
# rm -rf "$BUILD_DIR"

echo ""
echo "✅ Build completed! All artifacts packaged to $PACKAGE_FILE"
echo "📊 Package file size:"
ls -lh "$PACKAGE_FILE"
