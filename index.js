const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

// --- PENGATURAN BLAST ---
const DAFTAR_NOMOR = ["628123456789", "628987654321"]; // Ganti nomor di sini
const PESAN_BLAST = "Halo! Ini adalah pesan blast otomatis. 🚀";
const JEDA_DETIK = 7; 
// --------------------------

async function startWA(chatId) {
    // Kita gunakan folder berbeda 'session_new' agar bersih
    const { state, saveCreds } = await useMultiFileAuthState('session_new');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.0"],
        // Menambahkan opsi ini agar koneksi lebih stabil
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // 1. Tampilkan Barcode
        if (qr) {
            console.log("🎯 Barcode ditemukan, mengirim ke Telegram...");
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 10 });
                await bot.sendPhoto(chatId, buffer, {
                    caption: "📸 **SCAN BARCODE INI**\n\nSilakan scan untuk memulai Blast otomatis.",
                    parse_mode: 'Markdown'
                });
            } catch (e) { console.log("Gagal kirim gambar ke Telegram"); }
        }

        // 2. Cek Koneksi
        if (connection === 'close') {
            const statusCode = lastDisconnect.error?.output?.statusCode;
            console.log("🔌 Koneksi tertutup, status:", statusCode);

            if (statusCode === DisconnectReason.loggedOut) {
                bot.sendMessage(chatId, "⚠️ Sesi telah keluar. Silakan ketik /start lagi untuk scan baru.");
            } else {
                // Hubungkan ulang otomatis jika bukan logout
                startWA(chatId);
            }
        } 
        
        // 3. Jika Berhasil Scan -> Langsung Blast
        else if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **Tersambung!** Memulai Blast ke " + DAFTAR_NOMOR.length + " nomor...");
            
            for (const nomor of DAFTAR_NOMOR) {
                try {
                    await sock.sendMessage(`${nomor}@s.whatsapp.net`, { text: PESAN_BLAST });
                    console.log(`✅ Sukses: ${nomor}`);
                    await new Promise(res => setTimeout(res, JEDA_DETIK * 1000));
                } catch (err) {
                    console.log(`❌ Gagal ${nomor}: ${err.message}`);
                }
            }
            bot.sendMessage(chatId, "🏁 **Selesai!** Semua pesan blast terkirim.");
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🔍 Menyiapkan sesi WhatsApp... Mohon tunggu.");
    startWA(msg.chat.id);
});

console.log("🚀 Server siap!");
