const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi Anti-Crash
process.on('uncaughtException', (err) => console.log('Sistem Aman:', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection Aman:', reason));

let stats = { totalBlast: 0, hariIni: 0, terahirUpdate: new Date().toLocaleDateString('id-ID') };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

const menuBawah = {
    reply_markup: {
        keyboard: [[{ text: "📊 LAPORAN HARIAN" }, { text: "♻️ RESTART" }, { text: "🛡️ CEK STATUS WA" }]],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

const safeDelete = async (chatId, msgId) => {
    if (msgId) { try { await bot.deleteMessage(chatId, msgId); } catch (e) {} }
};

async function sendOrUpdateQR(chatId, id, buffer) {
    const sekarang = new Date();
    const jam = sekarang.toLocaleTimeString('id-ID');
    const otherId = id == 1 ? 2 : 1;
    const caption = `${engines[id].color} **SCAN QR ENGINE ${id}**\n⌚ Jam: ${jam}\n\n_Jika gagal, hapus folder session lalu login ulang._`;

    await safeDelete(chatId, engines[id].lastQrMsgId);
    const sent = await bot.sendPhoto(chatId, buffer, { 
        caption, 
        reply_markup: { inline_keyboard: [[{ text: `(ON)${engines[otherId].color} QR${otherId}`, callback_data: `login_${otherId}` }], [{ text: "❌ CANCEL", callback_data: 'batal' }]] },
        parse_mode: 'Markdown' 
    });
    engines[id].lastQrMsgId = sent.message_id;
}

// --- FUNGSI INIT WA (VERSI STABIL 2024) ---
async function initWA(chatId, id) {
    // Hapus sesi jika tidak ada file kredensial (agar tidak stuck)
    if (!fs.existsSync(`${engines[id].session}/creds.json`)) {
        if (fs.existsSync(engines[id].session)) {
            fs.rmSync(engines[id].session, { recursive: true, force: true });
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    
    // Ambil versi WA terbaru secara paksa
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        auth: state,
        version: version, // Pakai versi terbaru hasil fetch
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        // Konfigurasi Browser standar agar dikenali WA
        browser: ["Mac OS", "Chrome", "121.0.0.0"], 
        syncFullHistory: false, 
        shouldSyncHistoryMessage: () => false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: false
    });

    engines[id].sock.ev.on('creds.update', saveCreds);

    engines[id].sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 5 });
            await sendOrUpdateQR(chatId, id, buffer);
        }

        if (connection === 'open') {
            await safeDelete(chatId, engines[id].lastQrMsgId);
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE** ✅`, {
                reply_markup: {
                    inline_keyboard: [[{ text: `🔍 FILTER 1`, callback
