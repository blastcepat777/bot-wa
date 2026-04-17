const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi agar bot tidak mati total saat error
process.on('uncaughtException', (err) => console.log('Error: ', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection: ', reason));

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊' }
};

// Fungsi Menu Utama
const sendMenuUtama = (chatId) => {
    bot.sendMessage(chatId, `🌪️ **NINJA STORM ENGINE**\n\n/login - Ambil Barcode\n/restart - Reset All`);
};

async function initWA(chatId, id, messageId = null) {
    if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    // Settingan super ringan untuk Railway RAM 512MB
    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Chrome", "MacOS", "20.0.04"],
        syncFullHistory: false, // WAJIB false agar tidak crash load chat
        printQRInTerminal: false,
        shouldIgnoreJid: (jid) => jid.includes('@g.us'),
    });

    const sock = engines[id].sock;

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr) {
            try {
                // Skala 4 agar beban pemrosesan gambar kecil
                const buffer = await QRCode.toBuffer(qr, { scale: 4 }); 
                const otherId = id === 1 ? 2 : 1;
                const otherEmoji = engines[otherId].color;
                
                const caption = `${engines[id].color} **SCAN QR SEKARANG !! ${id}**\n\n🕒 Update: ${new Date().toLocaleTimeString('id-ID')}`;
                const markup = {
                    inline_keyboard: [
                        [{ text: `(ON)${otherEmoji} QR${otherId}`, callback_data: `login_${otherId}` }],
                        [{ text: "❌ CANCEL / KEMBALI", callback_data: 'batal' }]
                    ]
                };

                // Jika sedang loading (text), hapus lalu kirim foto
                if (messageId) {
                    await bot.deleteMessage(chatId, messageId).catch(() => {});
                    const sent = await bot.sendPhoto(chatId, buffer, { caption, parse_mode: 'Markdown', reply_markup: markup });
                    engines[id].lastQrMsgId = sent.message_id;
                    messageId = null; // Reset agar tidak loop hapus
                } else if (engines[id].lastQrMsgId) {
                    // Update QR di pesan foto yang sama
                    await bot.editMessageMedia({
                        type: 'photo',
                        media: buffer,
                        caption: caption,
                        parse_mode: 'Markdown'
                    }, {
                        chat_id: chatId,
                        message_id: engines[id].lastQrMsgId,
                        reply_markup: markup
                    }).catch(() => {});
                }
            } catch (e) { console.log("QR Error"); }
        }

        if (connection === 'open') {
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE**`);
            engines[id].lastQrMsgId = null;
        }
        
        if (connection === 'close') {
            const reconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (reconnect) initWA(chatId, id);
        }
    });
}

bot.onText(/\/start/, (msg) => sendMenuUtama(msg.chat.id));

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 Silahkan Pilih Barcode :", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "(ON)🌪 QR1", callback_data: 'login_1' }],
                [{ text: "(ON)🌊 QR2", callback_data: 'login_2' }],
                [{ text: "❌ CANCEL", callback_data: 'batal' }]
            ]
        }
    });
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === 'batal') {
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        sendMenuUtama(chatId);
        return bot.answerCallbackQuery(q.id);
    }

    const id = q.data === 'login_1' ? 1 : 2;
    
    // Edit pesan jadi loading sebelum pindah ke mode foto
    await bot.editMessageText(`⏳ **Menyiapkan QR Engine ${id}...**`, {
        chat_id: chatId,
        message_id: msgId
    }).catch(() => {});

    initWA(chatId, id, msgId);
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/restart/, (msg) => {
    bot.sendMessage(msg.chat.id, "♻️ **SYSTEM RESTART...**");
    setTimeout(() => { process.exit(); }, 1000);
});
