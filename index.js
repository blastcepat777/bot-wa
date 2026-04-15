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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const welcomeMessage = `Selamat datang di BOT BLAST HOPE777

/login - scan qr atau pairing
/filter - open chat history
/jalan - MULAI ULTRA BLAST (ZERO DELAY)
/restart - reset session

⚠️ MODE ULTRA: RATUSAN PESAN MELEDAK INSTAN!`;

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
        // --- SETTINGAN BRUTAL ---
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0, // Gak pake nunggu respon server
        retryRequestDelayMs: 0,   // Gagal hantam lagi
        keepAliveIntervalMs: 20000,
        generateHighQualityLinkPreview: false, // Biar lebih enteng
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
        if (u.qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(u.qr, { scale: 10 });
            bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN SEGERA**" });
        }
        if (u.connection === 'open') bot.sendMessage(chatId, "✅ **SYSTEM READY! SIAP MELEDAK.**");
        if (u.connection === 'close') {
            if (u.lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) initWA(chatId, method, phoneNumber);
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
bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, welcomeMessage));
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
        bot.sendMessage(chatId, "Masukkan nomor:");
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId] === 'WAIT_NUM' && msg.text && !msg.text.startsWith('/')) {
        let num = msg.text.replace(/[^0-9]/g, '');
        if (num.startsWith('0')) num = '62' + num.slice(1);
        initWA(chatId, 'CODE', num);
        delete userState[chatId];
    }
});

// --- LOGIKA ULTRA INSTINCT: ZERO DELAY BLAST ---
bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing || !sock) return bot.sendMessage(chatId, "Bot sibuk/belum login!");

    isProcessing = true;
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const script1 = fs.readFileSync('script1.txt', 'utf-8');
        const script2 = fs.readFileSync('script2.txt', 'utf-8');

        bot.sendMessage(chatId, `🌪️ **ULTRA SHOTGUN ACTIVATED!**\nMeledakkan ${data.length} chat dalam 0 detik...`);

        // RAHASIA: Tidak pakai loop await, tidak pakai Promise.all di dalam kloter.
        // Langsung hajar for loop sinkronus, lepas semua ke socket buffer.
        for (let i = 0; i < data.length; i++) {
            const parts = data[i].trim().split(/\s+/);
            const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const template = (i % 2 === 0 ? script1 : script2);
            const pesan = template.replace(/{id}/g, parts[0]);

            // FIRE-AND-FORGET: Tidak ada 'await' di sini.
            // Pesan langsung dilempar ke memori socket secepat kilat.
            sock.sendMessage(jid, { text: pesan }).catch(() => {});

            // Opsional: Jika data > 200 nomor, kasih jeda 1ms setiap 50 chat 
            // cuma supaya CPU gak hang, tapi buat mata manusia tetep keliatan barengan.
            if (i > 0 && i % 50 === 0) await delay(1); 
        }

        bot.sendMessage(chatId, `🚀 **BOOM! SEMUA TERKIRIM.**\nCek HP: Harusnya ratusan chat mendarat barengan.`);
        isProcessing = false;

    } catch (e) {
        bot.sendMessage(chatId, "❌ Gagal Blast.");
        isProcessing = false;
    }
});

bot.onText(/\/restart/, async (msg) => {
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    bot.sendMessage(msg.chat.id, "♻️ Cleaned. Silakan /login.");
    setTimeout(() => { process.exit(); }, 1000);
});
