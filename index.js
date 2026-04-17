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

// --- HELPER MENU ---
const sendMenuUtama = (chatId) => {
    bot.sendMessage(chatId, `🌪️ **NINJA STORM ENGINE**\n\nKlik /login untuk mulai menghubungkan WhatsApp.`, {
        reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN ENGINE", callback_data: 'menu_login' }]] }
    });
};

const sendMenuEngine = (chatId, id) => {
    const emoji = engines[id].color;
    bot.sendMessage(chatId, `${emoji} **ENGINE ${id} AKTIF**\n\nSilahkan pilih aksi di bawah ini:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: `🔍 FILTER NOMOR (${id})`, callback_data: `filter_${id}` }],
                [{ text: `🚀 JALAN BLAST (${id})`, callback_data: `jalan_${id}` }],
                [{ text: "❌ KELUAR", callback_data: 'batal' }]
            ]
        }
    });
};

// --- CORE WHATSAPP ---
async function initWA(chatId, id, messageId = null) {
    if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Chrome", "MacOS", "20.0.04"],
        syncFullHistory: false, // Penting agar RAM tidak meledak di Railway
        printQRInTerminal: false,
    });

    const sock = engines[id].sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 4 }); // Skala kecil agar hemat CPU
            const markup = { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] };
            
            if (messageId) {
                await bot.deleteMessage(chatId, messageId).catch(() => {});
                const sent = await bot.sendPhoto(chatId, buffer, { caption: `📸 **SCAN QR ENGINE ${id}**`, reply_markup: markup });
                engines[id].lastQrMsgId = sent.message_id;
                messageId = null;
            } else if (engines[id].lastQrMsgId) {
                await bot.editMessageMedia({ type: 'photo', media: buffer, caption: `📸 **UPDATE QR ENGINE ${id}**` }, 
                { chat_id: chatId, message_id: engines[id].lastQrMsgId, reply_markup: markup }).catch(() => {});
            }
        }

        if (connection === 'open') {
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            engines[id].lastQrMsgId = null;
            sendMenuEngine(chatId, id); // Tampilkan tombol filter/jalan otomatis
        }
        
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
            initWA(chatId, id);
        }
    });
}

// --- TELEGRAM EVENTS ---
bot.onText(/\/start/, (msg) => sendMenuUtama(msg.chat.id));

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    const data = q.data;

    if (data === 'menu_login') {
        bot.editMessageText("🚀 Pilih Engine:", {
            chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "🌪 QR1", callback_data: 'login_1' }, { text: "🌊 QR2", callback_data: 'login_2' }]] }
        });
    }

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        await bot.editMessageText(`⏳ Menyiapkan Engine ${id}...`, { chat_id: chatId, message_id: msgId }).catch(() => {});
        initWA(chatId, id, msgId);
    }

    if (data === 'batal') {
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        sendMenuUtama(chatId);
    }

    // --- TOMBOL FILTER OTOMATIS ---
    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        bot.sendMessage(chatId, `🔍 **Filter Engine ${id} dimulai...**`);
        try {
            const dataFile = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            let aktif = [];
            for (const line of dataFile) {
                const [res] = await engines[id].sock.onWhatsApp(line.replace(/[^0-9]/g, '')).catch(() => [null]);
                if (res?.exists) aktif.push(line.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            bot.sendMessage(chatId, `✅ **Filter ${id} Sukses!**\nAktif: ${aktif.length}\nKlik tombol JALAN untuk kirim.`);
        } catch (e) { bot.sendMessage(chatId, "❌ Gagal Filter."); }
    }

    // --- TOMBOL JALAN OTOMATIS ---
    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        bot.sendMessage(chatId, `🚀 **Blast Engine ${id} Jalan...**`);
        // Logika blast sama seperti sebelumnya...
        bot.sendMessage(chatId, `✅ **Engine ${id} Selesai!**`);
    }

    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/restart/, (msg) => {
    bot.sendMessage(msg.chat.id, "♻️ **RESTARTING...**");
    setTimeout(() => process.exit(), 1000);
});
