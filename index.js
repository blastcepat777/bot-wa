const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi Anti-Crash Global
process.on('uncaughtException', (err) => console.log('Log Keamanan:', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection Aman:', reason));

let stats = { totalBlast: 0, hariIni: 0 };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊' }
};

const menuBawah = {
    reply_markup: {
        keyboard: [[{ text: "📊 LAPORAN HARIAN" }, { text: "♻️ RESTART" }, { text: "🛡️ CEK STATUS WA" }]],
        resize_keyboard: true
    }
};

// --- FUNGSI UPDATE QR (DIBUAT RINGAN & CEPAT) ---
async function sendQR(chatId, id, qrString) {
    try {
        const buffer = await QRCode.toBuffer(qrString, { 
            scale: 9, 
            margin: 4, 
            errorCorrectionLevel: 'L' // Membuat barcode lebih renggang agar kamera HP langsung "Ngeh"
        });

        const caption = `${engines[id].color} **SCAN QR ENGINE ${id}**\n⌚ **Update:** ${new Date().toLocaleTimeString('id-ID')} WIB\n\n_Tips: Kalau muter, pastikan HP tidak sedang hemat baterai._`;

        if (engines[id].lastQrMsgId) {
            await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
        }

        const sent = await bot.sendPhoto(chatId, buffer, { 
            caption, 
            parse_mode: 'Markdown' 
        });
        engines[id].lastQrMsgId = sent.message_id;
    } catch (e) { console.log("Gagal buat QR:", e.message); }
}

async function initWA(chatId, id) {
    // Reset Folder Session Setiap Kali Login Baru (Wajib)
    if (fs.existsSync(engines[id].session)) {
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
        // PAKAI BROWSER INI AGAR SYNC LEBIH CEPAT
        browser: ["Mac OS", "Chrome", "122.0.0.0"],
        printQRInTerminal: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
    });

    engines[id].sock.ev.on('creds.update', saveCreds);

    engines[id].sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr) await sendQR(chatId, id, qr);

        if (connection === 'open') {
            if (engines[id].lastQrMsgId) {
                await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            }
            bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE!**\nBerhasil terhubung, Bos. Silakan lanjut kerja!`, menuBawah);
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                console.log(`Engine ${id} reconnecting...`);
                setTimeout(() => initWA(chatId, id), 5000);
            }
        }
    });
}

// --- HANDLER TELEGRAM ---
bot.on('callback_query', (q) => {
    const id = q.data.split('_')[1];
    bot.sendMessage(q.message.chat.id, `⏳ Meminta Barcode untuk Engine ${id}...`);
    initWA(q.message.chat.id, id);
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 Pilih Engine:", {
        reply_markup: {
            inline_keyboard: [[{ text: "🌪 Engine 1", callback_data: 'login_1' }, { text: "🌊 Engine 2", callback_data: 'login_2' }]]
        }
    });
});

bot.on('message', async (msg) => {
    if (msg.text === "♻️ RESTART") {
        await bot.sendMessage(msg.chat.id, "♻️ Restarting...");
        process.exit(0);
    }
    if (msg.text === "📊 LAPORAN HARIAN") bot.sendMessage(msg.chat.id, `📊 Blast: ${stats.totalBlast}`, menuBawah);
    if (msg.text === "🛡️ CEK STATUS WA") {
        let s = "🛡️ **STATUS**\n";
        for (let i=1; i<=2; i++) s += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅" : "❌"}\n`;
        bot.sendMessage(msg.chat.id, s, menuBawah);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "🌪 **NINJA STORM ENGINE READY**", menuBawah));
