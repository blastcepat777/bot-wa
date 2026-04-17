const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

process.on('uncaughtException', (err) => console.error('Sistem Aman:', err.message));

let stats = { totalBlast: 0, hariIni: 0 };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊' }
};

const menuBawah = {
    reply_markup: {
        keyboard: [[{ text: "📊 LAPORAN HARIAN" }, { text: "♻️ RESTART" }, { text: "🛡️ CEK STATUS WA" }]],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

async function initWA(chatId, id) {
    // 1. HARD RESET SESSION (Hapus paksa folder agar tidak muter)
    if (fs.existsSync(engines[id].session)) {
        try { fs.rmSync(engines[id].session, { recursive: true, force: true }); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    if (engines[id].sock) { 
        try { engines[id].sock.logout(); } catch(e) {}
        engines[id].sock.terminate(); 
    }

    engines[id].sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        // PAKAI IDENTITAS BARU (Agar dianggap perangkat baru oleh WA)
        browser: ["Ninja Storm", "Safari", "17.0"], 
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        connectTimeoutMs: 120000, // Tambah waktu tunggu ke 2 menit
        defaultQueryTimeoutMs: 0,
        receivedPendingNotifications: false,
        // Fitur bypass agar tidak stuck saat login
        options: {
            connection: {
                maxRetries: 10,
                retryDelay: 3000
            }
        }
    });

    engines[id].sock.ev.on('creds.update', saveCreds);

    engines[id].sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            // QR dibuat sangat kontras (Hitam Putih Tajam)
            const buffer = await QRCode.toBuffer(qr, { 
                scale: 7, 
                margin: 4, 
                errorCorrectionLevel: 'H',
                color: { dark: '#000000', light: '#ffffff' }
            });
            
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            
            const sent = await bot.sendPhoto(chatId, buffer, { 
                caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n\n` +
                         `⚠️ **PENTING:**\n` +
                         `1. Pastikan di HP sudah LOGOUT dari semua perangkat tertaut.\n` +
                         `2. Gunakan koneksi internet stabil di HP.\n` +
                         `3. Tunggu 2-3 detik setelah scan.`,
                parse_mode: 'Markdown'
            });
            engines[id].lastQrMsgId = sent.message_id;
        }

        if (connection === 'open') {
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE!**\nSesi baru berhasil dibuat.`, menuBawah);
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                setTimeout(() => initWA(chatId, id), 10000);
            }
        }
    });
}

// --- HANDLER TELEGRAM ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.text === "📊 LAPORAN HARIAN") bot.sendMessage(chatId, `📊 Laporan: ${stats.hariIni}`, menuBawah);
    if (msg.text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ Restarting...", menuBawah);
        setTimeout(() => process.exit(0), 1000);
    }
    if (msg.text === "🛡️ CEK STATUS WA") {
        let s = "🛡️ **STATUS**\n";
        for (let i=1; i<=2; i++) s += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ON" : "❌ OFF"}\n`;
        bot.sendMessage(chatId, s, menuBawah);
    }
});

bot.on('callback_query', (q) => {
    if (q.data.startsWith('login_')) initWA(q.message.chat.id, q.data.split('_')[1]);
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "Pilih Engine:", {
        reply_markup: { inline_keyboard: [[{ text: "Engine 1", callback_data: 'login_1' }, { text: "Engine 2", callback_data: 'login_2' }]] }
    });
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "🌪️ Ninja Storm Ready", menuBawah));
