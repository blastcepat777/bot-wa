const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Anti-Crash agar bot tidak mati kalau ada error
process.on('uncaughtException', (err) => console.log('Sistem Aman:', err.message));

let stats = { totalBlast: 0 };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

// --- KEYBOARD MENU (Tetap Ada Seperti Mau Bos) ---
const menuBawah = {
    reply_markup: {
        keyboard: [
            [{ text: "📊 LAPORAN HARIAN" }],
            [{ text: "♻️ RESTART" }, { text: "🛡️ CEK STATUS WA" }]
        ],
        resize_keyboard: true
    }
};

async function initWA(chatId, id) {
    // Hapus sesi lama biar fresh & Barcode Gampang di-scan
    if (chatId && fs.existsSync(engines[id].session)) {
        try { fs.rmSync(engines[id].session, { recursive: true, force: true }); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    
    // Konfigurasi Socket yang paling stabil untuk Scan
    engines[id].sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"], // Standar yang paling cepat sinkron
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
    });

    engines[id].sock.ev.on('creds.update', saveCreds);

    engines[id].sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr && chatId) {
            const buffer = await QRCode.toBuffer(qr, { scale: 8, margin: 2 });
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            
            const sent = await bot.sendPhoto(chatId, buffer, { 
                caption: `${engines[id].color} **SCAN ENGINE ${id} SEKARANG**\nUpdate: ${new Date().toLocaleTimeString()}`,
                parse_mode: 'Markdown'
            });
            engines[id].lastQrMsgId = sent.message_id;
        }

        if (connection === 'open') {
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE!**`, menuBawah);
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) initWA(chatId, id);
        }
    });
}

// --- HANDLER TOMBOL KEYBOARD ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "📊 LAPORAN HARIAN") bot.sendMessage(chatId, `📊 Total Blast: ${stats.totalBlast}`, menuBawah);
    
    if (text === "🛡️ CEK STATUS WA") {
        let s = "🛡️ **STATUS:**\n";
        for (let i=1; i<=2; i++) s += `${engines[i].color} E${i}: ${engines[i].sock?.user ? "✅" : "❌"}\n`;
        bot.sendMessage(chatId, s, menuBawah);
    }

    if (text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ Restarting...");
        process.exit(0);
    }
});

// --- HANDLER CALLBACK (LOGIN) ---
bot.on('callback_query', (q) => {
    const id = q.data.split('_')[1];
    if (q.data.startsWith('login_')) {
        bot.sendMessage(q.message.chat.id, `⏳ Meminta Barcode Engine ${id}...`);
        initWA(q.message.chat.id, id);
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "🌪️ **READY BOS**", menuBawah));
bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 Pilih Engine:", {
        reply_markup: { inline_keyboard: [[{ text: "🌪 Engine 1", callback_data: 'login_1' }, { text: "🌊 Engine 2", callback_data: 'login_2' }]] }
    });
});
