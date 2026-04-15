const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- SERVER ---
const app = express();
app.listen(process.env.PORT || 3000);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let sock;
let isProcessing = false;
let userState = {};

async function initWA(chatId, method, phoneNumber = null) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Mac OS", "Safari", "17.1"], 
        syncFullHistory: false,
        markOnlineOnConnect: true,
        // OPTIMASI KONEKSI EKSTRIM
        maxRetries: 5,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 15000,
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
        const { connection, lastDisconnect, qr } = u;
        if (qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            bot.sendPhoto(chatId, buffer, { caption: "📸 Scan QR Ini" });
        }
        if (connection === 'open') bot.sendMessage(chatId, "✅ **NINJA SYSTEM ONLINE - SIAP MELEDAK!**");
        if (connection === 'close') {
            if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) initWA(chatId, method, phoneNumber);
        }
    });

    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                bot.sendMessage(chatId, `🔑 **KODE PAIRING:** \`${code}\``, { parse_mode: 'Markdown' });
            } catch (err) { bot.sendMessage(chatId, "❌ Gagal pairing."); }
        }, 3000);
    }
}

// --- TELEGRAM COMMANDS ---
bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "Bot Blast Ninja Ready.\n/login - Hubungkan\n/jalan - Ledakkan"));

bot.onText(/\/login/, (msg) => {
    const opts = { reply_markup: { inline_keyboard: [[{ text: "QR", callback_data: 'login_qr' }, { text: "Kode", callback_data: 'login_code' }]] } };
    bot.sendMessage(msg.chat.id, "Pilih login:", opts);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    bot.answerCallbackQuery(query.id);
    if (query.data === 'login_qr') initWA(chatId, 'QR');
    if (query.data === 'login_code') {
        userState[chatId] = 'WAIT_NUM';
        bot.sendMessage(chatId, "Masukkan nomor (contoh 628xxx):");
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId] === 'WAIT_NUM' && msg.text && !msg.text.startsWith('/')) {
        initWA(chatId, 'CODE', msg.text.replace(/[^0-9]/g, ''));
        delete userState[chatId];
    }
});

// --- LOGIKA NINJA SHOTGUN (30-50 CHAT PER HANTAMAN) ---
bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing || !sock) return bot.sendMessage(chatId, "Bot sibuk atau belum login!");

    isProcessing = true;
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const script1 = fs.readFileSync('script1.txt', 'utf-8');
        const script2 = fs.readFileSync('script2.txt', 'utf-8');

        bot.sendMessage(chatId, `🌪️ **NINJA SHOTGUN RELEASED!**\nTarget: ${data.length} Nomor.`);

        // UKURAN LEDAKAN: 50 chat sekali tembak
        const chunkSize = 50; 

        for (let i = 0; i < data.length; i += chunkSize) {
            const kloter = data.slice(i, i + chunkSize);

            // Tembak 50 pesan secara paralel (Bersamaan)
            await Promise.all(kloter.map(async (line, index) => {
                const globalIndex = i + index;
                const parts = line.trim().split(/\s+/);
                const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                const pesan = (globalIndex % 2 === 0 ? script1 : script2).replace(/{id}/g, parts[0]);

                // Kirim tanpa menunggu (Fire and Forget)
                return sock.sendMessage(jid, { text: pesan }).catch(() => {});
            }));

            // Jeda antar-ledakan sangat tipis (100ms) hanya agar socket tidak crash
            await delay(100); 
        }

        bot.sendMessage(chatId, `🚀 **LEDAKAN SELESAI!**`);
        isProcessing = false;

    } catch (e) {
        bot.sendMessage(chatId, "❌ Gagal.");
        isProcessing = false;
    }
});

bot.onText(/\/restart/, async (msg) => {
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    bot.sendMessage(msg.chat.id, "♻️ Cleaned.");
    setTimeout(() => { process.exit(); }, 1000);
});
