#!/bin/bash
# Trading View Bot - Quick Testing Script
# This script provides examples and ready-to-use curl commands for testing

echo "🚀 TradingView Webhook Bot - Testing Guide"
echo "==========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:3000"
CHAT_ID="${1:-123456789}"
SECRET="${2:-your_shared_secret}"

echo -e "${BLUE}Configuration:${NC}"
echo "API URL: $API_URL"
echo "Chat ID: $CHAT_ID"
echo "Secret: $SECRET (optional)"
echo ""

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
echo "Command:"
echo "curl -s $API_URL/health | jq ."
echo ""
echo "Expected: {\"status\":\"ok\",\"timestamp\":\"...\"}"
echo ""
echo -e "${GREEN}Running...${NC}"
curl -s "$API_URL/health" | jq . || echo "Server not running"
echo ""
echo "---"
echo ""

# Test 2: Basic message without secret
echo -e "${YELLOW}Test 2: Basic Alert (No Authentication)${NC}"
echo "Command:"
cat << 'EOF'
curl -X POST http://localhost:3000/tv-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": "YOUR_CHAT_ID",
    "text": "<b>🚀 TEST ALERT</b>\n<b>Symbol:</b> EURUSD\n<b>Price:</b> 1.0950\n<b>Signal:</b> Buy"
  }'
EOF
echo ""
echo -e "${GREEN}Running...${NC}"
curl -X POST "$API_URL/tv-webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"chat_id\": \"$CHAT_ID\",
    \"text\": \"<b>🚀 TEST ALERT</b>\n<b>Symbol:</b> EURUSD\n<b>Price:</b> 1.0950\n<b>Signal:</b> Buy\"
  }" | jq .
echo ""
echo "---"
echo ""

# Test 3: With secret in JSON body
echo -e "${YELLOW}Test 3: Alert With Secret in JSON Body${NC}"
echo "Command:"
cat << 'EOF'
curl -X POST http://localhost:3000/tv-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "your_shared_secret",
    "chat_id": "YOUR_CHAT_ID",
    "text": "<b>📊 SUPERTREND ALERT</b>\n<b>Symbol:</b> GBPUSD\n<b>Action:</b> BUY\n<b>Entry:</b> 1.2650"
  }'
EOF
echo ""
echo -e "${GREEN}Running...${NC}"
curl -X POST "$API_URL/tv-webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"secret\": \"$SECRET\",
    \"chat_id\": \"$CHAT_ID\",
    \"text\": \"<b>📊 SUPERTREND ALERT</b>\n<b>Symbol:</b> GBPUSD\n<b>Action:</b> BUY\n<b>Entry:</b> 1.2650\"
  }" | jq .
echo ""
echo "---"
echo ""

# Test 4: With secret in header
echo -e "${YELLOW}Test 4: Alert With Secret in Header${NC}"
echo "Command:"
cat << 'EOF'
curl -X POST http://localhost:3000/tv-webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your_shared_secret" \
  -d '{
    "chat_id": "YOUR_CHAT_ID",
    "text": "<b>⚠️  TREND REVERSAL</b>\n<b>Pair:</b> USDJPY\n<b>Level:</b> 149.50"
  }'
EOF
echo ""
echo -e "${GREEN}Running...${NC}"
curl -X POST "$API_URL/tv-webhook" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $SECRET" \
  -d "{
    \"chat_id\": \"$CHAT_ID\",
    \"text\": \"<b>⚠️  TREND REVERSAL</b>\n<b>Pair:</b> USDJPY\n<b>Level:</b> 149.50\"
  }" | jq .
echo ""
echo "---"
echo ""

# Test 5: Wrong secret (should fail)
echo -e "${YELLOW}Test 5: Invalid Secret (Expected Error)${NC}"
echo "Command:"
echo "curl -X POST $API_URL/tv-webhook -H \"x-webhook-secret: wrong_secret\" ..."
echo ""
echo -e "${GREEN}Running...${NC}"
curl -X POST "$API_URL/tv-webhook" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: wrong_secret" \
  -d "{
    \"chat_id\": \"$CHAT_ID\",
    \"text\": \"This should fail\"
  }" | jq .
echo ""
echo "---"
echo ""

# Test 6: Missing required fields (should fail)
echo -e "${YELLOW}Test 6: Missing Required Field (Expected Error)${NC}"
echo "Command:"
echo "curl -X POST $API_URL/tv-webhook -d '{\"chat_id\": \"123\"}'"
echo ""
echo -e "${GREEN}Running...${NC}"
curl -X POST "$API_URL/tv-webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"chat_id\": \"$CHAT_ID\"
  }" | jq .
echo ""
echo "---"
echo ""

echo -e "${GREEN}Testing complete!${NC}"
echo ""
echo "To use in TradingView, paste these JSON examples in the Alert Message field:"
echo ""
echo -e "${BLUE}Example 1: Supertrend UP Alert${NC}"
cat << 'EOF'
{
  "chat_id": "123456789",
  "text": "<b>🚀 BUY SIGNAL</b>\n<b>Symbol:</b> {{ticker}}\n<b>Price:</b> {{close}}\n<b>Time:</b> {{time}}\n<b>Indicator:</b> Supertrend Breakout UP"
}
EOF
echo ""

echo -e "${BLUE}Example 2: Supertrend DOWN Alert${NC}"
cat << 'EOF'
{
  "chat_id": "123456789",
  "text": "<b>🔴 SELL SIGNAL</b>\n<b>Symbol:</b> {{ticker}}\n<b>Price:</b> {{close}}\n<b>Time:</b> {{time}}\n<b>Indicator:</b> Supertrend Breakdown DOWN"
}
EOF
echo ""

echo -e "${BLUE}Available TradingView Placeholders:${NC}"
echo "  {{ticker}}   - Symbol name (e.g., EURUSD)"
echo "  {{close}}    - Current close price"
echo "  {{open}}     - Current open price"
echo "  {{high}}     - Period high"
echo "  {{low}}      - Period low"
echo "  {{volume}}   - Period volume"
echo "  {{time}}     - Alert timestamp"
echo "  {{exchange}} - Exchange name"
