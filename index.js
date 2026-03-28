const TelegramBot = require('node-telegram-bot-api');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const fs = require('fs');

const token = process.env.BOT_TOKEN;

if (!token) {
    console.error("BOT TOKEN TIDAK ADA!");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// simpan session per user
const sessions = {};

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    await bot.sendMessage(chatId, '⏳ Menghubungkan WhatsApp...');

    const sessionPath = `session-${chatId}`;

    // 🔥 OPTIONAL: hapus session lama kalau mau paksa QR baru
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        auth: state,
        browser: ['Windows', 'Chrome', '120.0.0'],
        markOnlineOnConnect: false,
        syncFullHistory: false
    });

    sessions[chatId] = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        console.log('UPDATE:', update);

        const { connection, qr, lastDisconnect } = update;

        // ✅ QR muncul
        if (qr) {
            try {
                console.log('✅ QR TERGENERATE');
                const qrImage = await QRCode.toBuffer(qr);

                await bot.sendPhoto(chatId, qrImage, {
                    caption: '📲 Scan QR WhatsApp kamu'
                });
            } catch (err) {
                console.error('❌ Gagal kirim QR:', err);
            }
        }

        // ✅ berhasil connect
        if (connection === 'open') {
            console.log('✅ CONNECTED');
            bot.sendMessage(chatId, '✅ WhatsApp Connected!');
        }

        // ❌ koneksi putus
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;

            console.log('❌ DISCONNECTED:', reason);

            if (reason === DisconnectReason.loggedOut) {
                bot.sendMessage(chatId, '❌ Logout, ketik /start untuk login ulang');
            } else {
                bot.sendMessage(chatId, '⚠️ Koneksi terputus, coba /start lagi');
            }
        }
    });

    // ❌ HAPUS INI (tidak perlu lagi)
    // sock.connect();
});
