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
app.get('/', (req, res) => res.send('Bot WA Ninja Turbo is Online!'));
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createProgressBar(current, total, label = "Terkirim") {
    const size = 10;
    const progress = total > 0 ? Math.round((current / total) * size) : 0;
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    const filled = "█".repeat(progress);
    const empty = "░".repeat(size - progress);
    return `${filled}${empty} ${percentage}%\n${label}: ${current}/${total}`;
}

const welcomeMessage = `Selamat datang di BOT BLAST HOPE777\n\n/login - scan qr atau pairing\n/filter - cek history chat (Pemanasan)\n/jalan - bot otomatis blast (NINJA MODE)\n/restart - hapus sesi & reset\n\nSemangat & Semoga dapat BADAK ‼️`;

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
        browser: ["Mac OS", "Safari", "17.1"], // Menyamar sebagai user elit
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 15000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR INI**" });
        }
        if (connection === 'open') bot.sendMessage(chatId, "✅ **WA TERHUBUNG!** Ready tembus JADI BADAK ‼️");
        if (connection === 'close') {
            const code = lastDisconnect.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) initWA(chatId, method, phoneNumber);
        }
    });

    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                bot.sendMessage(chatId, `🔑 **KODE PAIRING:** \`${code}\``, { parse_mode: 'Markdown' });
            } catch (err) {
                bot.sendMessage(chatId, "❌ Gagal pairing.");
            }
        }, 5000);
    }
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

// --- FITUR FILTER ---
bot.onText(/\/filter/, async (msg) => {
    const chatId = msg.chat.id;
    if (!sock) return bot.sendMessage(chatId, "Login dulu!");
    
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const total = data.length;
        let progressMsg = await bot.sendMessage(chatId, `🔍 **PROSES FILTER...**\n${createProgressBar(0, total, "Dicek")}`);
        
        for (let i = 0; i < total; i++) {
            let num = data[i].trim().split(/\s+/).pop().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            await sock.sendPresenceUpdate('available', num);
            await delay(300); 

            if ((i + 1) % 10 === 0 || (i + 1) === total) {
                await bot.editMessageText(`🔍 **PROSES FILTER...**\n${createProgressBar(i + 1, total, "Dicek")}`, {
                    chat_id: chatId, message_id: progressMsg.message_id
                }).catch(() => {});
            }
        }
        bot.sendMessage(chatId, "✅ **FILTER SELESAI.**");
    } catch (e) { bot.sendMessage(chatId, "❌ Error saat filter."); }
});

// --- FITUR JALAN (NINJA TURBO RITME) ---
bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing || !sock) return bot.sendMessage(chatId, "Login dulu!");
    
    isProcessing = true;
    let successCount = 0;

    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const script1 = fs.readFileSync('script1.txt', 'utf-8');
        const script2 = fs.readFileSync('script2.txt', 'utf-8');
        const total = data.length;

        let progressMsg = await bot.sendMessage(chatId, `🚀 **NINJA BLAST START...**\n${createProgressBar(0, total)}`);
        
        for (let i = 0; i < total; i++) {
            if (!isProcessing) break;

            let line = data[i];
            let parts = line.trim().split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let jid = nomor + "@s.whatsapp.net";
            let selectedTemplate = (i % 2 === 0) ? script1 : script2;
            let currentIdx = i + 1;

            // --- LOGIKA RITME NINJA SENDER ---
            if (currentIdx <= 4) {
                // 1-4: Mode pemanasan
                await delay(1000);
            } 
            else if (currentIdx > 65 && currentIdx % 65 === 0) {
                // Setiap 65 chat: Istirahat RANDOM (15-30 detik) agar tidak terdeteksi robot murni
                const randomRest = Math.floor(Math.random() * (30000 - 15000 + 1) + 15000);
                await bot.sendMessage(chatId, `☕ **RESTING...** (${Math.floor(randomRest/1000)}s) agar akun aman.`);
                await delay(randomRest);
                await bot.sendMessage(chatId, `🚀 **GAS LAGI!**`);
            }
            // Sisanya: 0 DETIK (FULL SPEED)

            try {
                await sock.sendPresenceUpdate('composing', jid);
                const pesan = selectedTemplate.replace(/{id}/g, nama);
                await sock.sendMessage(jid, { text: pesan });
                successCount++;

                if (successCount % 10 === 0 || successCount === total) {
                    await bot.editMessageText(`🚀 **NINJA RUNNING: ${successCount}/${total}**\n${createProgressBar(successCount, total)}`, {
                        chat_id: chatId, message_id: progressMsg.message_id
                    }).catch(() => {});
                }
            } catch (err) {
                console.log(`Gagal ke ${jid}, skip...`);
                continue; 
            }
        }
        bot.sendMessage(chatId, `🏁 **NINJA BLAST SELESAI!**\nBerhasil: ${successCount}`);
        isProcessing = false;
    } catch (e) { 
        bot.sendMessage(chatId, "❌ File error."); 
        isProcessing = false; 
    }
});

bot.onText(/\/restart/, async (msg) => {
    const chatId = msg.chat.id;
    isProcessing = false;
    bot.sendMessage(chatId, "♻️ **RESTARTING...**");
    if (sock) { try { await sock.logout(); } catch (e) {} sock.end(); }
    setTimeout(() => {
        if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
        bot.sendMessage(chatId, "✅ **BERHASIL.** Silahkan /login ulang.");
        sock = null; 
    }, 2000);
});
