const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';

// Solusi 409 Conflict: Pastikan hanya ada satu koneksi polling
const bot = new TelegramBot(token, {
    polling: {
        autoStart: true,
        params: { timeout: 10 }
    }
});

async function startWhatsApp(chatId) {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.0"] 
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("👉 QR Ditemukan! Mengirim ke Telegram...");
            try {
                const qrBuffer = await QRCode.toBuffer(qr);
                // Kirim ulang barcode setiap kali muncul yang baru
                await bot.sendPhoto(chatId, qrBuffer, {
                    caption: "🚀 **BARCODE PAIRING ANDA**\n\nSilakan scan segera (berlaku 20 detik).\nJika sudah kadaluarsa, ketik /start lagi.",
                    parse_mode: 'Markdown'
                });
            } catch (err) {
                console.log("❌ Gagal kirim gambar: " + err.message);
            }
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsApp(chatId);
        } else if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **WhatsApp Terhubung!**");
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Menangani error polling secara halus
bot.on('polling_error', (error) => {
    if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        console.log("⚠️ Konflik Polling: Mencoba menstabilkan koneksi...");
    } else {
        console.error(error);
    }
});

bot.onText(/\/start/, (msg) => {
    startWhatsApp(msg.chat.id);
    bot.sendMessage(msg.chat.id, "⏳ Memulai sesi... Barcode akan muncul dalam beberapa detik.");
});

console.log("Bot Baileys-Telegram Aktif di Railway!");
