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
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 15000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && method === 'QR' && !qrSent) {
            qrSent = true; 
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR INI**\nBarcode hanya dikirim sekali." });
        }
        
        if (connection === 'open') {
            qrSent = false;
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG**, silahkan `/filter` untuk membuka history");
        }
        
        if (connection === 'close') {
            const code = lastDisconnect.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                initWA(chatId, method, phoneNumber);
            } else {
                isProcessing = false;
                qrSent = false;
                bot.sendMessage(chatId, `❌ **WA LOGOUT.** Gunakan /login kembali.`);
            }
        }
    });

    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                bot.sendMessage(chatId, `🔑 **KODE PAIRING ANDA:**\n\n\`${code}\``, { parse_mode: 'Markdown' });
            } catch (err) {
                bot.sendMessage(chatId, "❌ Gagal meminta kode.");
            }
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
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const total = data.length;
        let progressMsg = await bot.sendMessage(chatId, `🔍 **PROSES FILTER (Jeda 1s)...**\n${createProgressBar(0, total)}`);

        for (let i = 0; i < total; i++) {
            let num = data[i].trim().split(/\s+/).pop().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            await sock.sendPresenceUpdate('available', num);
            await delay(1000);

            if ((i + 1) % 10 === 0 || (i + 1) === total) {
                await bot.editMessageText(`🔍 **PROSES FILTER (Jeda 1s)...**\n${createProgressBar(i + 1, total)}`, {
                    chat_id: chatId,
                    message_id: progressMsg.message_id
                }).catch(() => {});
            }
        }
        bot.sendMessage(chatId, "✅ **FILTER SELESAI**. Ketik `/jalan` untuk mulai.");
    } catch (e) { bot.sendMessage(chatId, "❌ Gagal membaca nomor.txt"); }
});

bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing) return;
    if (!sock) return bot.sendMessage(chatId, "Login dulu!");

    isProcessing = true;
    successCount = 0;

    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const script1 = fs.readFileSync('script1.txt', 'utf-8');
        const script2 = fs.readFileSync('script2.txt', 'utf-8');
        const total = data.length;

        let progressMsg = await bot.sendMessage(chatId, `🚀 **NINJA BLAST MODE ACTIVE...**\n${createProgressBar(0, total)}`);
        
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
            
            if (currentIdx <= 6) {
                // FASE 1: Chat 1-6 (Mode 1 Detik)
                await delay(1000);
            } 
            // FASE 2: Chat 7 sampai 70 (Meledak 0 Detik) - Tidak ada delay di sini

            if (currentIdx === 71) {
                // FASE 3: Setelah mencapai 70 chat, Jeda 3 detik
                await bot.sendMessage(chatId, "⏳ *Jeda Istirahat 3 Detik (Ninja Break)...*");
                await delay(3000);
            }

            // FASE 4: 71 ke atas (Meledak 0 Detik) - Tidak ada delay di sini

            try {
                const pesan = selectedTemplate.replace(/{id}/g, nama);
                
                // Typing kilat 10ms agar Railway tetap stabil (opsional untuk keamanan)
                await sock.sendPresenceUpdate('composing', jid);
                if (currentIdx > 6) await delay(10); 
                
                await sock.sendMessage(jid, { text: pesan });
                successCount++;

                // Live Update Progress setiap 5 pesan
                if (successCount % 5 === 0 || successCount === total) {
                    await bot.editMessageText(`🚀 **NINJA BLAST: ${successCount}/${total}**\n${createProgressBar(successCount, total)}`, {
                        chat_id: chatId,
                        message_id: progressMsg.message_id
                    }).catch(() => {});
                }
                
            } catch (err) {
                console.log(`Gagal ke ${jid}`);
                continue; 
            }
        }
        bot.sendMessage(chatId, `🏁 **MISI SELESAI!**\nBerhasil: ${successCount}`);
        isProcessing = false;
    } catch (e) { 
        bot.sendMessage(chatId, "❌ Gagal membaca file."); 
        isProcessing = false; 
    }
});

bot.onText(/\/restart/, async (msg) => {
    const chatId = msg.chat.id;
    isProcessing = false;
    qrSent = false;
    bot.sendMessage(chatId, "♻️ **CLEANING...**");
    if (sock) { try { await sock.logout(); } catch (e) {} sock.end(); }
    setTimeout(() => {
        if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
        bot.sendMessage(chatId, welcomeMessage).then(() => {
            bot.sendMessage(chatId, "✅ **READY.** Silahkan `/login`.");
        });
        sock = null; 
    }, 2000);
});
