const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

// --- PENGATURAN BLAST ---
const DAFTAR_NOMOR = ["6285219094574", "628987654321"]; // Ganti nomor di sini
const PESAN_BLAST = "Halo! Ini adalah pesan blast otomatis. 🚀";
const JEDA_DETIK = 7; 
// --------------------------

let isBlasting = false;
let suksesCount = 0;
let gagalCount = 0;
let lastChatId = null;

async function startWA(chatId) {
    lastChatId = chatId;
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

        // 1. Kirim QR jika ada
        if (qr) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 10 });
                await bot.sendPhoto(chatId, buffer, { caption: "📸 **SILAKAN SCAN**\n_Rekap akan muncul otomatis jika WA terputus/terblokir._", parse_mode: 'Markdown' });
            } catch (e) { console.log("Gagal kirim QR"); }
        }

        // 2. JIKA KONEKSI MATI (TERBLOKIR ATAU KELUAR)
        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            
            // TAMPILKAN REKAP TERAKHIR SAAT MATI
            if (isBlasting) {
                let pesanRekap = `⚠️ **KONEKSI TERPUTUS / WA KELUAR**\n\n` +
                                 `✅ BERHASIL : ${suksesCount}\n` +
                                 `❌ GAGAL : ${gagalCount}\n` +
                                 `📊 Status Akhir sebelum terputus.`;
                await bot.sendMessage(chatId, pesanRekap);
                isBlasting = false;
            }

            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWA(chatId);
        } 
        
        // 3. JIKA TERHUBUNG -> MULAI BLAST
        else if (connection === 'open') {
            isBlasting = true;
            suksesCount = 0; // Reset hitungan saat baru mulai
            gagalCount = 0;
            
            bot.sendMessage(chatId, `🚀 **WhatsApp Terhubung!**\nMemulai Blast ke ${DAFTAR_NOMOR.length} nomor...`);

            for (const nomor of DAFTAR_NOMOR) {
                if (!isBlasting) break;

                try {
                    const jid = `${nomor}@s.whatsapp.net`;
                    await sock.sendMessage(jid, { text: PESAN_BLAST });
                    suksesCount++;
                    console.log(`✅ Sukses: ${nomor}`);
                } catch (err) {
                    gagalCount++;
                    console.log(`❌ Gagal: ${nomor}`);
                }
                await new Promise(res => setTimeout(res, JEDA_DETIK * 1000));
            }

            if (isBlasting) {
                bot.sendMessage(chatId, `🏁 **BLAST SELESAI**\n\n✅ BERHASIL : ${suksesCount}\n❌ GAGAL : ${gagalCount}`);
                isBlasting = false;
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🔍 Menyiapkan Sesi...");
    startWA(msg.chat.id);
});

bot.onText(/\/stop/, (msg) => {
    isBlasting = false;
    bot.sendMessage(msg.chat.id, "🛑 Menghentikan Blast...");
});

console.log("🚀 Bot Rekap Otomatis Siap!");
