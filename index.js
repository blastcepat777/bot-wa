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

app.get('/', (req, res) => {
    res.send('Bot WA Blast (Global Version) is Online!');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Web Server running on port ${PORT}`);
});

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
        browser: ["WSO288 Turbo", "Chrome", "110.0.0.0"],
        syncFullHistory: false,
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
            bot.sendMessage(chatId, "✅ **WA SUDAH TERHUBUNG**, silahkan `/filter` untuk membuka history chat");
        }

        if (connection === 'close') {
            const code = lastDisconnect.error?.output?.statusCode;
            const shouldReconnect = code !== DisconnectReason.loggedOut;
            
            if (shouldReconnect) {
                initWA(chatId, method, phoneNumber);
            } else {
                isProcessing = false;
                bot.sendMessage(chatId, `❌ **WA TERBLOKIR / TERPUTUS**\n\n**REKAP TERKIRIM:** ${successCount}\nSilahkan klik /restart`);
            }
        }
    });

    // --- PERBAIKAN REQUEST KODE PAIRING GLOBAL ---
    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        // Jeda 5 detik agar socket benar-benar siap (penting untuk Railway)
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                bot.sendMessage(chatId, `🔑 **KODE PAIRING ANDA:**\n\n\`${code}\``, { parse_mode: 'Markdown' });
            } catch (err) {
                console.error("Error Pairing:", err);
                bot.sendMessage(chatId, "❌ Gagal meminta kode pairing. Cek kembali format nomor atau gunakan /restart.");
            }
        }, 5000);
    }
}

// --- TELEGRAM COMMANDS ---

bot.onText(/\/login/, (msg) => {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "QR", callback_data: 'login_qr' }, { text: "Kode", callback_data: 'login_code' }]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, "Pilih metode login:", opts);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'login_qr') {
        userState[chatId] = 'WAITING_QR';
        initWA(chatId, 'QR');
    } else if (query.data === 'login_code') {
        userState[chatId] = 'WAITING_NUMBER';
        bot.sendMessage(chatId, "Masukkan nomor WA lengkap dengan kode negara.\n\nContoh:\nIndonesia: `62813...`\nLuar Negeri: `225...`", { parse_mode: 'Markdown' });
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId] === 'WAITING_NUMBER' && msg.text && !msg.text.startsWith('/')) {
        // Membersihkan nomor dari karakter non-digit (termasuk spasi, +, dan -)
        let num = msg.text.replace(/[^0-9]/g, '');
        
        // Auto-fix jika user masih memasukkan angka 0 di depan (khusus Indonesia)
        if (num.startsWith('0')) {
            num = '62' + num.slice(1);
        }

        bot.sendMessage(chatId, `⏳ Memproses kode pairing untuk: \`${num}\`...`, { parse_mode: 'Markdown' });
        initWA(chatId, 'CODE', num);
        delete userState[chatId];
    }
});

bot.onText(/\/filter/, async (msg) => {
    const chatId = msg.chat.id;
    if (!sock) return bot.sendMessage(chatId, "Login dulu!");
    bot.sendMessage(chatId, "🔍 **PROSES FILTER MEMBUKA CHAT (0 DETIK)...**");
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        for (let line of data) {
            let num = line.trim().split(/\s+/).pop().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            // Memaksa status available ke target agar sinkron ke Chrome/Web
            await sock.sendPresenceUpdate('available', num);
        }
        bot.sendMessage(chatId, "✅ **PROSES FILTER SELESAI**\nHistory sudah nampak di Chrome.\n\nSilahkan ketik `/jalan` untuk mulai blast.");
    } catch (e) {
        bot.sendMessage(chatId, "❌ Gagal membaca nomor.txt");
    }
});

bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing) return;
    isProcessing = true;
    successCount = 0;
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const scriptTemplate = fs.readFileSync('script.txt', 'utf-8');
        bot.sendMessage(chatId, "🚀 **BLAST JALAN (MODE FAST 0 DETIK)...**");
        
        for (let line of data) {
            if (!isProcessing) break;
            let parts = line.trim().split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let jid = nomor + "@s.whatsapp.net";
            
            try {
                const pesan = scriptTemplate.replace(/{id}/g, nama);
                await sock.sendMessage(jid, { text: pesan });
                successCount++;
            } catch (err) {
                isProcessing = false;
                bot.sendMessage(chatId, `⚠️ **WA TERBLOKIR!**\n\n**REKAP TERKIRIM:** ${successCount}\n\nSilahkan ketik /restart`);
                return;
            }
        }

        bot.sendMessage(chatId, `🏁 **BLAST SELESAI!**\nTotal Terkirim: ${successCount}`);
        isProcessing = false;
    } catch (e) {
        bot.sendMessage(chatId, "❌ File nomor.txt atau script.txt bermasalah.");
        isProcessing = false;
    }
});

bot.onText(/\/restart/, (msg) => {
    const chatId = msg.chat.id;
    if (fs.existsSync('./session_data')) {
        fs.rmSync('./session_data', { recursive: true, force: true });
    }
    bot.sendMessage(chatId, "♻️ **SEMUA HISTORY DIBERSIHKAN.**\nSilahkan `/login` lagi.");
    setTimeout(() => process.exit(0), 1000);
});
