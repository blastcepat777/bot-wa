const TelegramBot = require('node-telegram-bot-api');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');

// ambil token dari Railway
const token = process.env.BOT_TOKEN;

if (!token) {
    console.error("BOT TOKEN TIDAK ADA!");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// simpan session per user
const sessions = {};

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, '⏳ Menghubungkan WhatsApp...');

    // buat auth state per user
    const { state, saveCreds } = await useMultiFileAuthState(`session-${chatId}`);

    const sock = makeWASocket({
        auth: state
    });

    sessions[chatId] = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;

        if (qr) {
            console.log('QR TERGENERATE');
            const qrImage = await QRCode.toBuffer(qr);
            bot.sendPhoto(chatId, qrImage, { caption: '📲 Scan QR WhatsApp kamu' });
        }

        if (connection === 'open') {
            bot.sendMessage(chatId, '✅ WhatsApp Connected!');
        }

        if (connection === 'close') {
            bot.sendMessage(chatId, '❌ Koneksi terputus, ketik /start lagi');
        }
    });
});
