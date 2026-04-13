const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- KONFIGURASI WEB SERVER AGAR RAILWAY TETAP ONLINE ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot WA Blast Anti-Ban is Online!'));
app.listen(PORT, '0.0.0.0', () => console.log(`Web Server running on port ${PORT}`));

// --- FUNGSI DELAY ACAK (ANTI-BOT PATTERN) ---
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
        browser: ["Ubuntu", "Chrome", "20.0.04"], 
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
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
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG**, silahkan `/filter` untuk membuka history");
        }
        if (connection === 'close') {
            const code = lastDisconnect.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                initWA(chatId, method, phoneNumber);
            } else {
                isProcessing = false;
                bot.sendMessage(chatId, `❌ **WA TERBATASI / LOGOUT**\n\n**REKAP:** ${successCount}\nSilahkan klik /restart`);
            }
        }
    });

    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                bot.sendMessage(chatId, `🔑 **KODE PAIRING ANDA:**\n\n\`${code}\``, { parse_mode: 'Markdown' });
            } catch (err) {
                bot.sendMessage(chatId, "❌ Gagal meminta kode. Klik /restart.");
            }
        }, 6000);
    }
}

// --- TELEGRAM COMMANDS ---

bot.onText(/\/login/, (msg) => {
    const opts = { reply_markup: { inline_keyboard: [[{ text: "QR", callback_data: 'login_qr' }, { text: "Kode", callback_data: 'login_code' }]] } };
    bot.sendMessage(msg.chat.id, "Pilih metode login:", opts);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'login_qr') { initWA(chatId, 'QR'); }
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
        bot.sendMessage(chatId, `⏳ Meminta kode untuk: \`${num}\`...`, { parse_mode: 'Markdown' });
        initWA(chatId, 'CODE', num);
        delete userState[chatId];
    }
});

bot.onText(/\/filter/, async (msg) => {
    const chatId = msg.chat.id;
    if (!sock) return bot.sendMessage(chatId, "Login dulu!");
    bot.sendMessage(chatId, "🔍 **PROSES FILTER...**");
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        for (let line of data) {
            let num = line.trim().split(/\s+/).pop().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            await sock.sendPresenceUpdate('available', num);
        }
        bot.sendMessage(chatId, "✅ **FILTER SELESAI**. Silahkan `/jalan` untuk blast.");
    } catch (e) { bot.sendMessage(chatId, "❌ Gagal membaca nomor.txt"); }
});

// --- STEP 3: JALAN (ANTI-LIMIT MODE) ---
bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing) return;
    isProcessing = true;
    successCount = 0;

    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const scriptTemplate = fs.readFileSync('script.txt', 'utf-8');
        bot.sendMessage(chatId, "🚀 **BLAST JALAN (ANTI-LIMIT MODE)...**");
        
        for (let line of data) {
            if (!isProcessing) break;
            let parts = line.trim().split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let jid = nomor + "@s.whatsapp.net";
            
            try {
                // 1. Simulasi "Sedang Mengetik" agar terlihat manusiawi
                await sock.sendPresenceUpdate('composing', jid);
                
                // 2. Jeda acak 1 - 2 detik sebelum kirim (biar gak kaku)
                await delay(Math.floor(Math.random() * 1000) + 1000); 

                const pesan = scriptTemplate.replace(/{id}/g, nama);
                await sock.sendMessage(jid, { text: pesan });
                
                // 3. Matikan status mengetik
                await sock.sendPresenceUpdate('paused', jid);
                
                successCount++;

                // 4. Jeda total antar kontak (Rata-rata 1-2 detik)
                await delay(1000); 
                
            } catch (err) {
                isProcessing = false;
                bot.sendMessage(chatId, `⚠️ **AKUN TERBATASI!**\n**Terakhir Terkirim:** ${successCount}\nSilahkan /restart`);
                return;
            }
        }
        bot.sendMessage(chatId, `🏁 **SELESAI!** Total: ${successCount}`);
        isProcessing = false;
    } catch (e) { bot.sendMessage(chatId, "❌ Error pada file."); isProcessing = false; }
});

bot.onText(/\/restart/, (msg) => {
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    bot.sendMessage(msg.chat.id, "♻️ **SESSION DIBERSIHKAN.** Silahkan `/login` lagi.");
    setTimeout(() => process.exit(0), 1000);
});
