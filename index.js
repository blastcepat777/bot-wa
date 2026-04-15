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

/login - koneksi akun
/filter - bersihkan history
/jalan - MULAI ULTRA BLAST (NO DELAY)
/restart - reset session

⚠️ MODE ULTRA: PESAN MELEDAK INSTAN!`;

// --------------------------------------------------------

let sock;
let isProcessing = false;
let userState = {}; // Memindahkan userState ke level global

async function initWA(chatId, method, phoneNumber = null) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "110.0.5481.177"], // Browser lebih stabil
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        retryRequestDelayMs: 0,
    });

    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (u) => {
        const { connection, lastDisconnect, qr } = u;
        
        if (qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            bot.sendPhoto(chatId, buffer, { caption: "📸 Scan QR ini segera!" });
        }

        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **ULTRA BLAST READY!** WhatsApp Terhubung.");
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                bot.sendMessage(chatId, "🔄 Mengoneksi ulang...");
                initWA(chatId, method, phoneNumber);
            } else {
                bot.sendMessage(chatId, "❌ Terputus. Silakan /login ulang.");
            }
        }
    });

    // Logika Pairing Code
    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                bot.sendMessage(chatId, `🔑 **KODE PAIRING ANDA:** \`${code}\``, { parse_mode: 'Markdown' });
            } catch (err) {
                bot.sendMessage(chatId, "❌ Gagal mendapatkan kode. Coba lagi.");
            }
        }, 3000);
    }
}

// --- TELEGRAM COMMANDS ---
bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, welcomeMessage));

bot.onText(/\/login/, (msg) => {
    const opts = { 
        reply_markup: { 
            inline_keyboard: [
                [{ text: "📸 QR Code", callback_data: 'login_qr' }],
                [{ text: "🔢 Pairing Code", callback_data: 'login_code' }]
            ] 
        } 
    };
    bot.sendMessage(msg.chat.id, "Silakan pilih metode login:", opts);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'login_qr') {
        initWA(chatId, 'QR');
    } else if (query.data === 'login_code') {
        userState[chatId] = 'WAITING_NUMBER';
        bot.sendMessage(chatId, "Silakan masukkan nomor WA Anda (contoh: 62812xxx):");
    }
    bot.answerCallbackQuery(query.id); // Penting agar tombol tidak "loading" terus
});

// Menangkap input nomor untuk Pairing Code
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId] === 'WAITING_NUMBER' && msg.text && !msg.text.startsWith('/')) {
        let num = msg.text.replace(/[^0-9]/g, '');
        initWA(chatId, 'CODE', num);
        delete userState[chatId];
    }
});

bot.onText(/\/filter/, async (msg) => {
    const chatId = msg.chat.id;
    if (!sock) return bot.sendMessage(chatId, "⚠️ Hubungkan WA dulu dengan /login");
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        bot.sendMessage(chatId, `🔍 **FILTERING ${data.length} NOMOR...**`);
        for (let line of data) {
            let num = line.trim().split(/\s+/).pop().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            sock.sendPresenceUpdate('available', num);
        }
        bot.sendMessage(chatId, "✅ **FILTER SELESAI**");
    } catch (e) { bot.sendMessage(chatId, "❌ Error: Pastikan file nomor.txt tersedia."); }
});

bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing) return bot.sendMessage(chatId, "⏳ Bot masih bekerja!");
    if (!sock) return bot.sendMessage(chatId, "⚠️ Login dulu!");

    isProcessing = true;
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const script1 = fs.readFileSync('script1.txt', 'utf-8');
        const script2 = fs.readFileSync('script2.txt', 'utf-8');

        bot.sendMessage(chatId, `🌪️ **ULTRA BLAST STARTED!**\nTarget: ${data.length} nomor.`);

        for (let i = 0; i < data.length; i++) {
            const parts = data[i].trim().split(/\s+/);
            const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const template = (i % 2 === 0 ? script1 : script2);
            const pesan = template.replace(/{id}/g, parts[0]);

            // ULTRA FAST: Tanpa await
            sock.sendMessage(jid, { text: pesan }).catch(e => console.log("Gagal kirim ke " + jid));

            if (i > 0 && i % 50 === 0) await delay(100); // Nafas tipis per 50 chat
        }

        bot.sendMessage(chatId, `🚀 **LEDAKAN SELESAI!**`);
        isProcessing = false;
    } catch (e) {
        bot.sendMessage(chatId, "❌ Terjadi kesalahan saat membaca file.");
        isProcessing = false;
    }
});

bot.onText(/\/restart/, async (msg) => {
    bot.sendMessage(msg.chat.id, "♻️ **RESETING...**");
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    setTimeout(() => { process.exit(); }, 1000);
});
