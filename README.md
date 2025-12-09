# TradingView Webhook to Telegram Bot

Forward TradingView webhook alerts directly to Telegram using a Telegram bot. This project provides a lightweight Node.js/Express server that receives TradingView alerts and forwards them as Telegram messages.

## Features

- ✅ Simple HTTP webhook endpoint for TradingView alerts
- 🔐 Optional shared secret authentication (header or JSON body)
- 📨 HTML-formatted Telegram messages
- ⚡ Express.js server with rate limiting
- 🐳 Docker support with multi-stage build
- 📝 Detailed logging of requests and responses
- 🛡️ Input validation and error handling
- 🔍 Health check endpoint

## Tech Stack

- **Node.js** v18+
- **Express.js** - HTTP server
- **dotenv** - Environment variable management
- **express-rate-limit** - Rate limiting middleware
- **Telegram Bot API** - Using native `fetch`

## Prerequisites

1. **Telegram Bot Token** - Get from [@BotFather](https://t.me/botfather)
2. **Chat ID** - Get your Telegram chat ID (see below)
3. **Node.js** v18+ (for local development)
4. **Docker** (optional, for containerized deployment)

## Setup

### 1. Get Your Telegram Bot Token

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` and follow the prompts
3. Copy your bot token (e.g., `123456789:ABCdefGHIjklmnoPQRstuvwxyz`)

### 2. Get Your Chat ID

Run the provided test command after server is running to find your chat ID, or:
- Send a message to your bot in Telegram
- Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
- Find your `chat.id` in the JSON response

### 3. Configure Environment

```bash
# Clone and install
git clone <repo>
cd trading-viewbot
npm install

# Copy example env and edit
cp .env.example .env
# Edit .env with your values:
# - TELEGRAM_BOT_TOKEN
# - DEFAULT_CHAT_ID (or leave empty and pass in each webhook)
# - SHARED_SECRET (optional)
```

### 4. Run Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3000` by default.

## API Endpoint

### POST `/tv-webhook`

Send TradingView webhook alerts to this endpoint.

**Request Body (JSON):**
```json
{
  "secret": "your_shared_secret",     // optional (if SHARED_SECRET configured)
  "chat_id": "123456789",             // optional (uses DEFAULT_CHAT_ID if not provided)
  "text": "Alert message with HTML"   // required
}
```

**Alternative: Secret in Header**
```
POST /tv-webhook
x-webhook-secret: your_shared_secret
Content-Type: application/json

{
  "chat_id": "123456789",
  "text": "Alert message"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Alert forwarded to Telegram",
  "messageId": 12345
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Error description"
}
```

## TradingView Integration

### Step 1: Create an Alert in TradingView

1. Open TradingView chart and select an indicator (e.g., Supertrend)
2. Right-click indicator → Add Alert
3. Configure condition (e.g., "Supertrend crosses above")

### Step 2: Set Webhook URL

In the alert dialog:
- **Notification Type:** Webhook URL
- **URL:** `https://your-domain.com/tv-webhook` (HTTPS required by TradingView)

### Step 3: Configure Message

In the **Message** field, paste one of the examples below.

#### Example: Supertrend Crossover Alert (UP)

```json
{
  "chat_id": "123456789",
  "text": "<b>🚀 BUY SIGNAL</b>\n<b>Symbol:</b> {{ticker}}\n<b>Price:</b> {{close}}\n<b>Time:</b> {{time}}\n<b>Indicator:</b> Supertrend Breakout UP"
}
```

#### Example: Supertrend Crossover Alert (DOWN)

```json
{
  "chat_id": "123456789",
  "text": "<b>🔴 SELL SIGNAL</b>\n<b>Symbol:</b> {{ticker}}\n<b>Price:</b> {{close}}\n<b>Time:</b> {{time}}\n<b>Indicator:</b> Supertrend Breakdown DOWN"
}
```

**TradingView Placeholders:**
- `{{ticker}}` - Symbol (e.g., EURUSD)
- `{{close}}` - Current close price
- `{{open}}` - Current open price
- `{{high}}` - Current high
- `{{low}}` - Current low
- `{{volume}}` - Current volume
- `{{time}}` - Alert time (server time)
- `{{exchange}}` - Exchange name

## Testing

### Test 1: Without Secret

```bash
curl -X POST http://localhost:3000/tv-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": "YOUR_CHAT_ID",
    "text": "<b>Test Alert</b>\nPrice: 1.0950"
  }'
```

### Test 2: With Secret in JSON Body

```bash
curl -X POST http://localhost:3000/tv-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "your_shared_secret",
    "chat_id": "YOUR_CHAT_ID",
    "text": "<b>Test Alert</b>\nPrice: 1.0950"
  }'
```

### Test 3: With Secret in Header

```bash
curl -X POST http://localhost:3000/tv-webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your_shared_secret" \
  -d '{
    "chat_id": "YOUR_CHAT_ID",
    "text": "<b>Test Alert</b>\nPrice: 1.0950"
  }'
```

### Test 4: Using DEFAULT_CHAT_ID (no chat_id in request)

```bash
curl -X POST http://localhost:3000/tv-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "text": "<b>Alert</b>\nUsing default chat ID"
  }'
```

### Test 5: Health Check

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"2025-01-15T..."}
```

## Docker Deployment

### Build Image

```bash
docker build -t trading-viewbot:latest .
```

### Run Container

```bash
docker run -d \
  --name trading-viewbot \
  -p 3000:3000 \
  --env-file .env \
  trading-viewbot:latest
```

### Docker Compose (Optional)

```yaml
version: '3.8'
services:
  bot:
    build: .
    ports:
      - "3000:3000"
    env_file: .env
    restart: unless-stopped
```

## Security Considerations

### HTTPS Requirement

TradingView requires HTTPS webhooks. When deploying:
- Use a reverse proxy (nginx, Cloudflare, AWS ALB) to handle TLS
- Set `NODE_ENV=production` in .env
- Do not expose HTTP directly to the internet

### Shared Secret

- Always set `SHARED_SECRET` in production
- Use a strong random string (e.g., `openssl rand -hex 32`)
- TradingView will send this in the webhook request

### Rate Limiting

Default: 30 requests/minute per IP. Adjust in `index.js`:
```javascript
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // Time window
  max: 30,                  // Max requests
});
```

### Logging

- Bot token is never logged
- Secrets are never logged in full
- Only message lengths and chat IDs are logged

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ Yes | - | Bot token from @BotFather |
| `DEFAULT_CHAT_ID` | ❌ No | - | Default Telegram chat ID |
| `SHARED_SECRET` | ❌ No | - | Webhook authentication secret |
| `PORT` | ❌ No | 3000 | Server port |
| `NODE_ENV` | ❌ No | development | Environment (development/production) |

## Troubleshooting

### "Unauthorized: secret required"
- The `SHARED_SECRET` is configured but not provided in the webhook request
- Add `secret` field to JSON or `x-webhook-secret` header

### "Missing chat_id and no DEFAULT_CHAT_ID configured"
- Include `chat_id` in request body or set `DEFAULT_CHAT_ID` in .env

### "Telegram API error: Bad Request: chat not found"
- The `chat_id` is invalid or the bot hasn't been added to the chat
- Verify the chat ID is correct
- Add the bot to your Telegram chat first

### "Connection refused" on health check
- Server may not be running; check logs
- Ensure port is correct in .env

## License

MIT

## Support

For issues or questions:
1. Check the troubleshooting section
2. Verify all environment variables are set correctly
3. Check server logs for detailed error messages