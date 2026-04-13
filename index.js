const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express'); // Tambahan Express

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- KONFIGURASI WEB SERVER AGAR RAILWAY TETAP ONLINE ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot WA Blast is Online!');
});

app.listen(PORT, () => {
    console.log(`Web Server running on port ${PORT}`);
});

// --------------------------------------------------------

let sock;
let isProcessing = false;
let successCount = 0;
let userState = {};

async function initWA(chatId, method, phoneNumber = null) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["WSO288 Turbo", "Chrome", "110.0.0.0"],
        syncFullHistory: false,
        defaultQueryTimeoutMs: 0,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR INI**" });
        }

        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **WA SUDAH TERHUBUNG**, silahkan `/filter` untuk membuka history chat");
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                initWA(chatId, method, phoneNumber);
            } else {
                isProcessing = false;
                bot.sendMessage(chatId, `❌ **WA TERBLOKIR / TERPUTUS**\n\n**REKAP TERKIRIM:** ${successCount}\nSilahkan klik /restart`);
            }
        }
    });

    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                bot.sendMessage(chatId, `🔑 **KODE PAIRING ANDA:**\n\n\`${code}\``, { parse_mode: 'Markdown' });
            } catch (err) {
                bot.sendMessage(chatId, "❌ Gagal meminta kode pairing.");
            }
        }, 3000);
    }
}

// --- TELEGRAM COMMANDS ---

bot.onText(/\/login/, (msg) => {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "QR", callback_data: 'login_qr' }, { text: "Kode", callback_data: 'login_code' }]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, "Pilih metode login:", opts);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'login_qr') {
        userState[chatId] = 'WAITING_QR';
        initWA(chatId, 'QR');
    } else if (query.data === 'login_code') {
        userState[chatId] = 'WAITING_NUMBER';
        bot.sendMessage(chatId, "Masukkan nomor WA (contoh: 6281365598770):");
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId] === 'WAITING_NUMBER' && msg.text && !msg.text.startsWith('/')) {
        const num = msg.text.replace(/[^0-9]/g, '');
        initWA(chatId, 'CODE', num);
        delete userState[chatId];
    }
});

bot.onText(/\/filter/, async (msg) => {
    const chatId = msg.chat.id;
    if (!sock) return bot.sendMessage(chatId, "Login dulu!");
    bot.sendMessage(chatId, "🔍 **PROSES FILTER MEMBUKA CHAT (0 DETIK)...**");
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        for (let line of data) {
            let num = line.split(/\s+/).pop().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            await sock.sendPresenceUpdate('available', num);
        }
        bot.sendMessage(chatId, "✅ **PROSES FILTER SELESAI**\nHistory sudah nampak di Chrome.\n\nSilahkan ketik `/jalan` untuk mulai blast.");
    } catch (e) {
        bot.sendMessage(chatId, "❌ Gagal membaca nomor.txt");
    }
});

bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing) return;
    isProcessing = true;
    successCount = 0;
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const scriptTemplate = fs.readFileSync('script.txt', 'utf-8');
        bot.sendMessage(chatId, "🚀 **BLAST JALAN (MODE FAST 0 DETIK)...**");
        for (let line of data) {
            if (!isProcessing) break;
            let parts = line.split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let jid = nomor + "@s.whatsapp.net";
            try {
                const pesan = scriptTemplate.replace(/{id}/g, nama);
                await sock.sendMessage(jid, { text: pesan });
                successCount++;
            } catch (err) {
                isProcessing = false;
                bot.sendMessage(chatId, `⚠️ **WA TERBLOKIR!**\n\n**REKAP TERKIRIM:** ${successCount}\n\nSilahkan ketik /restart`);
                return;
            }
        }
        bot.sendMessage(chatId, `🏁 **BLAST SELESAI!**\nTotal Terkirim: ${successCount}`);
        isProcessing = false;
    } catch (e) {
        bot.sendMessage(chatId, "❌ File nomor.txt atau script.txt bermasalah.");
        isProcessing = false;
    }
});

bot.onText(/\/restart/, (msg) => {
    const chatId = msg.chat.id;
    if (fs.existsSync('./session_data')) {
        fs.rmSync('./session_data', { recursive: true, force: true });
    }
    bot.sendMessage(chatId, "♻️ **SEMUA HISTORY DIBERSIHKAN.**\nSilahkan `/login` lagi.");
    setTimeout(() => process.exit(0), 1000);
});
