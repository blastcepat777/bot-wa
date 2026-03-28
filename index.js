const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

async function startWhatsApp(chatId) {
    // 1. Setup Auth (Sesi Login)
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    // 2. Buat Koneksi Baileys (Tanpa printQRInTerminal agar pesan kuning hilang)
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.0"]
    });

    // 3. Tangkap Perubahan Koneksi
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // JIKA QR CODE MUNCUL
        if (qr) {
            console.log("✅ QR Ditemukan! Mengkonversi ke Gambar...");
            try {
                // Ubah QR String jadi Gambar (Buffer)
                const qrBuffer = await QRCode.toBuffer(qr, { scale: 8 });
                
                // Kirim ke Telegram
                await bot.sendPhoto(chatId, qrBuffer, {
                    caption: "📸 **SCAN BARCODE INI SEGERA**\n\nBuka WhatsApp > Perangkat Tertaut > Tautkan Perangkat.\n\n_Barcode akan berganti otomatis jika belum di-scan._",
                    parse_mode: 'Markdown'
                });
                console.log("🚀 Barcode berhasil dikirim ke Telegram!");
            } catch (err) {
                console.error("❌ Gagal mengirim QR:", err.message);
            }
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWhatsApp(chatId);
        } else if (connection === 'open') {
            bot.sendMessage(chatId, "🎉 **BERHASIL!** WhatsApp Anda sudah terhubung.");
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Handler Tombol Start
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "⏳ Menghubungkan ke server WhatsApp... Mohon tunggu gambar barcode muncul.");
    startWhatsApp(msg.chat.id);
});

console.log("--- BOT SUDAH AKTIF ---");
