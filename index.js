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
app.get('/', (req, res) => res.send('Bot WA Blast Extreme Fast is Online!'));
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));

// --- FUNGSI HELPER ---
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createProgressBar(current, total) {
    const size = 10;
    const progress = Math.min(size, Math.round((current / total) * size));
    const percentage = Math.min(100, Math.round((current / total) * 100));
    return `${"█".repeat(progress)}${"░".repeat(size - progress)} ${percentage}%\nProgress: ${current}/${total}`;
}

const welcomeMessage = `Selamat datang di BOT BLAST HOPE777

/login - scan qr atau pairing
/filter - open chat history
/jalan - bot otomatis blast (30 CHAT EXPLOSION)
/restart - lakukan restart setiap selesai blast

Semangat & Semoga dapat BADAK ‼️`;

// --------------------------------------------------------

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
        retryRequestDelayMs: 0,
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
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG - MODE EXPLOSION AKTIF**");
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
            } catch (err) {
                bot.sendMessage(chatId, "❌ Gagal pairing.");
            }
        }, 6000);
    }
}

// --- TELEGRAM COMMANDS ---

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, welcomeMessage));

bot.onText(/\/login/, (msg) => {
    qrSent = false;
    const opts = { reply_markup: { inline_keyboard: [[{ text: "QR", callback_data: 'login_qr' }, { text: "Kode", callback_data: 'login_code' }]] } };
    bot.sendMessage(msg.chat.id, "Pilih metode login:", opts);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'login_qr') initWA(chatId, 'QR');
    else if (query.data === 'login_code') {
        userState[chatId] = 'WAITING_NUMBER';
        bot.sendMessage(chatId, "Masukkan nomor WA:");
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

bot.onText(/\/filter/, async (msg) => {
    const chatId = msg.chat.id;
    if (!sock) return bot.sendMessage(chatId, "Login dulu!");
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const total = data.length;
        let progressMsg = await bot.sendMessage(chatId, `🔍 **OPENING HISTORY...**`);
        for (let i = 0; i < total; i++) {
            let num = data[i].trim().split(/\s+/).pop().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            sock.sendPresenceUpdate('available', num);
            if ((i + 1) % 50 === 0 || (i + 1) === total) {
                bot.editMessageText(`🔍 **FILTERING...**\n${createProgressBar(i + 1, total)}`, { chat_id: chatId, message_id: progressMsg.message_id }).catch(() => {});
            }
        }
        bot.sendMessage(chatId, "✅ **FILTER SELESAI**");
    } catch (e) { bot.sendMessage(chatId, "❌ File nomor.txt tidak ditemukan."); }
});

// --- LOGIKA NINJA STORM: BATCH 30 EXPLOSION ---
bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing || !sock) return bot.sendMessage(chatId, "Bot sibuk atau belum login!");

    isProcessing = true;
    successCount = 0;

    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const script1 = fs.readFileSync('script1.txt', 'utf-8');
        const script2 = fs.readFileSync('script2.txt', 'utf-8');
        const total = data.length;

        await bot.sendMessage(chatId, `🌪️ **PREPARING 30-BATCH EXPLOSION...**`);

        // Kita bagi data menjadi kelompok berisi 30 nomor (kloter)
        for (let i = 0; i < total; i += 30) {
            const kloter = data.slice(i, i + 30);
            
            // RAHASIA: Promise.all mengirim 30 chat ini secara paralel (bersamaan)
            await Promise.all(kloter.map(async (line, index) => {
                const actualIndex = i + index;
                const parts = line.trim().split(/\s+/);
                const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                const template = (actualIndex % 2 === 0 ? script1 : script2);
                const pesan = template.replace(/{id}/g, parts[0]);

                // Kirim langsung ke socket tanpa menunggu satu per satu
                return sock.sendMessage(jid, { text: pesan }).then(() => {
                    successCount++;
                }).catch(() => {});
            }));

            // Jeda sangat tipis agar WhatsApp tidak memutuskan koneksi secara paksa
            // tapi tetap terasa "meledak" 30 chat per detik
            await delay(300); 
        }

        bot.sendMessage(chatId, `🚀 **STORM FINISHED!**\nCek HP Anda: 30 chat per kloter sudah mendarat.`);
        isProcessing = false;

    } catch (e) {
        bot.sendMessage(chatId, "❌ Error Blast.");
        isProcessing = false;
    }
});

bot.onText(/\/restart/, async (msg) => {
    isProcessing = false;
    if (sock) { try { await sock.logout(); } catch (e) {} sock.end(); }
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    bot.sendMessage(msg.chat.id, "♻️ **CLEANING...** Gunakan /login kembali.");
});
