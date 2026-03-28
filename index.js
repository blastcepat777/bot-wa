const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

// --- PENGATURAN BLAST (UBAH DI SINI) ---
const DAFTAR_NOMOR = ["6285219094574", "628987654321"]; // Tambahkan nomor tujuan di sini
const PESAN_BLAST = "Halo! Ini adalah pesan blast otomatis setelah scan. 🚀";
const JEDA_DETIK = 5; // Jeda antar pesan agar tidak kena Banned
// ---------------------------------------

// Variabel Kontrol
let isBlasting = false;

async function startWA(chatId) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.0"]
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 10 });
                await bot.sendPhoto(chatId, buffer, {
                    caption: "📸 **SCAN SEKARANG**\n_Begitu di-scan, bot akan langsung kirim Blast._",
                    parse_mode: 'Markdown'
                });
            } catch (e) { console.log("Gagal kirim QR"); }
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWA(chatId);
        } else if (connection === 'open') {
            isBlasting = true; // Set status sedang membroadcast
            bot.sendMessage(chatId, "🎉 **WhatsApp Terhubung!** Memulai proses Blast otomatis...\n\n_Ketik /stop jika ingin membatalkan._");
            
            // --- PROSES BLAST DIMULAI ---
            for (const nomor of DAFTAR_NOMOR) {
                // CEK APAKAH USER MENEKAN STOP
                if (!isBlasting) {
                    bot.sendMessage(chatId, "🛑 **Blast Dihentikan Paksa.**");
                    console.log("Blast distop oleh user.");
                    break; // Keluar dari perulangan
                }

                try {
                    const jid = `${nomor}@s.whatsapp.net`;
                    await sock.sendMessage(jid, { text: PESAN_BLAST });
                    console.log(`✅ Terkirim ke: ${nomor}`);
                    
                    // Jeda agar aman
                    await new Promise(res => setTimeout(res, JEDA_DETIK * 1000));
                } catch (err) {
                    console.log(`❌ Gagal ke ${nomor}: ${err.message}`);
                }
            }

            if (isBlasting) {
                isBlasting = false;
                bot.sendMessage(chatId, "🏁 **Blast Selesai!** Semua nomor telah dikirim.");
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Handler perintah /start
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🔍 Sedang menyiapkan Barcode...");
    startWA(msg.chat.id);
});

// Handler perintah /stop
bot.onText(/\/stop/, (msg) => {
    if (isBlasting) {
        isBlasting = false;
        bot.sendMessage(msg.chat.id, "⏳ Sedang menghentikan antrean pesan... mohon tunggu.");
    } else {
        bot.sendMessage(msg.chat.id, "❌ Tidak ada proses blast yang sedang berjalan.");
    }
});

console.log("🚀 Server Blast Standby...");
