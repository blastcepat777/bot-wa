const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi Anti-Crash
process.on('uncaughtException', (err) => console.log('Error: ', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection: ', reason));

let stats = { totalBlast: 0, hariIni: 0 };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪', menuSent: false, isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊', menuSent: false, isInitializing: false }
};

// --- SETTINGAN KEYBOARD BAWAH (SCRIPT 2) ---
const menuBawah = {
    reply_markup: {
        keyboard: [
            [{ text: "📊 LAPORAN HARIAN" }],
            [{ text: "♻️ RESTART" }, { text: "🛡️ CEK STATUS WA" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

const sendMenuEngine = (chatId, id) => {
    bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE**\n\nSilahkan Pilih Aksi:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
                [{ text: "♻️ RESTART BOT", callback_data: 'restart_bot' }],
                [{ text: "❌ KELUAR", callback_data: 'batal' }]
            ]
        }
    });
};

async function initWA(chatId, id) {
    if (engines[id].isInitializing) return;
    engines[id].isInitializing = true;

    if (chatId && fs.existsSync(engines[id].session)) {
        try { fs.rmSync(engines[id].session, { recursive: true, force: true }); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        browser: ["Ninja Storm", "Chrome", "1.0.0"],
        syncFullHistory: false,
        printQRInTerminal: false,
        connectTimeoutMs: 60000
    });

    const sock = engines[id].sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        // --- LOGIKA QR CODE (SCRIPT 1) ---
        if (qr && chatId) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 8 });
                const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n🕒 Update: ${new Date().toLocaleTimeString('id-ID')}`;

                if (engines[id].lastQrMsgId) {
                    await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                }

                const sent = await bot.sendPhoto(chatId, buffer, { 
                    caption, 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{
