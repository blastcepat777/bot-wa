const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi Anti-Crash
process.on('uncaughtException', (err) => console.log('Sistem Aman:', err.message));

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

async function sendQR(chatId, id, qrString) {
    try {
        // Buat Barcode lebih kontras dan besar agar kamera HP gampang baca
        const buffer = await QRCode.toBuffer(qrString, { 
            scale: 10, 
            margin: 2, 
            errorCorrectionLevel: 'M' // Level medium biasanya paling seimbang untuk kamera
        });

        const caption = `${engines[id].color} **SCAN QR ENGINE ${id}**\n\n⌚ Update: ${new Date().toLocaleTimeString()}\n\n_Tips: Terangkan layar monitor/HP dan jauhkan sedikit kamera jika blur._`;

        if (engines[id].lastQrMsgId) {
            await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
        }
        
        const sent = await bot.sendPhoto(chatId, buffer, { caption, parse_mode: 'Markdown' });
        engines[id].lastQrMsgId = sent.message_id;
    } catch (e) { console.log("QR Error:", e.message); }
}

async function initWA(chatId, id) {
    // Hapus folder lama agar tidak terjadi 'Session Conflict' yang bikin muter terus
    if (fs.existsSync(engines[id].session)) {
        fs.rmSync(engines[id].session, { recursive: true, force: true });
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
        // PAKAI IDENTITAS MAC OS AGAR WHATSAPP LEBIH CEPAT PROSES
        browser: ["Mac OS", "Chrome", "121.0.6167.184"],
        syncFullHistory: false,
        qrTimeout: 40000, // Beri waktu QR lebih lama sebelum ganti
    });

    engines[id].sock.ev.on('creds.update', saveCreds);

    engines[id].sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) await sendQR(chatId, id, qr);

        if (connection === 'open') {
            if (engines[id].lastQrMsgId) {
                await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            }
            bot.sendMessage(chatId, `✅ **ENGINE ${id} BERHASIL TERHUBUNG!**\nSelamat bekerja, Bos!`, menuBawah);
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                setTimeout(() => initWA(chatId, id), 5000);
            }
        }
    });
}

bot.on('callback_query', (q) => {
    const id = q.data.split('_')[1];
    bot.sendMessage(q.message.chat.id, `⏳ Menghubungkan ke Engine ${id}...`);
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
        await bot.sendMessage(msg.chat.id, "♻️ Restarting System...");
        process.exit(0);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "🌪 **NINJA STORM READY**\nKetik /login untuk scan.", menuBawah));
