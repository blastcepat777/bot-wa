const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- SERVER KEEP ALIVE (WAJIB UNTUK RAILWAY) ---
const app = express();
app.get('/', (req, res) => res.send('NINJA STORM ENGINE ACTIVE 24/7'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

let sock;
let currentMethod = null;
let userState = {};

// Helper untuk hapus folder sesi
function clearSession() {
    if (fs.existsSync('./session_data')) {
        fs.rmSync('./session_data', { recursive: true, force: true });
        return true;
    }
    return false;
}

async function initWA(chatId, method, phoneNumber = null, msgId = null) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    currentMethod = method;

    if (sock) { try { sock.end(); } catch (e) {} }

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr && currentMethod === 'QR' && msgId) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 8 });
                await bot.editMessageMedia({
                    type: 'photo',
                    media: buffer,
                    caption: `📸 **SCAN QR SEKARANG**\nUpdate: ${new Date().toLocaleTimeString()}`,
                    parse_mode: 'Markdown'
                }, {
                    chat_id: chatId,
                    message_id: msgId,
                    reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu_del' }]] }
                });
            } catch (err) {}
        }

        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG!**");
            if (msgId) bot.deleteMessage(chatId, msgId).catch(() => {});
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            if (shouldReconnect && currentMethod !== 'RESTARTING') {
                initWA(chatId, method, phoneNumber, msgId);
            }
        }
    });

    if (method === 'CODE' && phoneNumber && msgId) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
                await bot.editMessageText(`🔑 **KODE PAIRING ANDA:**\n\n\`${code}\`\n\nMasukkan di HP Anda.`, {
                    chat_id: chatId,
                    message_id: msgId,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu' }]] }
                });
            } catch (e) {
                bot.editMessageText("❌ Gagal. Gunakan /restart.", { chat_id: chatId, message_id: msgId });
            }
        }, 5000);
    }
}

// --- COMMANDS ---

bot.onText(/\/restart/, async (msg) => {
    currentMethod = 'RESTARTING';
    await bot.sendMessage(msg.chat.id, "♻️ **RESTARTING ENGINE...**\nMenghapus sesi dan memulai ulang koneksi.");
    
    if (sock) {
        sock.ev.removeAllListeners('connection.update');
        sock.end();
    }

    setTimeout(() => {
        clearSession();
        // Alih-alih process.exit(0) (yang bikin 'Completed'), kita lempar error
        // Agar Railway mendeteksi 'Crash' dan melakukan restart otomatis 24 jam.
        console.log("Triggering auto-restart...");
        throw new Error("Manual Restart Triggered - Keeping Railway Alive");
    }, 2000);
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "Pilih metode login:", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📸 QR Scan", callback_data: 'l_qr' }],
                [{ text: "🔑 Pairing Code", callback_data: 'l_cd' }]
            ]
        }
    });
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === 'l_qr') {
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        const p = await bot.sendPhoto(chatId, 'https://placehold.jp/40/333333/ffffff/400x400.png?text=Generating%20QR...', {
            caption: "⏳ Menyiapkan QR...",
            reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu_del' }]] }
        });
        initWA(chatId, 'QR', null, p.message_id);
    }

    if (q.data === 'l_cd') {
        userState[chatId] = { step: 'NUM', msgId: msgId };
        bot.editMessageText("📞 **Masukkan Nomor (628xxx):**", {
            chat_id: chatId,
            message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu' }]] }
        });
    }
    
    // Logika callback lainnya...
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId]?.step === 'NUM' && msg.text && !msg.text.startsWith('/')) {
        const targetId = userState[chatId].msgId;
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        bot.editMessageText("⏳ **Meminta kode...**", { chat_id: chatId, message_id: targetId });
        initWA(chatId, 'CODE', msg.text, targetId);
        delete userState[chatId];
    }
});
