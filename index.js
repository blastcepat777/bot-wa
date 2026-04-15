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
app.get('/', (req, res) => res.send('Bot Ninja Active!'));
app.listen(process.env.PORT || 3000);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let userState = {};
let sock;
let isProcessing = false;

async function initWA(chatId, method, phoneNumber = null) {
    // Gunakan folder session yang spesifik
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        // Browser setting ini paling penting agar tidak gagal scan
        browser: ["Ubuntu", "Chrome", "110.0.5481.177"],
        printQRInTerminal: true, // QR juga muncul di terminal buat cadangan
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 30000,
    });

    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (u) => {
        const { connection, lastDisconnect, qr } = u;
        
        if (qr && method === 'QR') {
            try {
                // Skala 10 agar QR besar dan tajam
                const buffer = await QRCode.toBuffer(qr, { scale: 10, margin: 2 });
                await bot.sendPhoto(chatId, buffer, { 
                    caption: "📸 **SCAN SEKARANG**\nQR akan berganti tiap 30 detik.\nPastikan layar HP terang." 
                });
            } catch (err) {
                console.error("Gagal generate QR Buffer");
            }
        }

        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **TERHUBUNG!** Siap meledakkan chat.");
        }

        if (connection === 'close') {
            const code = lastDisconnect.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                console.log("Koneksi terputus, mencoba menyambung kembali...");
                initWA(chatId, method, phoneNumber);
            } else {
                bot.sendMessage(chatId, "❌ Akun Logout. Hapus folder session dan login lagi.");
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
        }, 3000);
    }
}

// --- TELEGRAM COMMANDS ---
bot.onText(/\/login/, (msg) => {
    const opts = { 
        reply_markup: { 
            inline_keyboard: [
                [{ text: "📸 Pakai QR Code", callback_data: 'login_qr' }],
                [{ text: "🔢 Pakai Nomor HP (Pairing)", callback_data: 'login_code' }]
            ] 
        } 
    };
    bot.sendMessage(msg.chat.id, "Metode Login:", opts);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    bot.answerCallbackQuery(query.id); 
    if (query.data === 'login_qr') {
        initWA(chatId, 'QR');
    } else if (query.data === 'login_code') {
        userState[chatId] = 'WAIT_NUM';
        bot.sendMessage(chatId, "Kirim nomor WA (628xxx):");
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId] === 'WAIT_NUM' && msg.text && !msg.text.startsWith('/')) {
        initWA(chatId, 'CODE', msg.text.replace(/[^0-9]/g, ''));
        delete userState[chatId];
    }
});

// Perintah /jalan tetap sama seperti sebelumnya...
bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing || !sock) return bot.sendMessage(chatId, "Belum login!");
    isProcessing = true;
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const s1 = fs.readFileSync('script1.txt', 'utf-8');
        const s2 = fs.readFileSync('script2.txt', 'utf-8');
        bot.sendMessage(chatId, "🌪️ **ULTRA BLAST START!**");
        for (let i = 0; i < data.length; i++) {
            const parts = data[i].trim().split(/\s+/);
            const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const pesan = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, parts[0]);
            sock.sendMessage(jid, { text: pesan }).catch(() => {});
            if (i % 50 === 0) await delay(50);
        }
        bot.sendMessage(chatId, "🚀 **SELESAI!**");
        isProcessing = false;
    } catch (e) {
        bot.sendMessage(chatId, "❌ Error file.");
        isProcessing = false;
    }
});
