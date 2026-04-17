const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

process.on('uncaughtException', (err) => console.log('Error: ', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection: ', reason));

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪', menuSent: false, isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊', menuSent: false, isInitializing: false }
};

// --- KEYBOARD MENU BAWAH (HANYA RESTART) ---
const menuBawah = {
    reply_markup: {
        keyboard: [
            [{ text: "♻️ RESTART" }]
        ],
        resize_keyboard: true, // Membuat tombol mengecil dan rapi
        one_time_keyboard: false
    }
};

const sendMenuUtama = (chatId) => {
    bot.sendMessage(chatId, `🌪️ **NINJA STORM ENGINE READY**\n\nSilahkan pilih menu:`, menuBawah);
};

const sendMenuEngine = (chatId, id) => {
    bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE**\n\nSilahkan Pilih Aksi:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
                [{ text: "❌ CANCEL", callback_data: 'batal' }]
            ]
        }
    });
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
        browser: ["Ninja Storm", "Chrome", "1.0.0"],
        syncFullHistory: false,
        printQRInTerminal: false,
        connectTimeoutMs: 60000
    });

    const sock = engines[id].sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 4 });
                const otherId = id == 1 ? 2 : 1;
                
                const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n🕒 Update: ${new Date().toLocaleTimeString('id-ID')}`;

                const markup = {
                    inline_keyboard: [
                        [{ text: `(ON)${engines[otherId].color} QR${otherId}`, callback_data: `login_${otherId}` }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                };

                const sent = await bot.sendPhoto(chatId, buffer, { caption, parse_mode: 'Markdown', reply_markup: markup });
                
                if (engines[id].lastQrMsgId) {
                    await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                }
                engines[id].lastQrMsgId = sent.message_id;
            } catch (e) { console.log("QR Error"); }
        }

        if (connection === 'open') {
            engines[id].isInitializing = false;
            if (engines[id].lastQrMsgId) {
                await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                engines[id].lastQrMsgId = null;
            }
            if (!engines[id].menuSent) {
                sendMenuEngine(chatId, id);
                engines[id].menuSent = true;
            }
        }
        
        if (connection === 'close') {
            engines[id].isInitializing = false;
            engines[id].menuSent = false;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) initWA(chatId, id);
        }
    });
}

// --- HANDLER PESAN TEKS ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (msg.text === "♻️ RESTART") {
        // Pesan konfirmasi setelah restart sesuai permintaan
        await bot.sendMessage(chatId, "♻️ **BERHASIL RESTART...**", {
            reply_markup: {
                inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]]
            }
        });
        
        // Proses reboot sistem
        setTimeout(() => process.exit(), 1000);
    }
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    const data = q.data;

    if (data === 'cmd_login') {
        return bot.editMessageText("🚀 Pilih Engine:", {
            chat_id: chatId, message_id: msgId,
            reply_markup: {
                inline_keyboard: [[{ text: "🌪 QR1", callback_data: 'login_1' }, { text: "🌊 QR2", callback_data: 'login_2' }]]
            }
        });
    }

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
