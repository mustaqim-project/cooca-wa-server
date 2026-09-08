const path = require('path');
const fs = require('fs');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const axios = require('axios');

class SessionManager {
    constructor(baseAuthPath = '.baileys_auth', laravelApiUrl = 'http://127.0.0.1:8000', workerToken = 'secret-worker-token') {
        this.baseAuthPath = baseAuthPath;
        this.laravelApiUrl = laravelApiUrl;
        this.workerToken = workerToken;
        this.sessions = new Map(); // sessionId -> sessionData
    }

    getSessionDir(sessionId) {
        return path.join(this.baseAuthPath, `session_${sessionId}`);
    }

    async initSession(sessionId, webhookUrl = null) {
        if (this.sessions.has(sessionId)) {
            const existing = this.sessions.get(sessionId);
            if (existing.status === 'CONNECTED' || existing.status === 'CONNECTING' || existing.status === 'SCAN_QR') {
                return existing;
            }
        }

        const sessionDir = this.getSessionDir(sessionId);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        const sessionData = {
            sessionId,
            sock: null,
            status: 'CONNECTING',
            qrCodeRaw: null,
            qrCodeDataUrl: null,
            user: null,
            webhookUrl: webhookUrl || `${this.laravelApiUrl}/api/wa/webhook`,
            startedAt: new Date(),
        };

        this.sessions.set(sessionId, sessionData);

        try {
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
            const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

            const sock = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                browser: ['Cooca-Gateway', 'Chrome', '1.0.0'],
            });

            sessionData.sock = sock;

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    sessionData.status = 'SCAN_QR';
                    sessionData.qrCodeRaw = qr;
                    try {
                        sessionData.qrCodeDataUrl = await QRCode.toDataURL(qr);
                    } catch (err) {
                        console.error(`[${sessionId}] Failed to render QR DataURL:`, err);
                    }
                    console.log(`[Session ${sessionId}] QR Code generated, ready to scan.`);
                }

                if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    console.log(`[Session ${sessionId}] Connection closed (code ${statusCode}), reconnecting: ${shouldReconnect}`);

                    sessionData.status = 'DISCONNECTED';
                    sessionData.qrCodeRaw = null;
                    sessionData.qrCodeDataUrl = null;

                    if (shouldReconnect) {
                        setTimeout(() => {
                            this.initSession(sessionId, webhookUrl);
                        }, 3000);
                    } else {
                        console.log(`[Session ${sessionId}] Logged out. Cleaning up session directory...`);
                        this.deleteSession(sessionId);
                    }
                } else if (connection === 'open') {
                    console.log(`[Session ${sessionId}] WhatsApp client CONNECTED!`);
                    sessionData.status = 'CONNECTED';
                    sessionData.qrCodeRaw = null;
                    sessionData.qrCodeDataUrl = null;
                    sessionData.user = sock.user || null;
                }
            });

            // Handle Incoming & Outgoing Messages for WA Mobile Sync (Webhook)
            sock.ev.on('messages.upsert', async (m) => {
                if (m.type !== 'notify' && m.type !== 'append') return;
                for (const msg of m.messages) {
                    if (!msg.message) continue;

                    const fromMe = !!msg.key.fromMe;
                    const sender = msg.key.remoteJid;
                    const pushName = msg.pushName || 'Unknown';
                    const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

                    if (!messageText) continue;

                    console.log(`[Session ${sessionId}] Message (${fromMe ? 'fromMe/WA Mobile' : 'incoming'}) with ${sender}: ${messageText}`);

                    const targetWebhook = sessionData.webhookUrl || `${this.targetUrl}/api/v1/wa/webhook`;
                    try {
                        await axios.post(targetWebhook, {
                            session: sessionId,
                            sender: sender,
                            fromMe: fromMe,
                            pushName: pushName,
                            message: messageText,
                            raw: msg
                        }, {
                            headers: { 'Authorization': `Bearer ${this.workerToken}` },
                            timeout: 5000
                        }).catch(() => null);
                    } catch (err) {
                        console.error(`[Session ${sessionId}] Webhook failed:`, err.message);
                    }
                }
            });


            return sessionData;
        } catch (error) {
            console.error(`[Session ${sessionId}] Initialization error:`, error);
            sessionData.status = 'DISCONNECTED';
            throw error;
        }
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }

    getAllSessions() {
        const list = [];
        for (const [id, data] of this.sessions.entries()) {
            list.push({
                sessionId: id,
                status: data.status,
                user: data.user,
                startedAt: data.startedAt,
                hasQr: !!data.qrCodeDataUrl,
            });
        }
        return list;
    }

    async deleteSession(sessionId) {
        const sessionData = this.sessions.get(sessionId);
        if (sessionData && sessionData.sock) {
            try {
                await sessionData.sock.logout().catch(() => { });
                sessionData.sock.end();
            } catch (e) { }
        }

        this.sessions.delete(sessionId);

        const sessionDir = this.getSessionDir(sessionId);
        if (fs.existsSync(sessionDir)) {
            try {
                fs.rmSync(sessionDir, { recursive: true, force: true });
                console.log(`[Session ${sessionId}] Directory removed.`);
            } catch (err) {
                console.error(`[Session ${sessionId}] Error removing dir:`, err.message);
            }
        }
    }

    hasSessionAuth(sessionId) {
        const sessionDir = this.getSessionDir(sessionId);
        try {
            return fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length > 0;
        } catch (e) {
            return false;
        }
    }


    /**
     * Detect Media Type & MIME from URL extension or explicitly provided type
     */
    detectMediaType(url, explicitType, filename) {
        if (explicitType) return explicitType;
        if (!url) return 'text';

        const targetName = (filename || url).split('?')[0].toLowerCase();
        const ext = path.extname(targetName);

        if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
            return 'image';
        }
        if (['.mp4', '.avi', '.mov', '.mkv', '.3gp', '.webm'].includes(ext)) {
            return 'video';
        }
        if (['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.opus'].includes(ext)) {
            return 'audio';
        }
        // Default to document for PDF, DOCX, XLSX, ZIP, etc.
        return 'document';
    }

    getMimeType(url, mediaType, filename) {
        const cleanUrl = (filename || url).split('?')[0].toLowerCase();
        const ext = path.extname(cleanUrl);

        const mimeMap = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            '.zip': 'application/zip',
            '.rar': 'application/x-rar-compressed',
            '.7z': 'application/x-7z-compressed',
            '.txt': 'text/plain',
            '.csv': 'text/csv',
            '.json': 'application/json',
            '.xml': 'application/xml',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.gif': 'image/gif',
            '.mp4': 'video/mp4',
            '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime',
            '.mkv': 'video/x-matroska',
            '.3gp': 'video/3gpp',
            '.mp3': 'audio/mp3',
            '.ogg': 'audio/ogg',
            '.opus': 'audio/ogg; codecs=opus',
            '.wav': 'audio/wav',
            '.m4a': 'audio/mp4',
            '.aac': 'audio/aac',
        };

        return mimeMap[ext] || (mediaType === 'document' ? 'application/octet-stream' : undefined);
    }


    async sendMessage(sessionId, number, message, options = {}) {
        const sessionData = this.getSession(sessionId);
        if (!sessionData || sessionData.status !== 'CONNECTED' || !sessionData.sock) {
            throw new Error(`Session '${sessionId}' is not connected (Status: ${sessionData?.status || 'NOT_FOUND'})`);
        }

        let formattedNumber = number.replace(/\D/g, '');
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.substring(1);
        }
        const jid = formattedNumber + '@s.whatsapp.net';

        const [exists] = await sessionData.sock.onWhatsApp(jid);
        if (!exists || !exists.exists) {
            throw new Error(`Number ${number} is not registered on WhatsApp`);
        }

        let payload = {};
        const mediaUrl = options.mediaUrl || options.url;

        if (mediaUrl) {
            // Pre-check file size & URL reachability (Max 16MB)
            if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
                try {
                    const headRes = await axios.head(mediaUrl, { timeout: 4000 });
                    if (headRes && headRes.headers) {
                        const contentLength = parseInt(headRes.headers['content-length'] || '0', 10);
                        const maxBytes = 16 * 1024 * 1024; // 16MB
                        if (contentLength > maxBytes) {
                            const sizeMb = (contentLength / (1024 * 1024)).toFixed(2);
                            throw new Error(`Ukuran file (${sizeMb} MB) melebihi batas maksimum 16 MB. Pengiriman ditolak.`);
                        }
                    }
                } catch (err) {
                    if (err.message.includes('melebihi batas maksimum')) {
                        throw err;
                    }
                    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || (err.response && err.response.status >= 400)) {
                        const statusInfo = err.response ? `HTTP ${err.response.status}` : (err.code || 'Unreachable');
                        throw new Error(`URL media/file tidak dapat dijangkau (${statusInfo}): Harap gunakan URL publik yang valid dan dapat diakses.`);
                    }
                }
            }

            const mediaType = this.detectMediaType(mediaUrl, options.type, options.filename);


            const mimeType = this.getMimeType(mediaUrl, mediaType, options.filename);
            const fileName = options.filename || path.basename(mediaUrl.split('?')[0]) || 'file';

            if (mediaType === 'image') {
                payload = { image: { url: mediaUrl }, caption: message || '' };
            } else if (mediaType === 'video') {
                payload = { video: { url: mediaUrl }, caption: message || '' };
            } else if (mediaType === 'audio') {
                payload = { audio: { url: mediaUrl }, mimetype: mimeType || 'audio/mp4', ptt: !!options.ptt };
            } else {
                // Document / File (.pdf, .docx, .xlsx, .zip, etc.)
                payload = {
                    document: { url: mediaUrl },
                    fileName: fileName,
                    mimetype: mimeType || 'application/octet-stream',
                    caption: message || ''
                };
            }
        } else if (options.location) {
            payload = { location: options.location };
        } else if (options.vcard) {
            payload = { contacts: { displayName: options.vcard.displayName || 'Contact', contacts: [{ vcard: options.vcard.vcard }] } };
        } else {
            payload = { text: message };
        }

        const result = await sessionData.sock.sendMessage(exists.jid, payload);
        return { jid: exists.jid, result };
    }
}

module.exports = SessionManager;
