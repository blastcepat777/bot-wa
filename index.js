const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- KONFIGURASI WEB SERVER ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot WA Blast Ninja Mode is Online!'));
app.listen(PORT, '0.0.0.0', () => console.log(`Web Server running on port ${PORT}`));

// --- FUNGSI HELPER ---
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function generateUniqueInvis() {
    const chars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
    let str = '';
    for (let i = 0; i < 3; i++) {
        str += chars[Math.floor(Math.random() * chars.length)];
    }
    return str;
}

function createProgressBar(current, total) {
    const size = 10;
    const progress = total > 0 ? Math.round((current / total) * size) : 0;
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    const filled = "█".repeat(progress);
    const empty = "░".repeat(size - progress);
    return `${filled}${empty} ${percentage}%\nSedang Berjalan : ${current}`;
}

const welcomeMessage = `Selamat datang di BOT BLAST HOPE777

/login - scan qr atau pairing
/filter - open chat history
/jalan - bot otomatis blast (NINJA MODE)
/restart - lakukan restart setiap selesai blast

Semangat & Semoga dapat BADAK ‼️`;

let sock;
let isProcessing = false;
let successCount = 0;
let userState = {};
let qrSent = false;
let speedMode = 'FAST'; // Default mode

// --- INITIALIZE WA ---
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
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr && method === 'QR' && !qrSent) {
            qrSent = true; 
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR INI**" });
        }
        if (connection === 'open') {
            qrSent = false;
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG**");
        }
        if (connection === 'close') {
            const code = lastDisconnect.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                initWA(chatId, method, phoneNumber);
            } else {
                isProcessing = false;
                qrSent = false;
                bot.sendMessage(chatId, `❌ **WA LOGOUT.**`);
            }
        }
    });

    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                bot.sendMessage(chatId, `🔑 **KODE PAIRING:** \`${code}\``, { parse_mode: 'Markdown' });
            } catch (err) { bot.sendMessage(chatId, "❌ Gagal pairing."); }
        }, 6000);
    }
}

// --- TELEGRAM COMMANDS ---
bot.onText(/\/start/, (msg) => { bot.sendMessage(msg.chat.id, welcomeMessage); });

bot.onText(/\/login/, (msg) => {
    qrSent = false;
    const opts = { reply_markup: { inline_keyboard: [[{ text: "QR", callback_data: 'login_qr' }, { text: "Kode", callback_data: 'login_code' }]] } };
    bot.sendMessage(msg.chat.id, "Pilih metode login:", opts);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'login_qr') { initWA(chatId, 'QR'); }
    else if (data === 'login_code') {
        userState[chatId] = 'WAITING_NUMBER';
        bot.sendMessage(chatId, "Masukkan nomor WA (Contoh: 62813...)");
    }
    // Handling Pemilihan Mode Speed
    else if (data.startsWith('mode_')) {
        speedMode = data.replace('mode_', '').toUpperCase();
        bot.answerCallbackQuery(query.id, { text: `Mode ${speedMode} Aktif!` });
        bot.sendMessage(chatId, `🚀 Silahkan /jalan\n🦏 **SEMOGA KETEMU BADAK NYA !**`);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId] === 'WAITING_NUMBER' && msg.text && !msg.text.startsWith('/')) {
        let num = msg.text.replace(/[^0-9]/g, '');
        if (num.startsWith('0')) num = '62' + num.slice(1);
        bot.sendMessage(chatId, `⏳ Meminta kode untuk: \`${num}\`...`, { parse_mode: 'Markdown' });
        initWA(chatId, 'CODE', num);
        delete userState[chatId];
    }
});

// --- FILTER DENGAN TOMBOL MODE ---
bot.onText(/\/filter/, async (msg) => {
    const chatId = msg.chat.id;
    if (!sock) return bot.sendMessage(chatId, "Login dulu!");
    
    try {
        if (!fs.existsSync('nomor.txt')) return bot.sendMessage(chatId, "❌ nomor.txt tidak ada!");
        const data = fs.readFileSync('nomor.txt', 'utf-8').split(/\r?\n/).filter(l => l.trim().length > 5);
        const total = data.length;

        let progressMsg = await bot.sendMessage(chatId, `🔍 **PROSES FILTER...**\n${createProgressBar(0, total)}`);

        for (let i = 0; i < total; i++) {
            let num = data[i].trim().split(/\s+/).pop().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            await sock.sendPresenceUpdate('available', num);
            await delay(1000);

            if ((i + 1) % 10 === 0 || (i + 1) === total) {
                await bot.editMessageText(`🔍 **PROSES FILTER...**\n${createProgressBar(i + 1, total)}`, {
                    chat_id: chatId, message_id: progressMsg.message_id
                }).catch(() => {});
            }
        }

        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "💥 SUPER FAST MELEDAK", callback_data: 'mode_super' }],
                    [{ text: "🔥 FAST", callback_data: 'mode_fast' }],
                    [{ text: "🐌 SLOW (Turbo after 30)", callback_data: 'mode_slow' }]
                ]
            }
        };
        bot.sendMessage(chatId, "✅ **FILTER SELESAI!**\nPilih mode kecepatan blast:", opts);
    } catch (e) { bot.sendMessage(chatId, "❌ Gagal filter."); }
});

// --- JALAN BLAST ---
bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing) return;
    if (!sock) return bot.sendMessage(chatId, "Login dulu!");

    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split(/\r?\n/).filter(l => l.trim().length > 5);
        const script1 = fs.readFileSync('script1.txt', 'utf-8');
        const script2 = fs.readFileSync('script2.txt', 'utf-8');
        const total = data.length;

        isProcessing = true;
        successCount = 0;
        let progressMsg = await bot.sendMessage(chatId, `🚀 **NINJA BLAST [MODE: ${speedMode}]**\n${createProgressBar(0, total)}`);
        
        for (let i = 0; i < total; i++) {
            if (!isProcessing) break;

            let line = data[i].trim();
            let parts = line.split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let jid = nomor + "@s.whatsapp.net";
            let selectedTemplate = (i % 2 === 0) ? script1 : script2;
            let currentIdx = i + 1;

            // --- LOGIKA JEDA BERDASARKAN MODE ---
            if (speedMode === 'SUPER') {
                // 0 detik / Tanpa Jeda
            } else if (speedMode === 'FAST') {
                await delay(1000);
            } else if (speedMode === 'SLOW') {
                // Jeda 2 detik, setelah 30 chat jadi 1 detik (Turbo)
                let jedaSlow = (currentIdx <= 30) ? 2000 : 1000;
                await delay(jedaSlow);
            }

            try {
                const pesan = selectedTemplate.replace(/{id}/g, nama) + generateUniqueInvis();
                await sock.send
