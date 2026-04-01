const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

// 1. FUNGSI WA PAIRING (FOKUS UTAMA)
async function startWA(chatId, phoneNumber) {
    // Pastikan folder session_data dihapus manual dulu sebelum running script ini!
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        // Identitas Chrome Desktop biasanya lebih "diterima" oleh server WA
        browser: ["Chrome (Linux)", "Chrome", "120.0.0.0"], 
        printQRInTerminal: false,
        mobile: false // Harus false untuk pairing code
    });

    // Proses pengambilan kode
    if (phoneNumber && !sock.authState.creds.registered) {
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
        
        // Jeda 10 detik agar koneksi socket stabil dulu
        bot.sendMessage(chatId, `⏳ Sedang menghubungkan ke server WhatsApp... (10 detik)`);
        
        setTimeout(async () => {
            try {
                const code = await sock.getPairingCode(cleanNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                await bot.sendMessage(chatId, `🔑 **KODE PAIRING ANDA:**\n\n\`${formattedCode}\`\n\nSilahkan masukkan di WhatsApp (Linked Devices > Link with Phone Number)`, { parse_mode: "Markdown" });
            } catch (err) {
                console.error(err);
                await bot.sendMessage(chatId, "❌ **GAGAL LAGI.**\n\nKemungkinan nomor kamu kena *limit* atau *spam block* oleh WhatsApp. \n\n**Solusi:**\n1. Stop script ini.\n2. Hapus folder `session_data`.\n3. Tunggu **30 menit** baru coba lagi.");
            }
        }, 10000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **WHATSAPP TERHUBUNG!** Sekarang kamu bisa mulai blast.");
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWA(chatId, phoneNumber);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// 2. HANDLER TELEGRAM
bot.onText(/\/kode (.+)/, (msg, match) => {
    const phoneNumber = match[1];
    startWA(msg.chat.id, phoneNumber);
});

// Pesan saat bot baru dinyalakan
console.log("Bot sudah jalan. Silahkan kirim /kode nomor_wa di Telegram.");
