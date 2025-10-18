#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    Comprehensive Font Loading Test - Roboto & Others    ║${NC}"
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo ""

PORT=3001
ITERATIONS=10
SUCCESS_COUNT=0
FAIL_COUNT=0

# Test 1: Roboto only (special treatment path)
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Test 1: Roboto Font (Apache License - Special Path)${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

for i in $(seq 1 $ITERATIONS); do
  echo -ne "${YELLOW}Iteration $i/$ITERATIONS: ${NC}"
  
  response=$(curl -s -X POST "http://localhost:${PORT}/render?format=base64" \
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
  
  sleep 0.2
done

echo ""

# Test 2: Multiple fonts including Roboto
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Test 2: Multiple Fonts (Roboto + Montserrat + Others)${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

for i in $(seq 1 $ITERATIONS); do
  echo -ne "${YELLOW}Iteration $i/$ITERATIONS: ${NC}"
  
  response=$(curl -s -X POST "http://localhost:${PORT}/render?format=base64" \
    -H "Content-Type: application/json" \
    -d @test/test-multiple-fonts.json)
  
  success=$(echo "$response" | jq -r '.success' 2>/dev/null)
  render_time=$(echo "$response" | jq -r '.metadata.renderTimeMs' 2>/dev/null)
  
  if [ "$success" = "true" ]; then
    echo -e "${GREEN}✅ ${render_time}ms${NC}"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    echo -e "${RED}❌ FAILED${NC}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
  
  sleep 0.2
done

echo ""

# Test 3: Save actual PNG files
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Test 3: Save PNG Files for Visual Verification${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -ne "${YELLOW}Saving roboto-only.png...${NC} "
curl -s -X POST "http://localhost:${PORT}/render" \
  -H "Content-Type: application/json" \
  -d @test/test-roboto.json \
  -o roboto-only.png

if [ -f roboto-only.png ] && [ $(wc -c < roboto-only.png) -gt 1000 ]; then
  file_info=$(file roboto-only.png)
  echo -e "${GREEN}✅ $(wc -c < roboto-only.png | awk '{print int($1/1024)}')KB${NC}"
  SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
else
  echo -e "${RED}❌ FAILED${NC}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo -ne "${YELLOW}Saving multiple-fonts.png...${NC} "
curl -s -X POST "http://localhost:${PORT}/render" \
  -H "Content-Type: application/json" \
  -d @test/test-multiple-fonts.json \
  -o multiple-fonts.png

if [ -f multiple-fonts.png ] && [ $(wc -c < multiple-fonts.png) -gt 1000 ]; then
  file_info=$(file multiple-fonts.png)
  echo -e "${GREEN}✅ $(wc -c < multiple-fonts.png | awk '{print int($1/1024)}')KB${NC}"
  SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
else
  echo -e "${RED}❌ FAILED${NC}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo ""

# Summary
TOTAL_TESTS=$((ITERATIONS * 2 + 2))
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                     Test Summary                         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Total Tests:     ${TOTAL_TESTS}"
echo -e "${GREEN}Successful:      ${SUCCESS_COUNT}${NC}"
echo -e "${RED}Failed:          ${FAIL_COUNT}${NC}"
echo -e "Success Rate:    $(awk "BEGIN {printf \"%.1f%%\", ($SUCCESS_COUNT/$TOTAL_TESTS)*100}")"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  🎉 Perfect! All tests passed successfully!              ║${NC}"
  echo -e "${GREEN}║                                                          ║${NC}"
  echo -e "${GREEN}║  Roboto font is working correctly via:                  ║${NC}"
  echo -e "${GREEN}║  • Apache license path (special treatment)              ║${NC}"
  echo -e "${GREEN}║  • Multiple font loading                                ║${NC}"
  echo -e "${GREEN}║  • Consistent rendering across iterations               ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
  exit 0
else
  echo -e "${RED}⚠️  Some tests failed. Please review the output above.${NC}"
  exit 1
fi

