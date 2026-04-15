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
app.get('/', (req, res) => res.send('ACTIVE'));
app.listen(process.env.PORT || 3000);

let sock;
let userState = {};

const loginMenu = {
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

    // Hapus instansi lama agar tidak duplikat
    if (sock) {
        sock.ev.removeAllListeners('connection.update');
        sock.ev.removeAllListeners('creds.update');
        try { sock.end(); } catch (e) {}
    }

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        // --- UPDATE QR DI TEMPAT ---
        if (qr && method === 'QR' && msgId) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 8 });
                await bot.editMessageMedia({
                    type: 'photo',
                    media: buffer,
                    caption: `📸 **SCAN SEKARANG**\nUpdate: ${new Date().toLocaleTimeString()}`,
                    parse_mode: 'Markdown'
                }, {
                    chat_id: chatId,
                    message_id: msgId,
                    reply_markup: {
                        inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu_del' }]]
                    }
                }).catch(() => {}); // Abaikan jika telegram rate limit
            } catch (err) {}
        }

        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **TERHUBUNG!**");
            if (msgId) bot.deleteMessage(chatId, msgId).catch(() => {});
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut && method !== 'STOP') {
                initWA(chatId, method, phoneNumber, msgId);
            }
        }
    });

    // --- PAIRING CODE ---
    if (method === 'CODE' && phoneNumber && msgId) {
        // Beri jeda agar socket benar-benar siap
        await new Promise(r => setTimeout(r, 6000));
        try {
            const code = await sock.requestPairingCode(phoneNumber);
            await bot.editMessageText(`🔑 **KODE PAIRING:**\n\n\`${code}\`\n\nMasukkan di HP Anda.`, {
                chat_id: chatId,
                message_id: msgId,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu' }]] }
            });
        } catch (e) {
            bot.editMessageText("❌ Gagal. Coba lagi.", { chat_id: chatId, message_id: msgId });
        }
    }
}

// --- TELEGRAM EVENTS ---
bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "Pilih metode:", loginMenu);
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === 'l_qr') {
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        // Kirim placeholder awal
        const p = await bot.sendPhoto(chatId, 'https://placehold.jp/40/333333/ffffff/400x400.png?text=Menunggu%20QR...', {
            caption: "⏳ Sedang memuat QR dari server...",
            reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu_del' }]] }
        });
        initWA(chatId, 'QR', null, p.message_id);
    }

    if (q.data === 'l_cd') {
        userState[chatId] = { step: 'NUM', msgId: msgId };
        bot.editMessageText("📞 **Nomor WA (628xxx):**", {
            chat_id: chatId,
            message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu' }]] }
        });
    }

    if (q.data.startsWith('back_to_menu')) {
        if (sock) { sock.ev.removeAllListeners('connection.update'); try { sock.end(); } catch(e){} }
        if (q.data.includes('del')) await bot.deleteMessage(chatId, msgId).catch(() => {});
        bot.sendMessage(chatId, "Pilih metode:", loginMenu);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId]?.step === 'NUM' && msg.text && !msg.text.startsWith('/')) {
        const num = msg.text.replace(/[^0-9]/g, '');
        const targetId = userState[chatId].msgId;
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        bot.editMessageText("⏳ **Generating Code...**", { chat_id: chatId, message_id: targetId });
        initWA(chatId, 'CODE', num, targetId);
        delete userState[chatId];
    }
});
