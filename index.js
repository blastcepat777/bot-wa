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
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', color: '🌊' }
};

// --- MENU SETELAH LOGIN BERHASIL ---
const sendMenuEngine = (chatId, id) => {
    const emoji = engines[id].color;
    bot.sendMessage(chatId, `${emoji} **ENGINE ${id} ONLINE**\n\nSilahkan pilih menu di bawah ini:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
                [{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }],
                [{ text: "❌ KEMBALI KE MENU", callback_data: 'batal' }]
            ]
        }
    });
};

const sendMenuUtama = (chatId) => {
    bot.sendMessage(chatId, `🌪️ **NINJA STORM ENGINE**\n\n/login - Ambil Barcode\n/restart - Reset All`);
};

async function initWA(chatId, id, messageId = null) {
    if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Chrome", "MacOS", "20.0.04"],
        syncFullHistory: false, // WAJIB false biar gak crash di Railway
        printQRInTerminal: false,
        shouldIgnoreJid: (jid) => jid.includes('@g.us'),
    });

    const sock = engines[id].sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 4 }); 
                const otherId = id === 1 ? 2 : 1;
                const markup = {
                    inline_keyboard: [
                        [{ text: `(ON)${engines[otherId].color} QR${otherId}`, callback_data: `login_${otherId}` }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                };

                if (messageId) {
                    await bot.deleteMessage(chatId, messageId).catch(() => {});
                    const sent = await bot.sendPhoto(chatId, buffer, { caption: `📸 **SCAN QR ENGINE ${id}**`, parse_mode: 'Markdown', reply_markup: markup });
                    engines[id].lastQrMsgId = sent.message_id;
                    messageId = null;
                } else if (engines[id].lastQrMsgId) {
                    await bot.editMessageMedia({ type: 'photo', media: buffer, caption: `📸 **SCAN QR ENGINE ${id}**` }, 
                    { chat_id: chatId, message_id: engines[id].lastQrMsgId, reply_markup: markup }).catch(() => {});
                }
            } catch (e) { console.log("QR Error"); }
        }

        if (connection === 'open') {
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            engines[id].lastQrMsgId = null;
            sendMenuEngine(chatId, id); // OTOMATIS KIRIM TOMBOL FILTER/JALAN
        }
        
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
            initWA(chatId, id);
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
    const data = q.data;

    if (data === 'batal') {
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        sendMenuUtama(chatId);
        return bot.answerCallbackQuery(q.id);
    }

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        await bot.editMessageText(`⏳ **Menyiapkan QR Engine ${id}...**`, { chat_id: chatId, message_id: msgId }).catch(() => {});
        initWA(chatId, id, msgId);
    }

    // --- LOGIKA TOMBOL FILTER ---
    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Engine ${id} Offline!`);
        
        bot.sendMessage(chatId, `🔍 **Filter Engine ${id} sedang berjalan...**`);
        try {
            const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            let aktif = [];
            for (const line of lines) {
                const num = line.trim().replace(/[^0-9]/g, '');
                const [res] = await engines[id].sock.onWhatsApp(num).catch(() => [null]);
                if (res?.exists) aktif.push(line.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            bot.sendMessage(chatId, `✅ **FILTER ${id} SELESAI**\nAktif: ${aktif.length}\nKlik tombol **JALAN** untuk mengirim.`);
        } catch (e) { bot.sendMessage(chatId, "❌ Error: File nomor tidak ditemukan."); }
    }

    // --- LOGIKA TOMBOL JALAN ---
    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Engine ${id} Offline!`);
        
        bot.sendMessage(chatId, `🚀 **Blast Engine ${id} dimulai...**`);
        // Logika blast (script1 & script2) bisa ditaruh di sini
        bot.sendMessage(chatId, `✅ **Blast Engine ${id} Selesai!**`);
    }

    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/restart/, (msg) => {
    bot.sendMessage(msg.chat.id, "♻️ **SYSTEM RESTART...**");
    setTimeout(() => { process.exit(); }, 1000);
});
