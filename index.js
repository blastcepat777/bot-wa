const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Data Stats
let stats = { totalBlast: 0, hariIni: 0 };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false }
};

// Keyboard Menu Utama
const menuBawah = {
    reply_markup: {
        keyboard: [[{ text: "📊 LAPORAN HARIAN" }, { text: "♻️ RESTART" }, { text: "🛡️ CEK STATUS WA" }]],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

async function initWA(chatId, id) {
    // LOCK: Mencegah klik ganda yang bikin muter
    if (engines[id].isInitializing) return;
    engines[id].isInitializing = true;

    // Bersihkan sesi lama supaya fresh
    if (fs.existsSync(engines[id].session)) {
        try { fs.rmSync(engines[id].session, { recursive: true, force: true }); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    if (engines[id].sock) {
        try { engines[id].sock.terminate(); } catch (e) {}
    }

    engines[id].sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        browser: ["Ninja Storm", "MacOS", "3.0.0"], // MacOS lebih stabil untuk pairing
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        connectTimeoutMs: 60000,
        receivedPendingNotifications: false,
    });

    engines[id].sock.ev.on('creds.update', saveCreds);

    engines[id].sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            try {
                // QR dibuat sedikit lebih besar agar mudah di-scan
                const buffer = await QRCode.toBuffer(qr, { scale: 6, margin: 3, errorCorrectionLevel: 'M' });
                
                // Kirim QR baru dulu
                const sent = await bot.sendPhoto(chatId, buffer, { 
                    caption: `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG**\n_Expired dalam 45 detik..._`,
                    parse_mode: 'Markdown'
                });

                // Baru hapus pesan lama (Kunci agar tidak muter/lag)
                if (engines[id].lastQrMsgId) {
                    await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                }
                engines[id].lastQrMsgId = sent.message_id;
            } catch (e) { console.log("Gagal buat QR"); }
        }

        if (connection === 'open') {
            engines[id].isInitializing = false;
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE!**\nSistem siap digunakan Bos.`, menuBawah);
        }

        if (connection === 'close') {
            engines[id].isInitializing = false;
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                setTimeout(() => initWA(chatId, id), 5000);
            }
        }
    });
}

// --- HANDLER PESAN TEKS ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **STATISTIK BLAST**\n\n- Hari Ini: ${stats.hariIni}\n- Total: ${stats.totalBlast}`, menuBawah);
    }

    if (text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ **SYSTEM RESTARTING...**");
        setTimeout(() => process.exit(0), 1000);
    }

    if (text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **STATUS KONEKSI**\n\n";
        for (let i = 1; i <= 2; i++) {
            status += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        }
        bot.sendMessage(chatId, status, menuBawah);
    }
});

// --- HANDLER TOMBOL ---
bot.on('callback_query', (q) => {
    const chatId = q.message.chat.id;
    if (q.data.startsWith('login_')) {
        const id = q.data.split('_')[1];
        bot.sendMessage(chatId, `⏳ Menyiapkan Engine ${id}...`);
        initWA(chatId, id);
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 Pilih Engine untuk Login:", {
        reply_markup: { 
            inline_keyboard: [[{ text: "🌪 Engine 1", callback_data: 'login_1' }, { text: "🌊 Engine 2", callback_data: 'login_2' }]]
        }
    });
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🌪️ **NINJA STORM ENGINE READY**\nKlik menu di bawah atau ketik /login", menuBawah);
});
