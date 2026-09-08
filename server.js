const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Otomatis baca file .env utama Laravel jika ada, fallback ke .env lokal
const rootEnvPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
} else {
    dotenv.config();
}

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const SessionManager = require('./SessionManager');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const LARAVEL_API_URL = process.env.LARAVEL_API_URL || process.env.APP_URL || 'http://127.0.0.1:8000';
const WA_WORKER_TOKEN = process.env.WA_WORKER_TOKEN || 'secret-worker-token';
const PORT = process.env.PORT || process.env.WA_SERVER_PORT || 3000;
const AUTH_DIR = process.env.AUTH_DIR || path.resolve(__dirname, '.baileys_auth');

const manager = new SessionManager(AUTH_DIR, LARAVEL_API_URL, WA_WORKER_TOKEN);

// Auto-start default session jika folder auth ada
manager.initSession('default').catch(err => {
    console.log('[Server Init] Default session init skipped/failed:', err.message);
});

// Middleware CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-device-token, x-worker-token');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Security: Token Authentication Middleware for API endpoints
app.use((req, res, next) => {
    // Selalu izinkan health check dan info publik tanpa token
    if (req.path === '/' || req.path === '/health') {
        return next();
    }

    // Jika worker token belum diatur atau masih default di lingkungan development, izinkan
    if (!WA_WORKER_TOKEN || WA_WORKER_TOKEN === 'secret-worker-token') {
        return next();
    }

    const authHeader = req.headers['authorization'];
    const customHeader = req.headers['x-worker-token'] || req.headers['x-device-token'];
    const bearerToken = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.slice(7) : null;
    const bodyToken = req.body?.token;
    const queryToken = req.query?.token;

    const providedToken = bearerToken || customHeader || bodyToken || queryToken;

    if (!providedToken || providedToken !== WA_WORKER_TOKEN) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized: Missing or invalid worker token'
        });
    }

    next();
});

// Health check endpoint for Render & monitoring
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        activeSessions: manager.getAllSessions().length
    });
});

// 1. General Server Info
app.get('/', (req, res) => {
    res.json({
        name: 'COOCA-ID Multi-Account WhatsApp Gateway (Production Ready)',
        status: 'online',
        port: PORT,
        activeSessions: manager.getAllSessions().length,
        laravelTarget: LARAVEL_API_URL,
    });
});

// 2. List All Active Sessions
app.get('/api/sessions', (req, res) => {
    res.json({
        success: true,
        sessions: manager.getAllSessions()
    });
});

// 3. Start / Initialize Session
app.post('/api/sessions/start', async (req, res) => {
    const sessionId = req.body.sessionId || req.body.session || 'default';
    const webhookUrl = req.body.webhookUrl || null;

    try {
        const sessionData = await manager.initSession(sessionId, webhookUrl);
        res.json({
            success: true,
            sessionId: sessionId,
            status: sessionData.status,
            message: `Session '${sessionId}' initialization triggered.`
        });
    } catch (err) {
        console.error(`[Start Session Error - ${sessionId}]`, err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Get Session Status
app.get('/api/sessions/:sessionId/status', async (req, res) => {
    const { sessionId } = req.params;
    let sessionData = manager.getSession(sessionId);

    if (!sessionData && manager.hasSessionAuth(sessionId)) {
        try {
            sessionData = await manager.initSession(sessionId);
        } catch (e) {}
    }

    if (!sessionData) {
        return res.json({
            success: false,
            sessionId: sessionId,
            status: 'disconnected',
            message: `Session '${sessionId}' not found in active memory.`
        });
    }

    res.json({
        success: true,
        sessionId: sessionId,
        status: sessionData.status,
        user: sessionData.user,
        startedAt: sessionData.startedAt,
    });
});

function renderQrHtmlUi(sessionId, sessionData) {
    const status = sessionData?.status || 'CONNECTING';
    const qrDataUrl = sessionData?.qrCodeDataUrl;
    const phone = sessionData?.user?.id ? sessionData.user.id.split(':')[0] : null;

    let contentHtml = '';
    if (status === 'CONNECTED') {
        contentHtml = `
            <div class="status-card success">
                <div class="icon-circle success">✓</div>
                <h3 style="font-size: 20px; font-weight: 700; color: #F8FAFC;">WhatsApp Terhubung!</h3>
                <p class="phone-number">${phone ? '+' + phone : 'Sesi Aktif'}</p>
                <p class="subtext">Koneksi gateway telah aktif dan siap menerima request pengiriman API.</p>
            </div>
        `;
    } else if (qrDataUrl) {
        contentHtml = `
            <div class="qr-box">
                <img src="${qrDataUrl}" alt="Scan QR Code" />
            </div>
            <div class="instructions">
                <p>1. Buka aplikasi <strong>WhatsApp</strong> di HP Anda</p>
                <p>2. Ketuk <strong>Menu (⋮) / Pengaturan</strong> &gt; <strong>Perangkat Tertaut</strong></p>
                <p>3. Arahkan kamera HP ke kode QR di atas</p>
            </div>
            <p class="live-polling">⚡ Otomatis mendeteksi hasil scan secara realtime...</p>
        `;
    } else {
        contentHtml = `
            <div class="status-card loading">
                <div class="spinner"></div>
                <h3 style="font-size: 16px; font-weight: 600; color: #CBD5E1;">Memuat Barcode QR...</h3>
                <p class="subtext">Menginisialisasi socket Baileys WhatsApp Gateway</p>
            </div>
        `;
    }

    return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Gateway QR Viewer — ${sessionId}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        body { background: #0F172A; color: #F8FAFC; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: #1E293B; border: 1px solid #334155; border-radius: 20px; padding: 32px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
        .brand { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 20px; }
        .brand-icon { width: 44px; height: 44px; border-radius: 12px; background: #25D366; color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; }
        .brand-title { font-size: 18px; font-weight: 700; color: #F8FAFC; text-align: left; }
        .brand-sub { font-size: 12px; color: #94A3B8; font-family: monospace; text-align: left; }
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 20px; }
        .badge-connected { background: rgba(16, 185, 129, 0.15); color: #34D399; border: 1px solid rgba(16, 185, 129, 0.3); }
        .badge-scan { background: rgba(245, 158, 11, 0.15); color: #FBBF24; border: 1px solid rgba(245, 158, 11, 0.3); }
        .badge-connecting { background: rgba(99, 102, 241, 0.15); color: #818CF8; border: 1px solid rgba(99, 102, 241, 0.3); }
        .qr-box { background: white; padding: 16px; border-radius: 16px; display: inline-block; box-shadow: 0 8px 24px rgba(0,0,0,0.2); margin-bottom: 20px; }
        .qr-box img { width: 240px; height: 240px; display: block; border-radius: 8px; }
        .instructions { background: #0F172A; border-radius: 12px; padding: 16px; text-align: left; font-size: 13px; color: #CBD5E1; line-height: 1.6; margin-bottom: 16px; border: 1px solid #334155; }
        .instructions p { margin-bottom: 6px; }
        .instructions p:last-child { margin-bottom: 0; }
        .live-polling { font-size: 12px; color: #34D399; font-weight: 500; }
        .status-card { padding: 20px 10px; }
        .icon-circle { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 16px auto; }
        .icon-circle.success { background: #10B981; color: white; box-shadow: 0 0 20px rgba(16, 185, 129, 0.4); }
        .phone-number { font-size: 20px; font-weight: 700; color: #34D399; margin: 8px 0; font-family: monospace; }
        .subtext { font-size: 13px; color: #94A3B8; margin-top: 8px; line-height: 1.5; }
        .spinner { width: 40px; height: 40px; border: 4px solid #334155; border-top: 4px solid #34D399; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
    <script>
        setTimeout(function() { window.location.reload(); }, 4000);
    </script>
</head>
<body>
    <div class="card">
        <div class="brand">
            <div class="brand-icon"><i class="fa-brands fa-whatsapp"></i></div>
            <div>
                <div class="brand-title">COOCA WhatsApp Gateway</div>
                <div class="brand-sub">${sessionId}</div>
            </div>
        </div>
        <div class="badge ${status === 'CONNECTED' ? 'badge-connected' : 'badge-scan'}">
            <i class="fa-solid ${status === 'CONNECTED' ? 'fa-check' : 'fa-qrcode'}"></i> Status: ${status}
        </div>
        ${contentHtml}
    </div>
</body>
</html>`;
}

// 5. Get Session QR Code Data (JSON Base64 & Raw, or HTML UI if requested via browser)
app.get('/api/sessions/:sessionId/qr', async (req, res) => {
    const { sessionId } = req.params;
    let sessionData = manager.getSession(sessionId);

    if (!sessionData && manager.hasSessionAuth(sessionId)) {
        try {
            sessionData = await manager.initSession(sessionId);
        } catch (e) {}
    }

    // If request comes from browser HTML navigation, serve HTML UI
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/html') || req.query.view === 'html') {
        return res.send(renderQrHtmlUi(sessionId, sessionData));
    }

    if (!sessionData) {
        return res.status(404).json({ success: false, error: `Session '${sessionId}' not found.` });
    }

    res.json({
        success: true,
        sessionId: sessionId,
        status: sessionData.status,
        qrDataUrl: sessionData.qrCodeDataUrl,
        qrRaw: sessionData.qrCodeRaw
    });
});

// HTML QR Viewer Helper for simple scanning
app.get('/api/sessions/:sessionId/qr/view', (req, res) => {
    const { sessionId } = req.params;
    const sessionData = manager.getSession(sessionId);
    res.send(renderQrHtmlUi(sessionId, sessionData));
});


// 6. Delete / Stop Session
app.delete('/api/sessions/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    await manager.deleteSession(sessionId);
    res.json({ success: true, message: `Session '${sessionId}' has been deleted and disconnected.` });
});

// 7. Send Message & Files API (Fonnte-style compatible & All Media Types)
// Accepts: { session / token, target / number, message, url / mediaUrl, filename, type, ptt, location, vcard }
app.post('/send-message', async (req, res) => {
    const sessionId = req.body.session || req.headers['x-device-token'] || 'default';
    const number = req.body.target || req.body.number || req.body.phone;
    const message = req.body.message || req.body.text;
    const mediaUrl = req.body.url || req.body.mediaUrl || req.body.file;
    const filename = req.body.filename || req.body.file_name;
    const type = req.body.type;
    const ptt = req.body.ptt;
    const location = req.body.location;
    const vcard = req.body.vcard;

    if (!number || (!message && !mediaUrl && !location && !vcard)) {
        return res.status(400).json({ success: false, error: 'Missing required parameters: target (phone number) and message/url/file.' });
    }

    try {
        const result = await manager.sendMessage(sessionId, number, message, {
            mediaUrl,
            filename,
            type,
            ptt,
            location,
            vcard
        });
        res.json({
            success: true,
            sessionId: sessionId,
            target: number,
            result: result
        });
    } catch (err) {
        console.error(`[Send Message Error - ${sessionId}]`, err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Alias endpoint /send for backwards compatibility
app.post('/send', (req, res) => {
    req.url = '/send-message';
    app.handle(req, res);
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`===================================================`);
    console.log(`COOCA-ID WhatsApp Gateway Running on Port ${PORT}`);
    console.log(`Target Laravel API URL: ${LARAVEL_API_URL}`);
    console.log(`Auth Directory: ${AUTH_DIR}`);
    console.log(`===================================================`);
});

// Graceful shutdown handling for Render and container environments
const handleShutdown = async (signal) => {
    console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
        console.log('[Server] HTTP server closed.');
    });
    for (const [sessionId, session] of manager.sessions.entries()) {
        if (session && session.sock) {
            try {
                session.sock.end(undefined);
            } catch (e) {}
        }
    }
    setTimeout(() => process.exit(0), 1000);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    console.error('[Server Unhandled Rejection]', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Server Uncaught Exception]', err);
});

