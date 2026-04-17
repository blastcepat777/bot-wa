const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi Anti-Crash Global agar panel tidak merah
process.on('uncaughtException', (err) => console.log('Sistem Aman dari Crash:', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection Aman:', reason));

let stats = { totalBlast: 0, hariIni: 0, terahirUpdate: new Date().toLocaleDateString('id-ID') };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

const menuBawah = {
    reply_markup: {
        keyboard: [[
            { text: "📊 LAPORAN HARIAN" }, 
            { text: "♻️ RESTART" }, 
            { text: "🛡️ CEK STATUS WA" }
        ]],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

const safeDelete = async (chatId, msgId) => {
    if (msgId) { try { await bot.deleteMessage(chatId, msgId); } catch (e) {} }
};

// --- FUNGSI UPDATE QR (FIX SCAN & STABIL) ---
async function sendOrUpdateQR(chatId, id, qrString) {
    try {
        // PERBAIKAN: Generate Buffer dengan opsi yang membuat barcode kontras & jelas
        const buffer = await QRCode.toBuffer(qrString, { 
            scale: 8, 
            margin: 2,
            errorCorrectionLevel: 'H' // High error correction agar mudah discan meski layar redup
        });

        const sekarang = new Date();
        const jam = sekarang.toLocaleTimeString('id-ID');
        const otherId = id == 1 ? 2 : 1;
        
        const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n` +
                        `⌚ **Update Jam:** ${jam}\n\n` +
                        `_Gunakan fitur 'Tautkan Perangkat' di WhatsApp HP Anda._`;

        const markup = {
            inline_keyboard: [
                [{ text: `(ON)${engines[otherId].color} QR${otherId}`, callback_data: `login_${otherId}` }],
                [{ text: "❌ CANCEL", callback_data: 'batal' }]
            ]
        };

        await safeDelete(chatId, engines[id].lastQrMsgId);
        const sent = await bot.sendPhoto(chatId, buffer, { caption, reply_markup: markup, parse_mode: 'Markdown' });
        engines[id].lastQrMsgId = sent.message_id;
    } catch (err) {
        console.log("Gagal generate QR Buffer:", err.message);
    }
}

async function initWA(chatId, id) {
    // Bersihkan sesi lama jika belum login agar tidak stuck/loop
    if (!engines[id].sock?.user && fs.existsSync(engines[id].session)) {
        try { fs.rmSync(engines[id].session, { recursive: true, force: true }); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Windows", "Chrome", "11.0.0"],
        syncFullHistory: false,                   // PERBAIKAN: Matikan agar tidak berat/crash
        shouldSyncHistoryMessage: () => false,    // PERBAIKAN: Agar HP tidak loading lama
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    engines[id].sock.ev.on('creds.update', saveCreds);

    engines[id
