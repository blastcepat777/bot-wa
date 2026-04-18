const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs'); // Tambahkan fs untuk hapus sesi

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA & STATS ---
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false }
};

// Variabel Laporan (Bisa dihubungkan ke Database nantinya)
let stats = {
    totalHariIni: 0,
    rekapanHarian: 0,
    rekapanBulanan: 0,
    terakhirBlast: "-"
};

const getWIBTime = () => {
    return new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";
};

const menuUtama = {
    reply_markup: {
        keyboard: [
            [{ text: "♻️ RESTART" }], 
            [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }] 
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

// --- CORE FUNCTIONS ---
async function initWA(chatId, id, msgIdToEdit) {
    if (engines[id].isInitializing) return;
    engines[id].isInitializing = true;

    try {
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
            const { connection, lastDisconnect, qr } = u;

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
                    if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                    if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                    const sent = await bot.sendPhoto(chatId, buffer, opts);
                    engines[id].lastQrMsgId = sent.message_id;
                } catch (e) { console.log("QR Error"); }
            }

            if (connection === 'open') {
                engines[id].isInitializing = false;
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE**\n\nSilahkan pilih aksi:`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }]],
                        ...menuUtama.reply_markup
                    }
                });
            }
        });
    } catch (err) { engines[id].isInitializing = false; }
}

// --- HANDLERS ---

const handleLogout = async (chatId) => {
    let text = "🚪 **PROSES LOGOUT...**\n";
    const msg = await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

    for (let i in engines) {
        if (engines[i].sock) {
            await engines[i].sock.logout().catch(() => {});
            engines[i].sock.end();
            engines[i].sock = null;
        }
        // Hapus folder sesi secara fisik agar login ulang bersih
        if (fs.existsSync(engines[i].session)) {
            fs.rmSync(engines[i].session, { recursive: true, force: true });
        }
        engines[i].isInitializing = false;
        text += `${engines[i].color} Engine ${i}: Berhasil Logout & Sesi Dihapus\n`;
    }

    bot.editMessageText(text + "\n✅ Semua engine telah logout. Silahkan login kembali.", {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: "🚀 LOGIN ULANG", callback_data: "pilih_engine" }]]
        }
    });
};

const handleRestartLogika = async (chatId) => {
    const rebootMsg = await bot.sendMessage(chatId, "♻️ **SYSTEM REBOOTING...**", menuUtama);
    for (let i in engines) { 
        if (engines[i].sock) { try { engines[i].sock.end(); } catch (e) {} engines[i].sock = null; }
        engines[i].isInitializing = false; 
    }
    setTimeout(async () => {
        await bot.deleteMessage(chatId, rebootMsg.message_id).catch(() => {});
        await bot.sendMessage(chatId, "♻️ **SYSTEM BERHASIL RESTART**", menuUtama);
        bot.sendMessage(chatId, "Silahkan klik tombol di bawah untuk login:", {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] }
        });
    }, 2000);
};

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "♻️ RESTART" || text === "/restart") await handleRestartLogika(chatId);
    if (text === "🚪 LOGOUT WA") await handleLogout(chatId);

    if (text === "📊 LAPORAN HARIAN") {
        const laporan = `📊 **LAPORAN BLAST NINJA**\n` +
                        `━━━━━━━━━━━━━━━━━━━\n` +
                        `🕒 **Terakhir Blast:**\n${stats.terakhirBlast}\n\n` +
                        `🚀 **Total Blast Hari Ini:** ${stats.totalHariIni}\n` +
                        `📈 **Rekapan Total Harian:** ${stats.rekapanHarian}\n` +
                        `━━━━━━━━━━━━━━━━━━━`;
        
        bot.sendMessage(chatId, laporan, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "view_bulanan" }]]
            }
        });
    }

    if (text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **STATUS ENGINE**\n";
        for (let i=1; i<=2; i++) status += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        bot.sendMessage(chatId, status, menuUtama);
    }
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === 'view_bulanan') {
        bot.editMessageText(`📅 **REKAPAN TOTAL BULANAN**\n━━━━━━━━━━━━\nTotal: ${stats.rekapanBulanan}\n━━━━━━━━━━━━`, {
            chat_id: chatId,
            message_id: msgId,
            reply_markup: {
                inline_keyboard: [[{ text: "⬅️ KEMBALI", callback_data: "back_to_laporan" }]]
            }
        });
    }

    if (q.data === 'back_to_laporan') {
        const laporan = `📊 **LAPORAN BLAST NINJA**\n` +
                        `━━━━━━━━━━━━━━━━━━━\n` +
                        `🕒 **Terakhir Blast:**\n${stats.terakhirBlast}\n\n` +
                        `🚀 **Total Blast Hari Ini:** ${stats.totalHariIni}\n` +
                        `📈 **Rekapan Total Harian:** ${stats.rekapanHarian}\n` +
                        `━━━━━━━━━━━━━━━━━━━`;
        bot.editMessageText(laporan, {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "view_bulanan" }]]
            }
        });
    }

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
        await bot.editMessageText(`⏳ **Menyiapkan QR Engine ${id}...**`, { chat_id: chatId, message_id: msgId });
        initWA(chatId, id, msgId); 
    }

    if (q.data === 'batal') {
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**", menuUtama);
    }

    bot.answerCallbackQuery(q.id);
});

process.on('uncaughtException', (err) => { console.error('Error:', err); });
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama);
});
