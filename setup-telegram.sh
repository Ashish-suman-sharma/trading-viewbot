#!/bin/bash
# Setup Telegram Bot Webhook
# This script helps you connect your Telegram bot to receive messages

echo "🤖 Telegram Bot Webhook Setup"
echo "=============================="
echo ""

# Check if .env exists and has token
if [ -f .env ]; then
    source .env
fi

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "❌ TELEGRAM_BOT_TOKEN not set in .env file"
    echo ""
    echo "Please follow these steps first:"
    echo "1. Open Telegram and search for @BotFather"
    echo "2. Send /newbot"
    echo "3. Choose a name for your bot (e.g., 'My Trading Alerts')"
    echo "4. Choose a username ending in 'bot' (e.g., 'mytradingalerts_bot')"
    echo "5. Copy the token and paste it in .env file"
    exit 1
fi

echo "✅ Bot token found"
echo ""

# Get bot info
echo "📋 Getting bot info..."
BOT_INFO=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe")
BOT_USERNAME=$(echo $BOT_INFO | grep -o '"username":"[^"]*"' | cut -d'"' -f4)

if [ -z "$BOT_USERNAME" ]; then
    echo "❌ Invalid bot token. Please check your TELEGRAM_BOT_TOKEN"
    echo "Response: $BOT_INFO"
    exit 1
fi

echo "✅ Bot: @$BOT_USERNAME"
echo ""

# Ask for webhook URL
echo "Enter your server's public URL (must be HTTPS for production):"
echo "Examples:"
echo "  - https://your-domain.com"
echo "  - https://abc123.ngrok.io (for testing)"
echo ""
read -p "URL: " WEBHOOK_URL

if [ -z "$WEBHOOK_URL" ]; then
    echo "❌ No URL provided"
    exit 1
fi

# Set webhook
FULL_WEBHOOK_URL="${WEBHOOK_URL}/telegram-webhook"
echo ""
echo "🔗 Setting webhook to: $FULL_WEBHOOK_URL"

RESULT=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${FULL_WEBHOOK_URL}")

if echo "$RESULT" | grep -q '"ok":true'; then
    echo "✅ Webhook set successfully!"
    echo ""
    echo "=============================="
    echo "🎉 SETUP COMPLETE!"
    echo "=============================="
    echo ""
    echo "Next steps:"
    echo "1. Start your server: npm start"
    echo "2. Open Telegram and search for @$BOT_USERNAME"
    echo "3. Send /start to the bot"
    echo "4. Your chat ID will be automatically saved!"
    echo ""
    echo "Your bot link: https://t.me/$BOT_USERNAME"
else
    echo "❌ Failed to set webhook"
    echo "Response: $RESULT"
fi
