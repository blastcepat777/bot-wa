const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi agar bot tidak crash
process.on('uncaughtException', (err) => console.log('Error: ', err));
process.on('unhandledRejection', (reason) => console.log('Rejection: ', reason));

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪', isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊', isInitializing: false }
};

// --- MENU KEYBOARD 3 BARIS (PERBAIKI) ---
const menuBawah = {
    reply_markup: {
        keyboard: [
            [{ text: "📊 LAPORAN HARIAN" }],   // Baris 1
            [{ text: "♻️ RESTART" }],          // Baris 2 (Tengah)
            [{ text: "🛡️ CEK STATUS WA" }]      // Baris 3
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

const safeDelete = async (chatId, msgId) => {
    if (msgId) {
        try { await bot.deleteMessage(chatId, msgId); } catch (e) {}
    }
};

async function initWA(chatId, id) {
    if (engines[id].isInitializing) return;
    engines[id].isInitializing = true;

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ninja Storm", "Chrome", "1.0.0"]
    });

    const sock = engines[id].sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 4 });
                const otherId = id == 1 ? 2 : 1;
                const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**`;
                
                const markup = {
                    inline_keyboard: [
                        [{ text: `(ON)${engines[otherId].color} QR${otherId}`, callback_data: `login_${otherId}` }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                };

                await safeDelete(chatId, engines[id].lastQrMsgId);
                const sent = await bot.sendPhoto(chatId, buffer, { caption, parse_mode: 'Markdown', reply_markup: markup });
                engines[id].lastQrMsgId = sent.message_id;
            } catch (e) {}
        }

        if (connection === 'open') {
            engines[id].isInitializing = false;
            await safeDelete(chatId, engines[id].lastQrMsgId);
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE**`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                }
            });
        }
        
        if (connection === 'close') {
            engines[id].isInitializing = false;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) initWA(chatId, id);
        }
    });
}

// --- HANDLER PESAN KEYBOARD ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (msg.text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ **BERHASIL RESTART...**", {
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]] }
        });
        setTimeout(() => process.exit(0), 1000);
    }

    if (msg.text === "📊 LAPORAN HARIAN") {
        // Logika sederhana untuk laporan
        let laporan = "📊 **LAPORAN REKAPAN BLAST**\n\n";
        laporan += "🌪 Engine 1: Tersedia\n";
        laporan += "🌊 Engine 2: Tersedia\n\n";
        laporan += "_Rekapan total akan muncul saat proses selesai atau WA terputus._";
        bot.sendMessage(chatId, laporan, menuBawah);
    }

    if (msg.text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **PENGECEKAN STATUS WA**\n\n";
        for (let i = 1; i <= 2; i++) {
            const isLive = engines[i].sock?.user ? "✅ AMAN / ONLINE" : "❌ OFFLINE / TERBATASI";
            status += `${engines[i].color} Engine ${i}: ${isLive}\n`;
        }
        bot.sendMessage(chatId, status, menuBawah);
    }
});

bot.on('callback_query', async (q) => {
