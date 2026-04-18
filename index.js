const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

let stats = { totalBlast: 0, lastBlastTime: "Belum ada aktivitas" };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false }
};

const getWIBTime = () => {
    return new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";
};

// --- KEYBOARD PERMANEN (WAJIB MUNCUL TERUS) ---
const menuBawah = {
    reply_markup: {
        keyboard: [
            [{ text: "♻️ RESTART" }], 
            [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }] 
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

// --- FUNGSI TAMPILKAN ONLINE ---
const sendPesanOnline = (chatId) => {
    bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**\nSilahkan login kembali untuk memulai blast:", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]],
            ...menuBawah.reply_markup 
        }
    });
};

async function initWA(chatId, id, msgIdToEdit) {
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
        const { connection, qr } = u;

        if (qr && chatId) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 4 });
                const opts = {
                    caption: `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n🕒 Generate: ${getWIBTime()}`,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: `🔄 KE QR ENGINE ${id == 1 ? 2 : 1}`, callback_data: `login_${id == 1 ? 2 : 1}` }],
                            [{ text: "❌ CANCEL", callback_data: 'batal' }]
                        ],
                        ...menuBawah.reply_markup
                    }
                };
                
                if (msgIdToEdit) {
                    await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {});
                    msgIdToEdit = null; 
                }
                
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                const sent = await bot.sendPhoto(chatId, buffer, opts);
                engines[id].lastQrMsgId = sent.message_id;
            } catch (e) { console.log("QR Error"); }
        }

        if (connection === 'open') {
            engines[id].isInitializing = false;
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE**\n\nSilahkan pilih aksi:`, {
                reply_markup: {
                    inline_keyboard: [[{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }]],
                    ...menuBawah.reply_markup
                }
            });
        }
    });
}

// --- HANDLERS ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    
    if (msg.text === "♻️ RESTART") {
        // 1. Tampilkan REBOOTING
        const rebootMsg = await bot.sendMessage(chatId, "♻️ **SYSTEM REBOOTING...**", menuBawah);
        
        for (let i in engines) { if (engines[i].sock) engines[i].sock.end(); engines[i].isInitializing = false; }
        
        // 2. Ubah jadi ONLINE di kotak yang sama + pastikan Keyboard Bawah Muncul
        setTimeout(() => {
            bot.editMessageText("✅ **SYSTEM ONLINE!**\nSilahkan login kembali untuk memulai blast:", {
                chat_id: chatId,
                message_id: rebootMsg.message_id,
                parse_mode: 'Markdown',
                reply_markup: { 
                    inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]],
                    ...menuBawah.reply_markup // <--- KUNCI AGAR TOMBOL BAWAH GAK HILANG
                }
            });
        }, 2000);
    }

    if (msg.text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **LAPORAN BLAST**\nJam: ${getWIBTime()}\nTotal: ${stats.totalBlast}`, menuBawah);
    }
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === 'pilih_engine') {
        bot.editMessageText("📌 **PILIH ENGINE:**", {
            chat_id: chatId,
            message_id: msgId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }],
                    [{ text: "❌ BATAL", callback_data: "batal" }]
                ],
                ...menuBawah.reply_markup // <--- KONSISTEN ADA TERUS
            }
        });
    }

    if (q.data.startsWith('login_')) {
        const id = q.data.split('_')[1];
        await bot.editMessageText(`⏳ **Menyiapkan QR Engine ${id}...**`, {
            chat_id: chatId,
            message_id: msgId,
            reply_markup: menuBawah.reply_markup // <--- KONSISTEN ADA TERUS
        });
        initWA(chatId, id, msgId); 
    }

    if (q.data === 'batal') {
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        sendPesanOnline(chatId);
    }

    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => sendPesanOnline(msg.chat.id));
