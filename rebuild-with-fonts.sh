#!/bin/bash
# Rebuild Docker image with fixed font downloading

echo "🔨 Rebuilding Docker image with fixed font downloading..."
echo ""

# Stop existing container
echo "🛑 Stopping existing container..."
docker-compose down

# Clean build with no cache to ensure fonts are downloaded fresh
echo "🏗️  Building fresh image (this will take a few minutes as fonts are downloaded)..."
docker-compose build --no-cache canvas-api

echo ""
echo "🚀 Starting container..."
docker-compose up -d

# Wait for container to start
sleep 3

# Show logs to see font loading
echo ""
echo "📋 Container logs (showing font loading):"
docker-compose logs --tail=50 canvas-api | grep -E "(Pre-built fonts|Available fonts|Font|TTF)"

echo ""
echo "✅ Rebuild complete!"
echo ""
echo "To check if fonts are working:"
echo "  docker-compose logs -f canvas-api"
echo ""
echo "The pre-built fonts should now include Roboto, Montserrat, and Inter!"
