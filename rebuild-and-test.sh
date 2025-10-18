#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║   Docker Rebuild & Font Test - Roboto Special Treatment      ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Stop existing containers
echo -e "${CYAN}━━━ Step 1: Stopping existing containers ━━━${NC}"
docker-compose down
echo -e "${GREEN}✅ Containers stopped${NC}"
echo ""

# Step 2: Rebuild Docker image with fonts
echo -e "${CYAN}━━━ Step 2: Rebuilding Docker image with pre-built fonts ━━━${NC}"
echo -e "${YELLOW}This will download ~100 fonts including Roboto during build...${NC}"
echo -e "${YELLOW}Build time: ~2-5 minutes${NC}"
echo ""

docker-compose build --no-cache

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Docker build failed!${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Docker image built successfully${NC}"
echo ""

# Step 3: Start containers
echo -e "${CYAN}━━━ Step 3: Starting containers ━━━${NC}"
docker-compose up -d

echo -e "${YELLOW}Waiting for service to start...${NC}"
sleep 5

# Check if container is running
if ! docker-compose ps | grep -q "Up"; then
  echo -e "${RED}❌ Container failed to start!${NC}"
  echo ""
  echo -e "${YELLOW}Showing logs:${NC}"
  docker-compose logs --tail=50
  exit 1
fi

echo -e "${GREEN}✅ Container started${NC}"
echo ""

# Step 4: Wait for service to be ready
echo -e "${CYAN}━━━ Step 4: Waiting for service to be ready ━━━${NC}"
MAX_WAIT=30
COUNTER=0
while [ $COUNTER -lt $MAX_WAIT ]; do
  if curl -s http://localhost:3001/health >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Service is ready!${NC}"
    break
  fi
  echo -ne "${YELLOW}Waiting... ${COUNTER}s${NC}\r"
  sleep 1
  COUNTER=$((COUNTER + 1))
done

if [ $COUNTER -ge $MAX_WAIT ]; then
  echo -e "${RED}❌ Service failed to start within ${MAX_WAIT}s${NC}"
  exit 1
fi

echo ""

# Step 5: Check startup logs for pre-built fonts
echo -e "${CYAN}━━━ Step 5: Checking if fonts were pre-built ━━━${NC}"
if docker-compose logs | grep -q "Pre-built fonts directory contains"; then
  echo -e "${GREEN}✅ Pre-built fonts detected!${NC}"
  docker-compose logs | grep "Pre-built fonts directory" | tail -5
else
  echo -e "${RED}⚠️  No pre-built fonts found in logs${NC}"
  echo -e "${YELLOW}This means fonts will be downloaded at runtime (slower)${NC}"
fi
echo ""

# Step 6: Test Roboto font
echo -e "${CYAN}━━━ Step 6: Testing Roboto Font (Special Apache License Path) ━━━${NC}"
echo ""

SUCCESS_COUNT=0
FAIL_COUNT=0
ITERATIONS=3

for i in $(seq 1 $ITERATIONS); do
  echo -ne "${YELLOW}Test $i/$ITERATIONS: ${NC}"
  
  response=$(curl -s -X POST "http://localhost:3001/render?format=base64" \
    -H "Content-Type: application/json" \
    -d @test/test-roboto.json)
  
  success=$(echo "$response" | jq -r '.success' 2>/dev/null)
  render_time=$(echo "$response" | jq -r '.metadata.renderTimeMs' 2>/dev/null)
  
  if [ "$success" = "true" ]; then
    echo -e "${GREEN}✅ ${render_time}ms${NC}"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    echo -e "${RED}❌ FAILED${NC}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
  
  sleep 0.3
done

echo ""

# Step 7: Check logs for font loading
echo -e "${CYAN}━━━ Step 7: Checking Docker logs for font loading details ━━━${NC}"
echo ""

if docker-compose logs --tail=100 | grep -q "Failed to load font: Roboto"; then
  echo -e "${RED}❌ Roboto font is FAILING to load!${NC}"
  echo -e "${YELLOW}Last 20 Roboto-related log lines:${NC}"
  docker-compose logs --tail=200 | grep -i "roboto" | tail -20
  echo ""
  echo -e "${YELLOW}Detailed error logs:${NC}"
  docker-compose logs --tail=100 | grep -A 3 "Attempting to download Google Font: Roboto" | tail -20
else
  echo -e "${GREEN}✅ No font loading errors detected${NC}"
fi

echo ""

# Step 8: Save test image
echo -e "${CYAN}━━━ Step 8: Saving test image ━━━${NC}"
curl -s -X POST "http://localhost:3001/render" \
  -H "Content-Type: application/json" \
  -d @test/test-roboto.json \
  -o roboto-docker-test.png

if [ -f roboto-docker-test.png ] && [ $(wc -c < roboto-docker-test.png) -gt 1000 ]; then
  SIZE=$(wc -c < roboto-docker-test.png | awk '{print int($1/1024)}')
  echo -e "${GREEN}✅ Image saved: roboto-docker-test.png (${SIZE}KB)${NC}"
else
  echo -e "${RED}❌ Failed to save image${NC}"
fi

echo ""

# Summary
echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║                         Test Summary                           ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Roboto Tests:    ${SUCCESS_COUNT}/${ITERATIONS} passed"
echo ""

if [ $SUCCESS_COUNT -eq $ITERATIONS ]; then
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  🎉 Success! Roboto font is working correctly!                ║${NC}"
  echo -e "${GREEN}║                                                                ║${NC}"
  echo -e "${GREEN}║  Why Roboto needs special treatment:                          ║${NC}"
  echo -e "${GREEN}║  • Most Google Fonts are in /ofl/ directory (Open Font Lic.) ║${NC}"
  echo -e "${GREEN}║  • Roboto is in /apache/ directory (Apache License)          ║${NC}"
  echo -e "${GREEN}║  • Files named Roboto-Regular.ttf (not RobotoRegular.ttf)    ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
else
  echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ⚠️  Some tests failed                                         ║${NC}"
  echo -e "${RED}║                                                                ║${NC}"
  echo -e "${RED}║  Check the logs above for detailed error messages             ║${NC}"
  echo -e "${RED}║  Run: docker-compose logs | grep -i roboto                    ║${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
fi

echo ""
echo -e "${CYAN}To view live logs:${NC} docker-compose logs -f"
echo -e "${CYAN}To test manually:${NC} curl -X POST http://localhost:3001/render -H 'Content-Type: application/json' -d @test/test-roboto.json -o test.png"
echo ""

