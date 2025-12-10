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

// Store request logs in memory (last 100 requests)
const requestLogs = [];
const MAX_LOGS = 100;

function addLog(type, data) {
  const log = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    type,
    ...data
  };
  requestLogs.unshift(log); // Add to beginning
  if (requestLogs.length > MAX_LOGS) {
    requestLogs.pop(); // Remove oldest
  }
  console.log(`📝 Log: ${type} - ${JSON.stringify(data)}`);
  return log;
}

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
app.use(express.text({ limit: '10kb', type: '*/*' })); // Accept plain text from TradingView

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

// Log all incoming requests
app.use((req, res, next) => {
  if (req.method !== 'OPTIONS' && !req.path.includes('/logs') && !req.path.includes('/health')) {
    addLog('REQUEST', {
      method: req.method,
      path: req.path,
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent']?.substring(0, 50) || 'unknown',
      body: req.method === 'POST' ? JSON.stringify(req.body).substring(0, 500) : null
    });
  }
  next();
});

// Serve logs page HTML
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>TradingView Bot - Live Logs</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Monaco', 'Consolas', monospace; background: #0d1117; color: #c9d1d9; padding: 20px; }
    h1 { color: #58a6ff; margin-bottom: 10px; font-size: 24px; }
    .subtitle { color: #8b949e; margin-bottom: 20px; }
    .stats { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
    .stat { background: #161b22; padding: 15px 20px; border-radius: 8px; border: 1px solid #30363d; }
    .stat-value { font-size: 24px; color: #58a6ff; font-weight: bold; }
    .stat-label { color: #8b949e; font-size: 12px; }
    .controls { margin-bottom: 20px; display: flex; gap: 10px; flex-wrap: wrap; }
    button { padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
    .btn-refresh { background: #238636; color: white; }
    .btn-clear { background: #da3633; color: white; }
    .btn-test { background: #1f6feb; color: white; }
    .auto-refresh { display: flex; align-items: center; gap: 10px; color: #8b949e; }
    .logs { background: #161b22; border-radius: 8px; border: 1px solid #30363d; overflow: hidden; }
    .log-header { background: #21262d; padding: 10px 15px; border-bottom: 1px solid #30363d; font-weight: bold; }
    .log-list { max-height: 500px; overflow-y: auto; }
    .log-item { padding: 12px 15px; border-bottom: 1px solid #21262d; }
    .log-item:hover { background: #1c2128; }
    .log-time { color: #8b949e; font-size: 12px; }
    .log-type { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-left: 10px; }
    .log-type.REQUEST { background: #1f6feb; color: white; }
    .log-type.WEBHOOK { background: #238636; color: white; }
    .log-type.ERROR { background: #da3633; color: white; }
    .log-type.TELEGRAM { background: #8957e5; color: white; }
    .log-body { margin-top: 8px; background: #0d1117; padding: 10px; border-radius: 4px; font-size: 12px; word-break: break-all; }
    .no-logs { padding: 40px; text-align: center; color: #8b949e; }
    .live-dot { display: inline-block; width: 8px; height: 8px; background: #238636; border-radius: 50%; margin-right: 8px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .webhook-url { background: #161b22; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #30363d; }
    .webhook-url code { background: #0d1117; padding: 8px 12px; border-radius: 4px; display: block; margin-top: 8px; color: #7ee787; word-break: break-all; }
  </style>
</head>
<body>
  <h1>📡 TradingView Bot - Live Logs</h1>
  <p class="subtitle"><span class="live-dot"></span>Real-time request monitoring</p>
  
  <div class="webhook-url">
    <strong>📍 Your Webhook URL:</strong>
    <code>https://trading-viewbot.onrender.com/tv-webhook</code>
  </div>
  
  <div class="stats">
    <div class="stat">
      <div class="stat-value" id="totalLogs">0</div>
      <div class="stat-label">Total Requests</div>
    </div>
    <div class="stat">
      <div class="stat-value" id="webhookCount">0</div>
      <div class="stat-label">Webhooks</div>
    </div>
    <div class="stat">
      <div class="stat-value" id="telegramCount">0</div>
      <div class="stat-label">Telegram Sent</div>
    </div>
  </div>
  
  <div class="controls">
    <button class="btn-refresh" onclick="fetchLogs()">🔄 Refresh</button>
    <button class="btn-test" onclick="sendTest()">📤 Send Test</button>
    <div class="auto-refresh">
      <input type="checkbox" id="autoRefresh" checked onchange="toggleAutoRefresh()">
      <label for="autoRefresh">Auto-refresh (3s)</label>
    </div>
  </div>
  
  <div class="logs">
    <div class="log-header">📋 Request Logs (Last 100)</div>
    <div class="log-list" id="logList">
      <div class="no-logs">Loading logs...</div>
    </div>
  </div>

  <script>
    let autoRefreshInterval;
    
    async function fetchLogs() {
      try {
        const res = await fetch('/logs');
        const data = await res.json();
        
        document.getElementById('totalLogs').textContent = data.total;
        document.getElementById('webhookCount').textContent = data.logs.filter(l => l.path?.includes('webhook')).length;
        document.getElementById('telegramCount').textContent = data.logs.filter(l => l.type === 'TELEGRAM').length;
        
        const logList = document.getElementById('logList');
        if (data.logs.length === 0) {
          logList.innerHTML = '<div class="no-logs">No requests yet. Waiting for TradingView webhooks...</div>';
          return;
        }
        
        logList.innerHTML = data.logs.map(log => \`
          <div class="log-item">
            <span class="log-time">\${new Date(log.timestamp).toLocaleString()}</span>
            <span class="log-type \${log.type}">\${log.type}</span>
            <strong>\${log.method || ''} \${log.path || ''}</strong>
            \${log.body ? \`<div class="log-body">\${log.body}</div>\` : ''}
            \${log.message ? \`<div class="log-body">\${log.message}</div>\` : ''}
          </div>
        \`).join('');
      } catch (e) {
        console.error('Error fetching logs:', e);
      }
    }
    
    async function sendTest() {
      try {
        const res = await fetch('/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: '🧪 Test message from log viewer!\\n⏰ ' + new Date().toLocaleString(),
            secret: 'tv_webhook_secret_x7k9m2p4q8r1s5t3'
          })
        });
        const data = await res.json();
        alert(data.success ? '✅ Test sent!' : '❌ Failed: ' + data.error);
        fetchLogs();
      } catch (e) {
        alert('❌ Error: ' + e.message);
      }
    }
    
    function toggleAutoRefresh() {
      if (document.getElementById('autoRefresh').checked) {
        autoRefreshInterval = setInterval(fetchLogs, 3000);
      } else {
        clearInterval(autoRefreshInterval);
      }
    }
    
    // Initial load
    fetchLogs();
    toggleAutoRefresh();
  </script>
</body>
</html>
  `);
});

// API endpoint to get logs
app.get('/logs', (req, res) => {
  res.json({
    total: requestLogs.length,
    logs: requestLogs
  });
});

/**
 * Webhook handler function
 * Accepts TradingView webhook alerts and forwards them to ALL Telegram users.
 * No security - accepts any message!
 *
 * Accepts: JSON body with "text" field, OR plain text body
 */
async function handleWebhook(req, res) {
  try {
    const { body, headers } = req;
    
    // Log raw request for debugging
    addLog('WEBHOOK', {
      message: 'Webhook received',
      contentType: headers['content-type'],
      rawBody: typeof body === 'string' ? body : JSON.stringify(body),
      bodyType: typeof body
    });

    // Extract text - handle both JSON and plain text
    let text;
    if (typeof body === 'string') {
      // Plain text body
      text = body;
    } else if (body && typeof body === 'object') {
      // JSON body - try to get text field, or convert whole body to string
      text = body.text || body.message || body.alert || JSON.stringify(body);
    } else {
      text = String(body);
    }

    // If text is empty or just "{}", treat as no message
    if (!text || text === '{}' || text === '""') {
      addLog('ERROR', { message: 'Empty or invalid message received' });
      return res.status(400).json({
        success: false,
        error: 'No message content received',
      });
    }

    console.log(`📨 Webhook received - Message: ${text.substring(0, 100)}`);

    // Send to ALL registered users
    const results = [];
    for (const chat of savedChatIds) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chat.id, 
            text: text, 
            parse_mode: 'HTML' 
          }),
        });
        const data = await response.json();
        results.push({ chatId: chat.id, success: data.ok });
        if (data.ok) {
          addLog('TELEGRAM', { message: `✅ Sent to ${chat.username} (${chat.id})` });
        }
      } catch (e) {
        results.push({ chatId: chat.id, success: false, error: e.message });
        addLog('ERROR', { message: `Failed to send to ${chat.id}: ${e.message}` });
      }
    }

    console.log(`✅ Message sent to ${results.filter(r => r.success).length}/${savedChatIds.length} users`);
    res.status(200).json({
      success: true,
      message: 'Alert forwarded to Telegram',
      sent: results.filter(r => r.success).length,
      total: savedChatIds.length,
      results
    });
  } catch (error) {
    addLog('ERROR', { message: `Webhook error: ${error.message}` });
    console.error('❌ Error processing webhook:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
}

// Handle POST to /tv-webhook
app.post('/tv-webhook', handleWebhook);

// Also handle POST to / (root) for TradingView webhooks
app.post('/', handleWebhook);

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
 * NO SECRET REQUIRED
 */
app.post('/broadcast', async (req, res) => {
  try {
    const { text } = req.body;
    
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
