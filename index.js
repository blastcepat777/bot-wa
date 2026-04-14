const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot WA Blast Extreme Fast is Online!'));
app.listen(PORT, '0.0.0.0', () => console.log(`Web Server running on port ${PORT}`));

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createProgressBar(current, total) {
    const size = 10;
    const progress = total > 0 ? Math.round((current / total) * size) : 0;
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    const filled = "█".repeat(progress);
    const empty = "░".repeat(size - progress);
    return `${filled}${empty} ${percentage}%\nSedang Berjalan : ${current}`;
}

const welcomeMessage = `Selamat datang di BOT BLAST HOPE777\n\n/login - scan qr atau pairing\n/filter - open chat history\n/jalan - bot otomatis blast\n/restart - lakukan restart setiap selesai blast\n\nSemangat & Semoga dapat BADAK ‼️`;

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
        browser: ["Mac OS", "Chrome", "121.0.0.0"], 
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR INI**" });
        }
        if (connection === 'open') bot.sendMessage(chatId, "✅ **WA TERHUBUNG**");
        if (connection === 'close') {
            const code = lastDisconnect.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) initWA(chatId, method, phoneNumber);
        }
    });
}

// --- TELEGRAM COMMANDS ---
bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, welcomeMessage));
bot.onText(/\/login/, (msg) => {
    const opts = { reply_markup: { inline_keyboard: [[{ text: "QR", callback_data: 'login_qr' }, { text: "Kode", callback_data: 'login_code' }]] } };
    bot.sendMessage(msg.chat.id, "Pilih metode login:", opts);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'login_qr') initWA(chatId, 'QR');
    else if (query.data === 'login_code') {
        userState[chatId] = 'WAITING_NUMBER';
        bot.sendMessage(chatId, "Masukkan nomor WA (Contoh: 62813...)");
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId] === 'WAITING_NUMBER' && msg.text && !msg.text.startsWith('/')) {
        let num = msg.text.replace(/[^0-9]/g, '');
        if (num.startsWith('0')) num = '62' + num.slice(1);
        initWA(chatId, 'CODE', num);
        delete userState[chatId];
    }
});

bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing || !sock) return;
    
    isProcessing = true;
    successCount = 0;

    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const script1 = fs.readFileSync('script1.txt', 'utf-8');
        const script2 = fs.readFileSync('script2.txt', 'utf-8');
        const total = data.length;

        let progressMsg = await bot.sendMessage(chatId, `🚀 **EXTREME BLAST ON...**\n${createProgressBar(0, total)}`);
        
        for (let i = 0; i < total; i++) {
            if (!isProcessing) break;

            let line = data[i];
            let parts = line.trim().split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let jid = nomor + "@s.whatsapp.net";
            let selectedTemplate = (i % 2 === 0) ? script1 : script2;

            try {
                // --- TRICK BYPASS 50 ---
                // Beri jeda 1.5 detik setiap 50 pesan agar server tidak memutus socket
                if (i > 0 && i % 50 === 0) {
                    await delay(1500); 
                }

                const pesan = selectedTemplate.replace(/{id}/g, nama);
                await sock.sendMessage(jid, { text: pesan });
                successCount++;

                // Live Update Telegram setiap 5 pesan (mengurangi beban API Telegram)
                if (successCount % 5 === 0 || successCount === total) {
                    await bot.editMessageText(`🚀 **EXTREME BLAST ON...**\n${createProgressBar(successCount, total)}`, {
                        chat_id: chatId, message_id: progressMsg.message_id
                    }).catch(() => {});
                }
                
            } catch (err) {
                // Jika error, coba reconnect kecil tanpa mematikan proses
                console.log("Koneksi tersendat, mencoba lanjut...");
                await delay(500);
                continue; 
            }
        }
        bot.sendMessage(chatId, `🏁 **SELESAI!** Total: ${successCount}`);
        isProcessing = false;
    } catch (e) { 
        bot.sendMessage(chatId, "❌ Gagal eksekusi."); 
        isProcessing = false; 
    }
});

bot.onText(/\/restart/, async (msg) => {
    const chatId = msg.chat.id;
    isProcessing = false;
    bot.sendMessage(chatId, "♻️ **CLEANING...**");
    if (sock) { try { await sock.logout(); } catch (e) {} sock.end(); }
    setTimeout(() => {
        if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
        bot.sendMessage(chatId, welcomeMessage);
        sock = null; 
    }, 2000);
});
