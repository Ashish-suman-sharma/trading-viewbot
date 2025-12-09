# Quick Start Guide

## Installation (5 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Create .env file from example
cp .env.example .env

# 3. Edit .env with your credentials
# Get TELEGRAM_BOT_TOKEN from @BotFather on Telegram
# Get your chat ID from https://api.telegram.org/bot{TOKEN}/getUpdates
```

## Running Locally

```bash
# Development mode (auto-reload on file changes)
npm run dev

# Production mode
npm start

# Server will run on http://localhost:3000
```

## Running with Docker

```bash
# Build and run with docker-compose (recommended)
docker-compose up --build

# Or manually with docker
docker build -t trading-viewbot .
docker run -p 3000:3000 --env-file .env trading-viewbot
```

## Quick Test

```bash
# Test 1: Health check
curl http://localhost:3000/health

# Test 2: Send a test message
curl -X POST http://localhost:3000/tv-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": "YOUR_CHAT_ID",
    "text": "<b>Test</b>\nHello from TradingView!"
  }'

# Or run the automated test script
chmod +x test-webhook.sh
./test-webhook.sh YOUR_CHAT_ID
```

## TradingView Setup

1. Create an alert on any indicator
2. Set Notification to "Webhook URL"
3. Enter your webhook URL: `https://your-domain.com/tv-webhook`
4. In the Message field, paste:

```json
{
  "chat_id": "123456789",
  "text": "<b>Alert from {{ticker}}</b>\nPrice: {{close}}\nTime: {{time}}"
}
```

5. Create the alert and test it

## Environment Variables

- `TELEGRAM_BOT_TOKEN` - Required. Get from @BotFather
- `DEFAULT_CHAT_ID` - Optional. Your Telegram chat ID
- `SHARED_SECRET` - Optional. Secure your webhook with a secret
- `PORT` - Optional. Server port (default: 3000)

## Get Your Chat ID

Option 1 - After sending message to bot:
```bash
curl "https://api.telegram.org/bot{YOUR_BOT_TOKEN}/getUpdates" | jq '.result[0].message.chat.id'
```

Option 2 - The easier way:
- Send any message to your bot in Telegram
- Look in the response above for `"id": 123456789` (that's your chat ID)

## Common Issues

**"Telegram API error: chat not found"**
- Make sure your chat_id is correct
- Add the bot to your Telegram chat first

**"Unauthorized: secret required"**
- You set SHARED_SECRET but didn't include it in the webhook
- Either add the secret to your TradingView alert or remove SHARED_SECRET from .env

**Connection refused**
- Server isn't running. Check if port 3000 is in use
- Try a different port: `PORT=3001 npm start`

## Production Deployment

1. Use HTTPS (required by TradingView) - use a reverse proxy like nginx or Cloudflare
2. Set `NODE_ENV=production`
3. Set a strong `SHARED_SECRET`
4. Use the provided Dockerfile with docker-compose
5. Monitor logs for any errors

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Check [test-webhook.sh](./test-webhook.sh) for more test examples
- Review [index.js](./index.js) to understand the implementation
