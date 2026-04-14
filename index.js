const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATABASE SEDERHANA UNTUK LAPORAN ---
const DB_FILE = 'stats.json';
let stats = {
    date: new Date().toLocaleDateString('id-ID'),
    totalBlast: 0
};

// Load data saat bot nyala
if (fs.existsSync(DB_FILE)) {
    stats = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function saveStats() {
    fs.writeFileSync(DB_FILE, JSON.stringify(stats, null, 2));
}

// Fungsi Auto-Reset Jam 12 Malam
setInterval(() => {
    const today = new Date().toLocaleDateString('id-ID');
    if (stats.date !== today) {
        stats.date = today;
        stats.totalBlast = 0;
        saveStats();
        console.log(`[SYSTEM] Tanggal berubah ke ${today}, Statistik di-reset.`);
    }
}, 1000);

// --- KONFIGURASI WEB SERVER ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot WA Blast Extreme Fast is Online!'));
app.listen(PORT, '0.0.0.0', () => console.log(`Web Server running on port ${PORT}`));

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
/jalan - bot otomatis blast
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
            // LAPORAN SAAT LOGIN BERHASIL
            bot.sendMessage(chatId, `📅 **${stats.date}**\n✅ **BLAST HARI INI : ${stats.totalBlast.toLocaleString('id-ID')}**\n\nWA TERHUBUNG, silahkan \`/filter\``);
        }
        if (connection === 'close') {
            const code = lastDisconnect.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                initWA(chatId, method, phoneNumber);
            } else {
                isProcessing = false;
                qrSent = false;
                // LAPORAN SAAT TERBATASI / LOGOUT
                bot.sendMessage(chatId, `📅 **${stats.date}**\n❌ **WA TERBATASI / LOGOUT**\n📊 Terakhir Blast: ${stats.totalBlast.toLocaleString('id-ID')}\n\nGunakan /login kembali.`);
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

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, welcomeMessage);
});

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
        let progressMsg = await bot.sendMessage(chatId, `🔍 **PROSES FILTER (Jeda 1s)...**`);
        for (let i = 0; i < total; i++) {
            let num = data[i].trim().split(/\s+/).pop().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            await sock.sendPresenceUpdate('available', num);
            await delay(1000);
            if ((i + 1) % 5 === 0 || (i + 1) === total) {
                bot.editMessageText(`🔍 **PROSES FILTER...**\n${createProgressBar(i + 1, total)}`, { chat_id: chatId, message_id: progressMsg.message_id }).catch(() => {});
            }
        }
        bot.sendMessage(chatId, "✅ **FILTER SELESAI**. Ketik `/jalan` untuk mulai.");
    } catch (e) { bot.sendMessage(chatId, "❌ Gagal membaca nomor.txt"); }
});

// --- LOGIKA NINJA STORM BRUTE-FORCE ---
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

        let progressMsg = await bot.sendMessage(chatId, `🚀 **NINJA STORM ACTIVE...**`);

        const fireBurst = async (startIndex, endIndex) => {
            const batch = data.slice(startIndex, endIndex);
            const batchPromises = batch.map((line, index) => {
                const globalIdx = startIndex + index;
                const parts = line.trim().split(/\s+/);
                const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                const template = (globalIdx % 2 === 0 ? script1 : script2);
                const pesan = template.replace(/{id}/g, parts[0]);

                return sock.sendMessage(jid, { text: pesan })
                    .then(() => { 
                        successCount++; 
                        stats.totalBlast++; // Tambahkan ke statistik harian
                    })
                    .catch(() => {});
            });
            await Promise.all(batchPromises); 
            saveStats(); // Simpan statistik ke file
        };

        // Fase Pemanasan
        for (let i = 0; i < Math.min(6, total); i++) {
            const parts = data[i].trim().split(/\s+/);
            const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const pesan = (i % 2 === 0 ? script1 : script2).replace(/{id}/g, parts[0]);
            await delay(1000);
            await sock.sendMessage(jid, { text: pesan });
            successCount++;
            stats.totalBlast++;
            saveStats();
        }

        if (total > 6) { await fireBurst(6, 70); }

        if (total >= 71) {
            await bot.sendMessage(chatId, "⏳ **Jeda Ninja 3 Detik...**");
            await delay(3000);
            await fireBurst(70, total);
        }

        bot.sendMessage(chatId, `📅 **${stats.date}**\n✅ **DONE!**\n🚀 Berhasil Meledak: ${successCount}\n📊 **TOTAL BLAST HARI INI: ${stats.totalBlast.toLocaleString('id-ID')}**`);
        isProcessing = false;

    } catch (e) {
        bot.sendMessage(chatId, "❌ Gagal menjalankan blast.");
        isProcessing = false;
    }
});

bot.onText(/\/restart/, async (msg) => {
    const chatId = msg.chat.id;
    isProcessing = false;
    qrSent = false;
    bot.sendMessage(chatId, "♻️ **CLEANING... Mohon tunggu.**");
    
    if (sock) {
        try { await sock.logout(); } catch (e) {}
        sock.end();
        sock = null;
    }

    setTimeout(() => {
        if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
        bot.sendMessage(chatId, welcomeMessage);
        bot.sendMessage(chatId, `📅 **${stats.date}**\n📊 **BLAST HARI INI : ${stats.totalBlast.toLocaleString('id-ID')}**\n\n✅ **READY.** Silahkan \`/login\` kembali.`);
    }, 3000);
});
