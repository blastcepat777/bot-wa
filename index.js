const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA & STATS ---
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
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

// --- FUNGSI TAMPILAN AWAL ---
const sendPesanOnline = (chatId) => {
    bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**\nSilahkan login kembali untuk memulai blast:", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]],
            ...menuBawah.reply_markup 
        }
    });
};

// --- CORE FUNCTIONS ---
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
                        ]
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

// Fungsi Reset Logika (Bagian yang diperbaiki sesuai permintaan Anda)
const handleRestartLogika = async (chatId) => {
    // 1. Kirim pesan indikator rebooting
    const rebootMsg = await bot.sendMessage(chatId, "♻️ **SYSTEM REBOOTING...**", menuBawah);
    
    // 2. Matikan semua koneksi engine
    for (let i in engines) { 
        if (engines[i].sock) { 
            engines[i].sock.end(); 
            engines[i].sock = null; 
        }
        engines[i].isInitializing = false; 
    }
    
    // 3. Jeda 2 detik, Hapus pesan "Rebooting", lalu Kirim pesan "Berhasil" + Tombol LOGIN
    setTimeout(async () => {
        await bot.deleteMessage(chatId, rebootMsg.message_id).catch(() => {});
        
        bot.sendMessage(chatId, "♻️ **SYSTEM BERHASIL RESTART**\nSilahkan klik tombol di bawah untuk login:", {
            parse_mode: 'Markdown',
            reply_markup: { 
                inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]],
                ...menuBawah.reply_markup 
            }
        });
    }, 2000);
};

// Handler Command & Text
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "♻️ RESTART" || text === "/restart") {
        await handleRestartLogika(chatId);
    }

    if (text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **LAPORAN BLAST**\nTotal Berhasil: 0`, menuBawah);
    }

    if (text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **STATUS ENGINE**\n";
        for (let i=1; i<=2; i++) status += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        bot.sendMessage(chatId, status, menuBawah);
    }
});

// Handler Callback Tombol
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

    if (q.data === 'batal') {
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        sendPesanOnline(chatId);
    }

    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => sendPesanOnline(msg.chat.id));
