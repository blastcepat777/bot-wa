const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

async function startWA(chatId) {
    console.log("🛠 Memulai sistem WhatsApp untuk Chat ID: " + chatId);
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'info' }), // Kita set ke info agar kelihatan di Log Railway
        browser: ["Ubuntu", "Chrome", "20.0.0"],
        syncFullHistory: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // JIKA QR MUNCUL
        if (qr) {
            console.log("🎯 QR BERHASIL DIDAPAT!");
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 10, margin: 2 });
                await bot.sendPhoto(chatId, buffer, {
                    caption: "✅ **SCAN SEKARANG**\n\nBuka WA > Perangkat Tertaut > Scan.\n_Barcode berganti setiap 20 detik._",
                    parse_mode: 'Markdown'
                });
                console.log("📤 Barcode terkirim ke Telegram.");
            } catch (e) { 
                console.log("❌ Error kirim Telegram: " + e.message);
            }
        }

        if (connection === 'close') {
            console.log("🔌 Koneksi Terputus. Sebab: ", lastDisconnect.error?.message);
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWA(chatId);
        } else if (connection === 'open') {
            console.log("🔓 KONEKSI TERBUKA!");
            bot.sendMessage(chatId, "🎉 **WhatsApp Berhasil Terhubung!**");
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🔍 Sedang membangun koneksi ke WhatsApp... Jika dalam 30 detik barcode tidak muncul, harap cek Log Railway.");
    startWA(msg.chat.id);
});

console.log("🚀 SERVER STANDBY...");
