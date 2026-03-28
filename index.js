const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

// --- KONFIGURASI BLAST ---
const DAFTAR_NOMOR = ["6285219094574", "628987654321"]; // Tambahkan nomor tujuan di sini
const PESAN_BLAST = "Halo! Ini adalah pesan blast otomatis setelah scan. 🚀";
const JEDA_DETIK = 7; // Jeda lebih lama (7 detik) agar lebih aman dari Banned
// --------------------------

async function startWA(chatId) {
    const sessionFolder = 'session_data';

    // RESET SESI SETIAP KALI /START (Agar pasti muncul Barcode baru)
    if (fs.existsSync(sessionFolder)) {
        console.log("Menghapus sesi lama agar barcode baru muncul...");
        fs.rmSync(sessionFolder, { recursive: true, force: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.0"]
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // 1. KIRIM BARCODE JIKA MUNCUL
        if (qr) {
            console.log("🎯 QR Didapat!");
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 10 });
                await bot.sendPhoto(chatId, buffer, {
                    caption: "📸 **BARCODE BARU SIAP SCAN**\n\nSilakan scan melalui WhatsApp HP Anda.\n_Begitu terhubung, blast akan otomatis jalan._",
                    parse_mode: 'Markdown'
                });
            } catch (e) { console.log("Gagal kirim QR ke Telegram"); }
        }

        // 2. JIKA TERPUTUS
        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                // Reconnect otomatis jika bukan karena Logout
                startWA(chatId);
            }
        } 
        
        // 3. JIKA SUDAH SCAN (OPEN) -> OTOMATIS BLAST
        else if (connection === 'open') {
            console.log("🔓 WhatsApp Terhubung!");
            bot.sendMessage(chatId, "✅ **Terhubung!** Memulai proses Blast ke " + DAFTAR_NOMOR.length + " nomor...");

            for (const nomor of DAFTAR_NOMOR) {
                try {
                    const jid = `${nomor}@s.whatsapp.net`;
                    await sock.sendMessage(jid, { text: PESAN_BLAST });
                    console.log(`✅ Berhasil kirim ke: ${nomor}`);
                    
                    // Jeda antar pesan
                    await new Promise(res => setTimeout(res, JEDA_DETIK * 1000));
                } catch (err) {
                    console.log(`❌ Gagal ke ${nomor}: ${err.message}`);
                }
            }
            bot.sendMessage(chatId, "🏁 **Proses Blast Selesai!**");
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Handler tombol /start
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🔄 Melakukan Reset Sesi... Harap tunggu barcode muncul.");
    startWA(msg.chat.id);
});

console.log("🚀 Server Blast siap dijalankan!");
