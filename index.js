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

// --- TOMBOL MENU UTAMA (Agar muncul terus di bawah) ---
const menuBawah = {
    reply_markup: {
        keyboard: [
            [{ text: "📊 LAPORAN HARIAN" }, { text: "♻️ RESTART" }, { text: "🛡️ CEK STATUS WA" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

async function initWA(chatId, id) {
    if (fs.existsSync(engines[id].session)) {
        try { fs.rmSync(engines[id].session, { recursive: true, force: true }); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    if (engines[id].sock) { engines[id].sock.terminate(); }

    engines[id].sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        browser: ["Ninja Storm", "MacOS", "3.0.0"],
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        connectTimeoutMs: 60000,
        receivedPendingNotifications: false,
    });

    engines[id].sock.ev.on('creds.update', saveCreds);

    engines[id].sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 6, margin: 3, errorCorrectionLevel: 'M' });
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            
            const sent = await bot.sendPhoto(chatId, buffer, { 
                caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\nSegera scan Bos agar tidak muter.`,
                parse_mode: 'Markdown'
            });
            engines[id].lastQrMsgId = sent.message_id;
        }

        if (connection === 'open') {
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            // Pastikan menuBawah dikirim di sini
            bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE!**\nSistem siap digunakan Bos.`, menuBawah);
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                setTimeout(() => initWA(chatId, id), 7000);
            }
        }
    });
}

// --- LOGIKA PESAN (RESTART, LAPORAN, CEK STATUS) ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **LAPORAN BLAST**\n\n- Hari Ini: ${stats.hariIni}\n- Total: ${stats.totalBlast}`, menuBawah);
    }

    if (text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ **PROSES RESTART...**\nBot akan mati sejenak, tunggu 5 detik lalu /login kembali.", menuBawah);
        setTimeout(() => process.exit(0), 2000);
    }

    if (text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **STATUS ENGINE**\n\n";
        for (let i = 1; i <= 2; i++) {
            status += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        }
        bot.sendMessage(chatId, status, menuBawah);
    }
});

// --- CALLBACK & LOGIN ---
bot.on('callback_query', (q) => {
    const chatId = q.message.chat.id;
    if (q.data.startsWith('login_')) {
        initWA(chatId, q.data.split('_')[1]);
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "🌪️ **NINJA STORM LOGIN**\nPilih engine:", {
        reply_markup: { 
            inline_keyboard: [[{ text: "Engine 1", callback_data: 'login_1' }, { text: "Engine 2", callback_data: 'login_2' }]]
        }
    });
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🌪️ **NINJA STORM READY**\nTombol menu sudah aktif di bawah.", menuBawah);
});
