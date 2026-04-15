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
let qrInterval = null;

// Fungsi untuk membuat menu utama (Tombol)
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

        // --- LOGIKA QR CODE (EDIT MESSAGE MEDIA) ---
        if (qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(qr, { scale: 8 });
            const opts = {
                chat_id: chatId,
                message_id: msgId,
                caption: `📸 **SCAN QR SEKARANG**\nUpdate: ${new Date().toLocaleTimeString()}\n\n_Gunakan tombol di bawah jika ingin batal._`,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: "❌ Cancel / Back", callback_data: 'back_to_menu' }]]
                }
            };

            // Berubah di tempat (Mengganti foto/media)
            await bot.editMessageMedia({
                type: 'photo',
                media: buffer,
                caption: opts.caption,
                parse_mode: 'Markdown'
            }, opts).catch(() => {});
        }

        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG!**");
            if (msgId) bot.deleteMessage(chatId, msgId).catch(() => {});
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) initWA(chatId, method, phoneNumber, msgId);
        }
    });

    // --- LOGIKA PAIRING CODE (EDIT MESSAGE TEXT) ---
    if (method === 'CODE' && phoneNumber) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                const text = `🔑 **KODE PAIRING ANDA:**\n\n\`${code}\`\n\nMasukkan di WhatsApp HP Anda.\n\n_Klik Cancel untuk kembali._`;
                
                await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: msgId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu' }]]
                    }
                });
            } catch (e) {
                bot.sendMessage(chatId, "❌ Gagal generate kode. Coba lagi.");
            }
        }, 5000);
    }
}

// --- COMMANDS ---
bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "Pilih metode login:", mainKeyboard);
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === 'l_qr') {
        // Karena awalannya adalah pesan teks (Pilih metode), kita kirim foto dummy dulu 
        // agar bisa di-editMedia kedepannya (Telegram tidak bisa edit Teks menjadi Foto secara langsung)
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        const placeholder = await bot.sendPhoto(chatId, 'https://placehold.jp/24/000000/ffffff/400x400.png?text=Generating%20QR...', {
            caption: "⏳ Sedang menyiapkan QR, mohon tunggu...",
            reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu_del' }]] }
        });
        initWA(chatId, 'QR', null, placeholder.message_id);
    }

    if (q.data === 'l_cd') {
        userState[chatId] = { step: 'WAIT_NUM', msgId: msgId };
        bot.editMessageText("📞 **Masukkan Nomor WA Anda:**\nContoh: 628xxx\n\n_Atau klik cancel jika batal._", {
            chat_id: chatId,
            message_id: msgId,
            reply_markup: {
                inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu' }]]
            }
        });
    }

    // Tombol Cancel (Kembali ke menu utama)
    if (q.data === 'back_to_menu') {
        if (sock) { sock.end(); sock = null; }
        bot.editMessageText("Pilih metode login:", {
            chat_id: chatId,
            message_id: msgId,
            reply_markup: mainKeyboard.reply_markup
        }).catch(() => {
            // Jika sebelumnya adalah foto, kita hapus dan kirim pesan baru
            bot.deleteMessage(chatId, msgId);
            bot.sendMessage(chatId, "Pilih metode login:", mainKeyboard);
        });
    }

    if (q.data === 'back_to_menu_del') {
        if (sock) { sock.end(); sock = null; }
        bot.deleteMessage(chatId, msgId);
        bot.sendMessage(chatId, "Pilih metode login:", mainKeyboard);
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId]?.step === 'WAIT_NUM' && msg.text && !msg.text.startsWith('/')) {
        const num = msg.text.replace(/[^0-9]/g, '');
        const targetMsgId = userState[chatId].msgId;
        
        bot.deleteMessage(chatId, msg.message_id).catch(() => {}); 
        bot.editMessageText("⏳ **Sedang meminta kode pairing...**", { chat_id: chatId, message_id: targetMsgId });
        
        initWA(chatId, 'CODE', num, targetMsgId);
        delete userState[chatId];
    }
});
