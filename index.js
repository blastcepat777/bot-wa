const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi Anti-Crash Global
process.on('uncaughtException', (err) => console.log('Sistem Aman dari Crash:', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection Aman:', reason));

let stats = { totalBlast: 0, hariIni: 0, terahirUpdate: new Date().toLocaleDateString('id-ID') };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

// --- KEYBOARD SEJAJAR 3 TOMBOL ---
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

// --- FUNGSI UPDATE QR (DIPERTAJAM & FIX STUCK) ---
async function sendOrUpdateQR(chatId, id, qrString) {
    try {
        // PERBAIKAN: Scale dinaikkan ke 10 & Error Correction level High agar sangat tajam
        const buffer = await QRCode.toBuffer(qrString, { 
            scale: 10, 
            margin: 2,
            errorCorrectionLevel: 'H' 
        });

        const sekarang = new Date();
        const jam = sekarang.toLocaleTimeString('id-ID');
        const otherId = id == 1 ? 2 : 1;
        
        const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n` +
                        `⌚ **Update Jam:** ${jam}\n\n` +
                        `_Pastikan koneksi stabil. Jika muter terus, hapus folder session lalu scan ulang._`;

        const markup = {
            inline_keyboard: [
                [{ text: `(ON)${engines[otherId].color} QR${otherId}`, callback_data: `login_${otherId}` }],
                [{ text: "❌ CANCEL", callback_data: 'batal' }]
            ]
        };

        await safeDelete(chatId, engines[id].lastQrMsgId);
        const sent = await bot.sendPhoto(chatId, buffer, { caption, reply_markup: markup, parse_mode: 'Markdown' });
        engines[id].lastQrMsgId = sent.message_id;
    } catch (e) {
        console.log("Gagal generate QR:", e.message);
    }
}

async function initWA(chatId, id) {
    // FIX: Bersihkan sesi lama jika engine belum terhubung agar QR tidak mutar
    if (!engines[id].sock?.user) {
        if (fs.existsSync(engines[id].session)) {
            try { fs.rmSync(engines[id].session, { recursive: true, force: true }); } catch (e) {}
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"], // Identitas browser lebih umum/stabil
        // PERBAIKAN: Matikan sinkronisasi riwayat agar tidak mutar/stuck di HP
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    engines[id].sock.ev.on('creds.update', saveCreds);
    engines[id].sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;
        
        if (qr) {
            // Gunakan fungsi pertajam barcode
            await sendOrUpdateQR(chatId, id, qr);
        }

        if (connection === 'open') {
            await safeDelete(chatId, engines[id].lastQrMsgId);
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE** ✅\nSilahkan pilih filter:`, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: `🔍 FILTER 1`, callback_data: `filter_1` },
                            { text: `🔍 FILTER 2`, callback_data: `filter_2` }
                        ],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                }
            });
        }

        if (connection === 'close') {
            const status = lastDisconnect?.error?.output?.statusCode;
            if (status !== DisconnectReason.loggedOut) {
                initWA(chatId, id);
            } else {
                engines[id].sock = null;
                if (fs.existsSync(engines[id].session)) fs.rmSync(engines[id].session, { recursive: true, force: true });
            }
        }
    });
}

// --- HANDLER PESAN ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.text === "♻️ RESTART") {
        if (fs.existsSync('./session_1')) fs.rmSync('./session_1', { recursive: true, force: true });
        if (fs.existsSync('./session_2')) fs.rmSync('./session_2', { recursive: true, force: true });
        
        await bot.sendMessage(chatId, "♻️
