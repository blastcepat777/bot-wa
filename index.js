const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

async function startWhatsApp(chatId) {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Tetap muncul di console Railway
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // JIKA ADA QR CODE BARU
        if (qr) {
            console.log("QR Terdeteksi, mengirim ke Telegram...");
            const qrBuffer = await QRCode.toBuffer(qr);
            bot.sendPhoto(chatId, qrBuffer, {
                caption: "🚀 **BARCODE PAIRING BARU**\n\nSilakan scan segera (berlaku 20 detik).\nJika kadaluarsa, ketik /start lagi.",
                parse_mode: 'Markdown'
            });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsApp(chatId);
        } else if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **WhatsApp Terhubung!** Bot Anda sekarang sudah online.");
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

bot.onText(/\/start/, (msg) => {
    startWhatsApp(msg.chat.id);
    bot.sendMessage(msg.chat.id, "⏳ Memulai sesi WhatsApp... Barcode akan muncul di bawah jika belum tertaut.");
});

console.log("Bot Baileys-Telegram Ready!");
