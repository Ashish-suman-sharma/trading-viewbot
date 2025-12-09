import express from 'express';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import fs from 'fs';

// Load environment variables from .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
let DEFAULT_CHAT_ID = process.env.DEFAULT_CHAT_ID;
const SHARED_SECRET = process.env.SHARED_SECRET;

// File to store chat IDs
const CHAT_IDS_FILE = './chat_ids.json';

// Load saved chat IDs
let savedChatIds = [];
if (fs.existsSync(CHAT_IDS_FILE)) {
  try {
    savedChatIds = JSON.parse(fs.readFileSync(CHAT_IDS_FILE, 'utf8'));
    console.log(`📋 Loaded ${savedChatIds.length} saved chat IDs`);
  } catch (e) {
    savedChatIds = [];
  }
}

// Function to save chat ID
function saveChatId(chatId, username = 'unknown') {
  const exists = savedChatIds.find(c => c.id === chatId);
  if (!exists) {
    savedChatIds.push({ id: chatId, username, addedAt: new Date().toISOString() });
    fs.writeFileSync(CHAT_IDS_FILE, JSON.stringify(savedChatIds, null, 2));
    console.log(`💾 Saved new chat ID: ${chatId} (${username})`);
    
    // Auto-set as default if no default exists
    if (!DEFAULT_CHAT_ID) {
      DEFAULT_CHAT_ID = chatId;
      console.log(`✅ Auto-set DEFAULT_CHAT_ID to: ${chatId}`);
    }
    return true;
  }
  return false;
}

// Function to send Telegram message
async function sendTelegramMessage(chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  return response.json();
}

// Process incoming Telegram message
async function processMessage(message) {
  if (!message || !message.chat) return;
  
  const chatId = String(message.chat.id);
  const username = message.from?.username || message.from?.first_name || 'unknown';
  const text = message.text || '';
  
  console.log(`📩 Message from ${username} (${chatId}): ${text}`);
  
  // Save the chat ID
  const isNew = saveChatId(chatId, username);
  
  // Respond based on command
  if (isNew) {
    await sendTelegramMessage(chatId, 
      `✅ <b>Welcome!</b>\n\n` +
      `Your chat ID: <code>${chatId}</code>\n\n` +
      `You will now receive TradingView alerts here! 🎯`
    );
  } else if (text === '/start') {
    await sendTelegramMessage(chatId,
      `👋 <b>Hello ${username}!</b>\n\n` +
      `Your chat ID: <code>${chatId}</code>\n\n` +
      `✅ You are registered to receive alerts.\n\n` +
      `Commands:\n` +
      `/start - Show this message\n` +
      `/chatid - Get your chat ID\n` +
      `/status - Check bot status`
    );
  } else if (text === '/chatid') {
    await sendTelegramMessage(chatId, `📋 Your chat ID: <code>${chatId}</code>`);
  } else if (text === '/status') {
    await sendTelegramMessage(chatId,
      `🤖 <b>Bot Status</b>\n\n` +
      `✅ Bot is running\n` +
      `📋 Registered users: ${savedChatIds.length}\n` +
      `🔐 Webhook security: ${SHARED_SECRET ? 'Enabled' : 'Disabled'}`
    );
  } else {
    await sendTelegramMessage(chatId, 
      `👋 Hi! I received: "${text}"\n\n` +
      `I'm a TradingView alert bot. Send /start for help.`
    );
  }
}

// Telegram Polling - check for new messages every 2 seconds
let lastUpdateId = 0;

async function pollTelegram() {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`
    );
    const data = await response.json();
    
    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        lastUpdateId = update.update_id;
        if (update.message) {
          await processMessage(update.message);
        }
      }
    }
  } catch (error) {
    console.error('Polling error:', error.message);
  }
  
  // Poll again
  setTimeout(pollTelegram, 1000);
}

// Start polling
console.log('🔄 Starting Telegram polling...');
pollTelegram();

// Validate required env variables
if (!TELEGRAM_BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN environment variable is not set');
  process.exit(1);
}

// Middleware
app.use(express.json({ limit: '10kb' }));

// CORS middleware - Allow requests from any origin
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-webhook-secret');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Simple rate limiter (adjust window and max as needed)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

/**
 * POST /tv-webhook
 * Accepts TradingView webhook alerts and forwards them to Telegram.
 *
 * Expected JSON body:
 * {
 *   "secret": "...",      // optional, or use x-webhook-secret header
 *   "chat_id": "123456",  // optional, uses DEFAULT_CHAT_ID if not provided
 *   "text": "Alert text"  // required
 * }
 */
app.post('/tv-webhook', async (req, res) => {
  try {
    const { body, headers } = req;
    const incomingSecret = body.secret || headers['x-webhook-secret'];

    // Validate shared secret if configured
    if (SHARED_SECRET) {
      if (!incomingSecret) {
        console.warn('🔒 Missing secret in request');
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: secret required',
        });
      }
      if (incomingSecret !== SHARED_SECRET) {
        console.warn('🔒 Invalid secret provided');
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: invalid secret',
        });
      }
    }

    // Extract chat_id and text
    let chatId = body.chat_id || DEFAULT_CHAT_ID;
    let text = body.text;

    if (!chatId) {
      console.warn('⚠️  Missing chat_id and no DEFAULT_CHAT_ID configured');
      return res.status(400).json({
        success: false,
        error: 'Missing chat_id in request and DEFAULT_CHAT_ID not configured',
      });
    }

    if (!text) {
      console.warn('⚠️  Missing text field in webhook body');
      return res.status(400).json({
        success: false,
        error: 'Missing text field in request body',
      });
    }

    // Log incoming request (without sensitive data)
    console.log(`📨 Webhook received - Chat ID: ${chatId}, Message length: ${text.length}`);

    // Send to Telegram
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const telegramPayload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
    };

    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(telegramPayload),
    });

    const telegramResponse = await response.json();

    if (!response.ok) {
      console.error(
        `❌ Telegram API error: ${telegramResponse.description || 'Unknown error'}`
      );
      return res.status(response.status).json({
        success: false,
        error: telegramResponse.description || 'Telegram API error',
        telegramResponse,
      });
    }

    console.log(`✅ Message sent successfully to chat ${chatId}`);
    res.status(200).json({
      success: true,
      message: 'Alert forwarded to Telegram',
      messageId: telegramResponse.result.message_id,
    });
  } catch (error) {
    console.error('❌ Error processing webhook:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
});

/**
 * POST /telegram-webhook
 * Receives messages from Telegram (set this as your bot's webhook)
 * Auto-captures chat IDs when users message the bot
 */
app.post('/telegram-webhook', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (message && message.chat) {
      const chatId = String(message.chat.id);
      const username = message.from?.username || message.from?.first_name || 'unknown';
      const text = message.text || '';
      
      // Save the chat ID
      const isNew = saveChatId(chatId, username);
      
      console.log(`📩 Telegram message from ${username} (${chatId}): ${text.substring(0, 50)}`);
      
      // Send welcome message to new users
      if (isNew) {
        const welcomeText = `✅ <b>Chat ID Saved!</b>\n\nYour chat ID: <code>${chatId}</code>\n\nYou will now receive TradingView alerts here.`;
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: welcomeText, parse_mode: 'HTML' }),
        });
      } else if (text === '/start' || text === '/chatid') {
        // Respond to commands
        const infoText = `📋 <b>Your Info</b>\n\nChat ID: <code>${chatId}</code>\nUsername: @${username}\n\n✅ You are registered to receive alerts.`;
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: infoText, parse_mode: 'HTML' }),
        });
      }
    }
    
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('❌ Error processing Telegram webhook:', error.message);
    res.status(200).json({ ok: true }); // Always return 200 to Telegram
  }
});

/**
 * GET /chat-ids
 * View all registered chat IDs
 */
app.get('/chat-ids', (req, res) => {
  res.status(200).json({
    count: savedChatIds.length,
    defaultChatId: DEFAULT_CHAT_ID || null,
    chatIds: savedChatIds,
  });
});

/**
 * POST /broadcast
 * Send a message to all registered chat IDs
 */
app.post('/broadcast', async (req, res) => {
  try {
    const { text, secret } = req.body;
    
    // Validate secret
    if (SHARED_SECRET && secret !== SHARED_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    if (!text) {
      return res.status(400).json({ success: false, error: 'Missing text' });
    }
    
    const results = [];
    for (const chat of savedChatIds) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chat.id, text, parse_mode: 'HTML' }),
        });
        const data = await response.json();
        results.push({ chatId: chat.id, success: data.ok });
      } catch (e) {
        results.push({ chatId: chat.id, success: false, error: e.message });
      }
    }
    
    res.status(200).json({ success: true, sent: results.length, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    registeredChats: savedChatIds.length,
    defaultChatId: DEFAULT_CHAT_ID || null,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found. Use POST /tv-webhook to send alerts.',
  });
});

// Self-ping to keep the server alive on free hosting (Render, etc.)
const RENDER_URL = process.env.RENDER_EXTERNAL_URL; // Auto-set by Render
const SELF_PING_INTERVAL = 10 * 60 * 1000; // 10 minutes

function keepAlive() {
  if (RENDER_URL) {
    fetch(`${RENDER_URL}/health`)
      .then(res => res.json())
      .then(data => console.log(`🏓 Self-ping successful: ${data.status}`))
      .catch(err => console.error('🏓 Self-ping failed:', err.message));
  }
}

// Start self-ping after server starts (only in production on Render)
if (RENDER_URL) {
  setInterval(keepAlive, SELF_PING_INTERVAL);
  console.log(`🏓 Self-ping enabled: every 10 minutes to ${RENDER_URL}/health`);
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TradingView Webhook Server running on port ${PORT}`);
  console.log(`📍 POST ${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://your-domain/tv-webhook`);
  console.log(`📍 Telegram Bot Webhook: /telegram-webhook`);
  console.log(`✅ TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN ? 'configured' : '❌ NOT SET'}`);
  console.log(`✅ DEFAULT_CHAT_ID: ${DEFAULT_CHAT_ID || 'will auto-set when first user messages bot'}`);
  console.log(`✅ SHARED_SECRET: ${SHARED_SECRET ? 'enabled' : 'disabled'}`);
  console.log(`📋 Registered chat IDs: ${savedChatIds.length}`);
  if (RENDER_URL) {
    console.log(`🌐 Render URL: ${RENDER_URL}`);
    console.log(`🏓 Keep-alive ping: enabled (every 10 minutes)`);
  }
});
