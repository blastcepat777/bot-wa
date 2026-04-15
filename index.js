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
app.get('/', (req, res) => res.send('Bot Ninja Ultra Instinct is Online!'));
app.listen(process.env.PORT || 3000);

// --- HELPER ---
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const welcomeMessage = `Selamat datang di BOT BLAST HOPE777

/login - koneksi akun
/filter - bersihkan history
/jalan - MULAI ULTRA BLAST (NO DELAY)
/restart - reset session

⚠️ MODE ULTRA: PESAN MELEDAK INSTAN!`;

// --------------------------------------------------------

let sock;
let isProcessing = false;

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
        connectTimeoutMs: 60000,
        // SETTINGAN AGGRESSIVE
        defaultQueryTimeoutMs: 0,
        retryRequestDelayMs: 0,
        keepAliveIntervalMs: 20000,
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
        if (u.qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(u.qr, { scale: 10 });
            bot.sendPhoto(chatId, buffer);
        }
        if (u.connection === 'open') bot.sendMessage(chatId, "✅ **ULTRA BLAST READY!**");
        if (u.connection === 'close') initWA(chatId, method, phoneNumber);
    });
}

// --- TELEGRAM COMMANDS ---
bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, welcomeMessage));
bot.onText(/\/login/, (msg) => {
    const opts = { reply_markup: { inline_keyboard: [[{ text: "QR", callback_data: 'login_qr' }, { text: "Kode", callback_data: 'login_code' }]] } };
    bot.sendMessage(msg.chat.id, "Pilih login:", opts);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'login_qr') initWA(chatId, 'QR');
    if (query.data === 'login_code') {
        bot.sendMessage(chatId, "Masukkan nomor:");
        sock.userState = 'WAITING_NUMBER';
    }
});

bot.onText(/\/filter/, async (msg) => {
    const chatId = msg.chat.id;
    if (!sock) return bot.sendMessage(chatId, "Login dulu!");
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        bot.sendMessage(chatId, `🔍 **FILTERING ${data.length} NOMOR...**`);
        for (let line of data) {
            let num = line.trim().split(/\s+/).pop().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            sock.sendPresenceUpdate('available', num);
        }
        bot.sendMessage(chatId, "✅ **FILTER SELESAI**");
    } catch (e) { bot.sendMessage(chatId, "❌ File nomor.txt tidak ada."); }
});

// --- LOGIKA ULTRA INSTINCT: NO DELAY BLAST ---
bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing || !sock) return bot.sendMessage(chatId, "Belum login!");

    isProcessing = true;
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const script1 = fs.readFileSync('script1.txt', 'utf-8');
        const script2 = fs.readFileSync('script2.txt', 'utf-8');

        bot.sendMessage(chatId, `🌪️ **ULTRA BLAST RELEASED!**\nMeledakkan ${data.length} chat sekaligus...`);

        // RAHASIA: Tidak pakai 'for...of' dengan await.
        // Pakai perulangan biasa dan tembak semua dalam satu eksekusi loop.
        for (let i = 0; i < data.length; i++) {
            const parts = data[i].trim().split(/\s+/);
            const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const template = (i % 2 === 0 ? script1 : script2);
            const pesan = template.replace(/{id}/g, parts[0]);

            // FIRE-AND-FORGET: Tembak, jangan tunggu, lanjut i++
            sock.sendMessage(jid, { text: pesan }).catch(() => {});

            // Jika daftar nomor sangat banyak (misal > 500), 
            // beri sedikit nafas setiap 100 chat agar CPU server tidak mati mendadak
            if (i > 0 && i % 100 === 0) {
                await delay(50); 
            }
        }

        bot.sendMessage(chatId, `🚀 **LEDAKAN SELESAI!**\nCek history WA kamu sekarang.`);
        isProcessing = false;

    } catch (e) {
        bot.sendMessage(chatId, "❌ Gagal Blast.");
        isProcessing = false;
    }
});

bot.onText(/\/restart/, async (msg) => {
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    bot.sendMessage(msg.chat.id, "♻️ **RESET SELESAI.**");
    process.exit(); // Restart otomatis jika pakai PM2
});
