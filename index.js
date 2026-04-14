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

function createProgressBar(current, total) {
    const size = 10;
    const progress = total > 0 ? Math.round((current / total) * size) : 0;
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    const filled = "█".repeat(progress);
    const empty = "░".repeat(size - progress);
    return `${filled}${empty} ${percentage}%\nTerkirim: ${current}/${total}`;
}

const welcomeMessage = `Selamat datang di BOT BLAST HOPE777\n\n/login - scan qr atau pairing\n/jalan - bot otomatis blast (NINJA MODE)\n/restart - hapus sesi & reset\n\nSemangat & Semoga dapat BADAK ‼️`;

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
        browser: ["Windows", "Chrome", "122.0.0.0"], 
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
        if (connection === 'open') bot.sendMessage(chatId, "✅ **WA TERHUBUNG!** Ready tembus 100+");
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

bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing || !sock) return bot.sendMessage(chatId, "Login dulu atau tunggu proses selesai!");
    
    isProcessing = true;
    let successCount = 0;

    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const script1 = fs.readFileSync('script1.txt', 'utf-8');
        const script2 = fs.readFileSync('script2.txt', 'utf-8');
        const total = data.length;

        let progressMsg = await bot.sendMessage(chatId, `🥷 **NINJA BLAST MODE ACTIVE...**\n${createProgressBar(0, total)}`);
        
        for (let i = 0; i < total; i++) {
            if (!isProcessing) break;

            let line = data[i];
            let parts = line.trim().split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let jid = nomor + "@s.whatsapp.net";
            let selectedTemplate = (i % 2 === 0) ? script1 : script2;
            let currentPos = i + 1;

            // --- LOGIKA RITME NINJA (BYPASS LIMIT 50-80) ---
            if (currentPos <= 4) {
                // Fase 1: Chat 1-4 (Pemanasan) - Delay 1 detik
                await delay(1000);
            } 
            else if (currentPos >= 5 && currentPos <= 30) {
                // Fase 2: Chat 5-30 (Gaspol) - 0 Detik
            } 
            else if (currentPos >= 31 && currentPos <= 36) {
                // Fase 3: Chat 31-36 (Ngerem/Cooling) - Delay 1.2 detik
                await delay(1200); 
            } 
            // Fase 4: 37 sampai Habis (TURBO 0 DETIK) - Tanpa Delay

            try {
                // Fake Typing: Supaya terdeteksi manusia (hanya 50ms, tidak menghambat kecepatan)
                await sock.sendPresenceUpdate('composing', jid);
                
                const pesan = selectedTemplate.replace(/{id}/g, nama);
                await sock.sendMessage(jid, { text: pesan });
                successCount++;

                // Update Telegram setiap 10 pesan agar tidak kena Rate Limit Telegram
                if (successCount % 10 === 0 || successCount === total) {
                    await bot.editMessageText(`🥷 **NINJA TURBO: ${successCount}/${total}**\n${createProgressBar(successCount, total)}`, {
                        chat_id: chatId, message_id: progressMsg.message_id
                    }).catch(() => {});
                }
                
            } catch (err) {
                console.log(`Error pada nomor ${jid}, lanjut...`);
                continue; 
            }
        }
        bot.sendMessage(chatId, `🏁 **NINJA BLAST SELESAI!**\nBerhasil Terkirim: ${successCount}`);
        isProcessing = false;
    } catch (e) { 
        bot.sendMessage(chatId, "❌ Gagal membaca file (nomor.txt/script.txt)"); 
        isProcessing = false; 
    }
});

bot.onText(/\/restart/, async (msg) => {
    const chatId = msg.chat.id;
    isProcessing = false;
    bot.sendMessage(chatId, "♻️ **CLEANING SESSION...**");
    if (sock) { try { await sock.logout(); } catch (e) {} sock.end(); }
    setTimeout(() => {
        if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
        bot.sendMessage(chatId, "✅ **RESET BERHASIL.** Silahkan /login ulang.");
        sock = null; 
    }, 2000);
});
