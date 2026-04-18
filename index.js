const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA & STATS ---
let stats = { totalBlast: 0, lastBlastTime: "Belum ada aktivitas" };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false }
};

const getWIBTime = () => {
    return new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";
};

// --- KEYBOARD PERMANEN ---
const menuBawah = {
    reply_markup: {
        keyboard: [
            [{ text: "♻️ RESTART" }], 
            [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }] 
        ],
        resize_keyboard: true
    }
};

// --- FUNGSI UTAMA AGAR TETAP DI TEMPAT YANG SAMA ---
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
                    caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n🕒 Jam: ${getWIBTime()}`,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: "❌ CANCEL", callback_data: 'batal' }]],
                        ...menuBawah.reply_markup
                    }
                };

                // Jika sedang transisi dari teks ke foto, hapus teks persiapan dulu
                if (msgIdToEdit) {
                    await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {});
                    msgIdToEdit = null;
                }

                // Update QR: Hapus foto lama, kirim yang baru (agar tetap satu foto aktif)
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                const sent = await bot.sendPhoto(chatId, buffer, opts);
                engines[id].lastQrMsgId = sent.message_id;
            } catch (e) { console.log("QR Error"); }
        }

        if (connection === 'open') {
            engines[id].isInitializing = false;
            const statusText = `${engines[id].color} **ENGINE ${id} ONLINE**\nSilahkan lanjut filter:`;
            
            if (engines[id].lastQrMsgId) {
                // Edit caption foto QR menjadi status Online (Sesuai kotak Bos)
                bot.editMessageCaption(statusText, {
                    chat_id: chatId,
                    message_id: engines[id].lastQrMsgId,
                    reply_markup: {
                        inline_keyboard: [[{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }]]
                    }
                });
            }
        }
    });
}

// --- HANDLERS DENGAN EDIT MESSAGE ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    
    if (msg.text === "♻️ RESTART") {
        // Tampilkan Rebooting di gelembung baru sebagai anchor utama
        const rebootMsg = await bot.sendMessage(chatId, "♻️ **SYSTEM REBOOTING...**", menuBawah);
        
        for (let i in engines) { if (engines[i].sock) engines[i].sock.end(); engines[i].isInitializing = false; }
        
        // Edit pesan yang sama menjadi SYSTEM ONLINE
        setTimeout(() => {
            bot.editMessageText("✅ **SYSTEM ONLINE!**\nSilahkan login kembali:", {
                chat_id: chatId,
                message_id: rebootMsg.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] }
            });
        }, 2000);
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
                ]
            }
        });
    }

    if (q.data.startsWith('login_')) {
        const id = q.data.split('_')[1];
        await bot.editMessageText(`⏳ **Menyiapkan QR Engine ${id}...**`, {
            chat_id: chatId,
            message_id: msgId
        });
        initWA(chatId, id, msgId); 
    }

    if (q.data.startsWith('filter_')) {
        const id = q.data.split('_')[1];
        // Jika statusnya caption di foto, edit captionnya
        const opts = {
            chat_id: chatId,
            message_id: msgId,
            reply_markup: {
                inline_keyboard: [[{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }]]
            }
        };
        q.message.photo ? bot.editMessageCaption(`${engines[id].color} **FILTER ${id} SELESAI**\nAktif: 28`, opts) 
                         : bot.editMessageText(`${engines[id].color} **FILTER ${id} SELESAI**\nAktif: 28`, opts);
    }

    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", {
        reply_markup: {
            inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]],
            ...menuBawah.reply_markup
        }
    });
});
