const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

// --- PENGATURAN BLAST ---
const DAFTAR_NOMOR = ["628123456789", "628987654321"]; // Isi nomor target
const PESAN_BLAST = "Halo! Ini adalah pesan blast otomatis. 🚀";
const JEDA_DETIK = 10; // Dinaikkan ke 10 detik agar lebih aman dari blokir
// --------------------------

let isBlasting = false;
let suksesCount = 0;
let gagalCount = 0;
let totalTarget = 0;

async function startWA(chatId) {
    if (isBlasting) return bot.sendMessage(chatId, "⚠️ Blast masih berjalan. Gunakan /stop dulu jika ingin reset.");

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
                    caption: "📸 **SILAKAN SCAN**\n_Rekap otomatis akan muncul jika terputus atau distop._", 
                    parse_mode: 'Markdown' 
                });
            } catch (e) { console.log("Gagal kirim QR"); }
        }

        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            
            // LOGIKA REKAP SAAT TERPUTUS / TERBLOKIR
            if (isBlasting) {
                isBlasting = false;
                let rekapMati = `⚠️ **KONEKSI TERPUTUS (WA KELUAR/BLOKIR)**\n\n` +
                                `✅ BERHASIL : ${suksesCount}\n` +
                                `❌ GAGAL : ${gagalCount}\n` +
                                `📊 Terhenti di nomor ke-${suksesCount + gagalCount + 1}`;
                bot.sendMessage(chatId, rekapMati);
            }

            if (reason !== DisconnectReason.loggedOut) startWA(chatId);
        } 
        
        else if (connection === 'open') {
            isBlasting = true;
            suksesCount = 0;
            gagalCount = 0;
            totalTarget = DAFTAR_NOMOR.length;
            
            bot.sendMessage(chatId, `🚀 **WhatsApp Terhubung!**\nMemulai Blast ke ${totalTarget} nomor...\n_Jeda antar pesan: ${JEDA_DETIK} detik._`);

            for (const nomor of DAFTAR_NOMOR) {
                // CEK JIKA USER MENEKAN /STOP
                if (!isBlasting) {
                    let rekapStop = `🛑 **BLAST DIHENTIKAN USER**\n\n` +
                                    `✅ BERHASIL : ${suksesCount}\n` +
                                    `❌ GAGAL : ${gagalCount}\n` +
                                    `📊 Total diproses: ${suksesCount + gagalCount}`;
                    return bot.sendMessage(chatId, rekapStop);
                }

                try {
                    await sock.sendMessage(`${nomor}@s.whatsapp.net`, { text: PESAN_BLAST });
                    suksesCount++;
                    console.log(`✅ Sukses: ${nomor}`);
                } catch (err) {
                    gagalCount++;
                    console.log(`❌ Gagal: ${nomor}`);
                }
                
                // Tunggu jeda
                await new Promise(res => setTimeout(res, JEDA_DETIK * 1000));
            }

            // REKAP JIKA SELESAI NORMAL
            if (isBlasting) {
                isBlasting = false;
                let rekapSelesai = `🏁 **BLAST SELESAI SEMUA**\n\n` +
                                   `✅ BERHASIL : ${suksesCount}\n` +
                                   `❌ GAGAL : ${gagalCount}\n` +
                                   `📊 Total: ${totalTarget} nomor.`;
                bot.sendMessage(chatId, rekapSelesai);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

bot.onText(/\/start/, (msg) => {
    startWA(msg.chat.id);
});

bot.onText(/\/stop/, (msg) => {
    if (isBlasting) {
        isBlasting = false; // Ini akan memicu blok "if (!isBlasting)" di dalam loop
        bot.sendMessage(msg.chat.id, "⏳ Menunggu pesan terakhir selesai dikirim...");
    } else {
        bot.sendMessage(msg.chat.id, "❌ Tidak ada proses blast yang berjalan.");
    }
});
