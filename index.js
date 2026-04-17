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

// --- FUNGSI UPDATE QR DENGAN JAM & TANGGAL ---
async function sendOrUpdateQR(chatId, id, buffer) {
    const sekarang = new Date();
    const tanggal = sekarang.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const jam = sekarang.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const otherId = id == 1 ? 2 : 1;
    const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n` +
                    `📅 **Tanggal:** ${tanggal}\n` +
                    `⌚ **Update Jam:** ${jam}\n\n` +
                    `_Jika barcode tidak discan, klik tombol login lagi._`;

    const markup = {
        inline_keyboard: [
            [{ text: `(ON)${engines[otherId].color} QR${otherId}`, callback_data: `login_${otherId}` }],
            [{ text: "❌ CANCEL", callback_data: 'batal' }]
        ]
    };

    await safeDelete(chatId, engines[id].lastQrMsgId);
    const sent = await bot.sendPhoto(chatId, buffer, { caption, reply_markup: markup, parse_mode: 'Markdown' });
    engines[id].lastQrMsgId = sent.message_id;
}

// --- FUNGSI UTAMA (FIX BARCODE STUCK) ---
async function initWA(chatId, id) {
    // 1. Bersihkan session agar tidak konflik
    if (fs.existsSync(engines[id].session)) {
        try { fs.rmSync(engines[id].session, { recursive: true, force: true }); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    
    // 2. Gunakan versi WA Web terbaru secara manual agar sinkronisasi lancar
    const { version, isLatest } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        // --- SETTINGAN WAJIB AGAR TIDAK MUTER ---
        browser: ["Windows", "Chrome", "11.0.0"], 
        syncFullHistory: false,      // WAJIB FALSE: Biar ga download chat ribuan
        shouldSyncHistoryMessage: () => false, // MATIKAN sinkronisasi history
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        generateHighQualityLinkPreview: false,
    });

    engines[id].sock.ev.on('creds.update', saveCreds);

    engines[id].sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 4 });
            await sendOrUpdateQR(chatId, id, buffer);
        }

        if (connection === 'open') {
            await safeDelete(chatId, engines[id].lastQrMsgId);
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE** ✅\nSilahkan pilih filter:`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `🔍 FILTER 1`, callback_data: `filter_1` }, { text: `🔍 FILTER 2`, callback_data: `filter_2` }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                }
            });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                initWA(chatId, id);
            } else {
                engines[id].sock = null;
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
        await bot.sendMessage(chatId, "♻️ **BERHASIL RESTART...**", {
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]] }
        });
        setTimeout(() => process.exit(0), 1000);
    }
    if (msg.text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **REKAPAN BLAST**\n\nHari Ini: ${stats.hariIni}\nTotal: ${stats.totalBlast}`, menuBawah);
    }
    if (msg.text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **CEK KEAMANAN WA**\n\n";
        for (let i = 1; i <= 2; i++) {
            status += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ AMAN" : "❌ LIMIT/OFF"}\n`;
        }
        bot.sendMessage(chatId, status, menuBawah);
