const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// PROTEKSI AGAR TIDAK "CRASHED NOW"
process.on('uncaughtException', (err) => console.log('Sistem Menahan Crash:', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection Ditahan:', reason));

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊' }
};

// --- FUNGSI TAMPILKAN TOMBOL UTAMA ---
function kirimMenuUtama(chatId) {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🌪 LOGIN QR 1", callback_data: 'login_1' }, { text: "🌊 LOGIN QR 2", callback_data: 'login_2' }],
                [{ text: "🛡️ CEK STATUS", callback_data: 'cek_status' }, { text: "♻️ RESTART", callback_data: 'fix_restart' }]
            ]
        }
    };
    bot.sendMessage(chatId, "🌪️ **NINJA STORM ENGINE**\nSilahkan pilih menu di bawah:", { parse_mode: 'Markdown', ...opts });
}

// --- CORE ENGINE WA ---
async function initWA(chatId, id) {
    // Jangan hapus folder di sini, hapus hanya jika logout agar tidak berat
    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Windows", "Chrome", "122.0.0"],
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false
    });

    engines[id].sock.ev.on('creds.update', saveCreds);

    engines[id].sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 10, margin: 2, errorCorrectionLevel: 'H' });
            if (engines[id].lastQrMsgId) try { await bot.deleteMessage(chatId, engines[id].lastQrMsgId); } catch (e) {}
            const sent = await bot.sendPhoto(chatId, buffer, { 
                caption: `${engines[id].color} **SCAN QR ${id}**\nUpdate: ${new Date().toLocaleTimeString()}` 
            });
            engines[id].lastQrMsgId = sent.message_id;
        }

        if (connection === 'open') {
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE** ✅`);
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                setTimeout(() => initWA(chatId, id), 5000);
            }
        }
    });
}

// --- HANDLER SEMUA PESAN & TOMBOL ---
bot.on('message', (msg) => {
    if (msg.text === '/start' || msg.text === '/login' || msg.text === 'RESTART') {
        kirimMenuUtama(msg.chat.id);
    }
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        bot.sendMessage(chatId, `⏳ Menyiapkan Engine ${id}...`);
        initWA(chatId, id);
    }

    if (data === 'cek_status') {
        let s = "🛡️ **STATUS ENGINE:**\n";
        for (let i=1; i<=2; i++) s += `${engines[i].color} E${i}: ${engines[i].sock?.user ? "✅" : "❌"}\n`;
        bot.sendMessage(chatId, s, { parse_mode: 'Markdown' });
    }

    if (data === 'fix_restart') {
        await bot.sendMessage(chatId, "♻️ Memproses Pembersihan Sesi...");
        // Cara restart yang lebih aman untuk panel
        if (fs.existsSync('./session_1')) fs.rmSync('./session_1', { recursive: true, force: true });
        if (fs.existsSync('./session_2')) fs.rmSync('./session_2', { recursive: true, force: true });
        bot.sendMessage(chatId, "✅ Sesi dibersihkan. Silahkan klik /start untuk memunculkan tombol kembali.");
    }
    bot.answerCallbackQuery(q.id);
});

console.log("Sistem Aktif. Menunggu perintah di Telegram...");
