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
app.get('/', (req, res) => res.send('NINJA STORM ENGINE ACTIVE'));
app.listen(process.env.PORT || 3000);

let sock;
let userState = {};

// Menu Utama
const mainKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "📸 QR Scan", callback_data: 'l_qr' }],
            [{ text: "🔑 Pairing Code", callback_data: 'l_cd' }]
        ]
    }
};

async function initWA(chatId, method, phoneNumber = null, msgId = null) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    // Pastikan sock lama dimatikan sebelum inisialisasi baru
    if (sock) {
        try { sock.logout(); sock.end(); } catch (e) {}
    }

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        // LOGIKA QR: Ganti Gambar di Pesan yang Sama
        if (qr && method === 'QR' && msgId) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 8 });
                await bot.editMessageMedia({
                    type: 'photo',
                    media: buffer,
                    caption: `📸 **SCAN QR SEKARANG**\nUpdate: ${new Date().toLocaleTimeString()}\n(Gunakan tombol di bawah untuk batal)`,
                    parse_mode: 'Markdown'
                }, {
                    chat_id: chatId,
                    message_id: msgId,
                    reply_markup: {
                        inline_keyboard: [[{ text: "❌ Cancel / Back", callback_data: 'back_to_menu_del' }]]
                    }
                });
            } catch (err) {
                // Jika pesan tidak bisa diedit (misal terhapus), kirim pesan baru sebagai fallback
                console.log("Edit media error:", err.message);
            }
        }

        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG!**");
            if (msgId) bot.deleteMessage(chatId, msgId).catch(() => {});
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect && method !== 'STOP') {
                initWA(chatId, method, phoneNumber, msgId);
            }
        }
    });

    // LOGIKA PAIRING: Ganti Teks di Pesan yang Sama
    if (method === 'CODE' && phoneNumber && msgId) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                await bot.editMessageText(`🔑 **KODE PAIRING ANDA:**\n\n\`${code}\`\n\nMasukkan di WhatsApp HP Anda.`, {
                    chat_id: chatId,
                    message_id: msgId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu' }]]
                    }
                });
            } catch (e) {
                bot.editMessageText("❌ Gagal generate kode. Klik /restart dan coba lagi.", { chat_id: chatId, message_id: msgId });
            }
        }, 5000);
    }
}

// --- HANDLERS ---
bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "Pilih metode login:", mainKeyboard);
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === 'l_qr') {
        // Hapus menu teks, ganti dengan foto placeholder agar bisa di-editMedia
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        const placeholder = await bot.sendPhoto(chatId, 'https://placehold.jp/40/333333/ffffff/400x400.png?text=Generating%20QR...', {
            caption: "⏳ Sedang menyiapkan QR, mohon tunggu...",
            reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu_del' }]] }
        });
        initWA(chatId, 'QR', null, placeholder.message_id);
    }

    if (q.data === 'l_cd') {
        userState[chatId] = { step: 'WAIT_NUM', msgId: msgId };
        bot.editMessageText("📞 **Masukkan Nomor WA Anda:**\nContoh: 628xxx", {
            chat_id: chatId,
            message_id: msgId,
            reply_markup: {
                inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu' }]]
            }
        });
    }

    // Navigasi Back / Cancel
    if (q.data === 'back_to_menu') {
        if (sock) { sock.end(); sock = null; }
        bot.editMessageText("Pilih metode login:", {
            chat_id: chatId,
            message_id: msgId,
            reply_markup: mainKeyboard.reply_markup
        });
    }

    if (q.data === 'back_to_menu_del') {
        if (sock) { sock.end(); sock = null; }
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        bot.sendMessage(chatId, "Pilih metode login:", mainKeyboard);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId]?.step === 'WAIT_NUM' && msg.text && !msg.text.startsWith('/')) {
        const num = msg.text.replace(/[^0-9]/g, '');
        const targetMsgId = userState[chatId].msgId;
        
        bot.deleteMessage(chatId, msg.message_id).catch(() => {}); 
        bot.editMessageText("⏳ **Menggenerate kode pairing...**", { chat_id: chatId, message_id: targetMsgId });
        
        initWA(chatId, 'CODE', num, targetMsgId);
        delete userState[chatId];
    }
});
