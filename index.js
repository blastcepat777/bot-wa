const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

async function startWhatsApp(chatId) {
    // Menggunakan folder auth_info_baileys untuk simpan login
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        // Menyamar sebagai browser agar lebih stabil
        browser: ["Ubuntu", "Chrome", "20.0.0"] 
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // JIKA QR MUNCUL
        if (qr) {
            console.log("👉 QR Ditemukan! Mengirim ke Telegram...");
            try {
                const qrBuffer = await QRCode.toBuffer(qr);
                await bot.sendPhoto(chatId, qrBuffer, {
                    caption: "🚀 **BARCODE PAIRING ANDA**\n\nSilakan scan segera melalui WhatsApp > Perangkat Tertaut.\n\n*Barcode ini akan berganti otomatis.*",
                    parse_mode: 'Markdown'
                });
            } catch (err) {
                console.log("❌ Gagal kirim gambar: " + err.message);
            }
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("Koneksi terputus, mencoba menghubungkan ulang...");
                startWhatsApp(chatId);
            }
        } else if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **WhatsApp Terhubung!** Bot Anda sekarang sudah siap digunakan.");
            console.log("Koneksi Terbuka!");
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Menghapus error 409 Conflict dengan memastikan polling bersih
bot.on('polling_error', (error) => {
    if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        console.log("⚠️ Ada bot lain yang nyala dengan token sama! Matikan bot di Pterodactyl.");
    }
});

bot.onText(/\/start/, (msg) => {
    startWhatsApp(msg.chat.id);
    bot.sendMessage(msg.chat.id, "⏳ Sedang menyiapkan sesi WhatsApp... Tunggu sebentar sampai barcode muncul.");
});

console.log("Bot Baileys-Telegram Ready!");
