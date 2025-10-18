#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}Testing Roboto Font Endpoint${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Test parameters
PORT=3001
MAX_TESTS=5
SUCCESS_COUNT=0
FAIL_COUNT=0

# Function to test the endpoint
test_endpoint() {
  local test_num=$1
  echo -e "${YELLOW}Test #${test_num}: Rendering with Roboto font...${NC}"
  
  # Make the request
  response=$(curl -s -w "\n%{http_code}\n%{size_download}" \
    -X POST "http://localhost:${PORT}/render?format=base64" \
    -H "Content-Type: application/json" \
    -d @test/test-roboto.json)
  
  # Extract HTTP code and size
  http_code=$(echo "$response" | tail -n 2 | head -n 1)
  size=$(echo "$response" | tail -n 1)
  body=$(echo "$response" | sed '$d' | sed '$d')
  
  # Check if successful
  if [ "$http_code" = "200" ]; then
    # Try to parse JSON and check for success field
    success=$(echo "$body" | jq -r '.success' 2>/dev/null)
    render_time=$(echo "$body" | jq -r '.metadata.renderTimeMs' 2>/dev/null)
    size_kb=$(echo "$body" | jq -r '.metadata.sizeKB' 2>/dev/null)
    image_data=$(echo "$body" | jq -r '.image' 2>/dev/null | head -c 50)
    
    if [ "$success" = "true" ] && [ -n "$image_data" ]; then
      echo -e "${GREEN}✅ SUCCESS${NC}"
      echo -e "   HTTP Code: ${http_code}"
      echo -e "   Render Time: ${render_time}ms"
      echo -e "   Image Size: ${size_kb} KB"
      echo -e "   Image Data Preview: ${image_data}..."
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      return 0
    else
      echo -e "${RED}❌ FAILED - Invalid response body${NC}"
      echo -e "   Response preview: $(echo "$body" | head -c 200)..."
      FAIL_COUNT=$((FAIL_COUNT + 1))
      return 1
    fi
  else
    echo -e "${RED}❌ FAILED - HTTP ${http_code}${NC}"
    echo -e "   Response: $(echo "$body" | head -c 200)..."
    FAIL_COUNT=$((FAIL_COUNT + 1))
    return 1
  fi
}

# Run tests
for i in $(seq 1 $MAX_TESTS); do
  test_endpoint $i
  echo ""
  
  # Small delay between tests
  if [ $i -lt $MAX_TESTS ]; then
    sleep 0.5
  fi
done

# Summary
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}======================================${NC}"
echo -e "Total Tests: ${MAX_TESTS}"
echo -e "${GREEN}Successful: ${SUCCESS_COUNT}${NC}"
echo -e "${RED}Failed: ${FAIL_COUNT}${NC}"
echo ""

if [ $SUCCESS_COUNT -eq $MAX_TESTS ]; then
  echo -e "${GREEN}🎉 All tests passed! Roboto font is working correctly.${NC}"
  exit 0
else
  echo -e "${RED}⚠️  Some tests failed. Please check the logs above.${NC}"
  exit 1
fi

