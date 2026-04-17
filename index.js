const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Agar panel tidak "Crashed Now"
process.on('uncaughtException', (err) => console.log('Safe:', err.message));
process.on('unhandledRejection', (reason) => console.log('Safe:', reason));

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

// --- FUNGSI TAMPILKAN TOMBOL LOGIN ---
function kirimMenuUtama(chatId) {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🌪 LOGIN QR 1", callback_data: 'login_1' }, { text: "🌊 LOGIN QR 2", callback_data: 'login_2' }],
                [{ text: "🛡️ STATUS", callback_data: 'cek_status' }, { text: "♻️ RESTART & HAPUS SESI", callback_data: 'fix_restart' }]
            ]
        }
    };
    bot.sendMessage(chatId, "🌪️ **NINJA STORM ENGINE**\nKlik tombol di bawah untuk login:", { parse_mode: 'Markdown', ...opts });
}

async function initWA(chatId, id) {
    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Windows", "Chrome", "122.0.0"],
        syncFullHistory: false, // Biar gak muter terus
        shouldSyncHistoryMessage: () => false
    });

    engines[id].sock.ev.on('creds.update', saveCreds);
    engines[id].sock.ev.on('connection.update', async (u) => {
        const { connection, qr } = u;
        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 10, margin: 2 });
            const sent = await bot.sendPhoto(chatId, buffer, { caption: `**SCAN QR ${id} SEKARANG**` });
            engines[id].lastQrMsgId = sent.message_id;
        }
        if (connection === 'open') bot.sendMessage(chatId, `✅ ENGINE ${id} ONLINE!`);
    });
}

bot.on('message', (msg) => {
    if (msg.text === '/start' || msg.text === '/login') kirimMenuUtama(msg.chat.id);
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data.startsWith('login_')) initWA(chatId, data.split('_')[1]);

    if (data === 'fix_restart') {
        // 1. Kasih info ke user
        await bot.sendMessage(chatId, "♻️ Sedang membersihkan sesi lama...");
        
        // 2. Hapus folder sesi secara aman
        if (fs.existsSync('./session_1')) fs.rmSync('./session_1', { recursive: true, force: true });
        if (fs.existsSync('./session_2')) fs.rmSync('./session_2', { recursive: true, force: true });

        // 3. LANGSUNG MUNCULKAN LAGI TOMBOL LOGIN-NYA!
        kirimMenuUtama(chatId);
    }
    
    bot.answerCallbackQuery(q.id);
});
