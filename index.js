const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA & STATS ---
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false }
};

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
        // Pastikan folder sesi bersih jika memulai baru
        if (!fs.existsSync(engines[id].session)) {
            fs.mkdirSync(engines[id].session, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();

        engines[id].sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ninja Storm", "Chrome", "1.0.0"],
            printQRInTerminal: false,
            syncFullHistory: false, // Mempercepat koneksi & scan
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000
        });

        const sock = engines[id].sock;
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;

            if (qr && chatId) {
                try {
                    const buffer = await QRCode.toBuffer(qr, { scale: 5 });
                    const opts = {
                        caption: `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n🕒 Generate: ${getWIBTime()}\n\n*Tips: Jika muter terus, hapus tautan perangkat di WA HP lalu scan ulang.*`,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: `🔄 RE-GENERATE QR ${id}`, callback_data: `login_${id}` }],
                                [{ text: "❌ CANCEL", callback_data: 'batal' }]
                            ]
                        }
                    };

                    if (msgIdToEdit) {
                        await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {});
                        msgIdToEdit = null;
                    }

                    if (engines[id].lastQrMsgId) {
                        await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                    }

                    const sent = await bot.sendPhoto(chatId, buffer, opts);
                    engines[id].lastQrMsgId = sent.message_id;
                } catch (e) { console.log("QR Buffer Error"); }
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                engines[id].isInitializing = false;
                if (reason !== DisconnectReason.loggedOut) {
                    setTimeout(() => initWA(chatId, id), 3000);
                }
            }

            if (connection === 'open') {
                engines[id].isInitializing = false;
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} BERHASIL TERHUBUNG!**`, menuUtama);
            }
        });
    } catch (err) {
        engines[id].isInitializing = false;
        console.error(err);
    }
}

// --- HANDLERS ---

const handleLogout = async (chatId) => {
    const msg = await bot.sendMessage(chatId, "🚪 **MEMBERSIHKAN SEMUA SESI...**", menuUtama);
    
    for (let i in engines) {
        if (engines[i].sock) {
            try {
                await engines[i].sock.logout();
                engines[i].sock.end();
            } catch (e) {}
            engines[i].sock = null;
        }
        
        // Paksa hapus folder secara rekursif
        if (fs.existsSync(engines[i].session)) {
            try {
                fs.rmSync(engines[i].session, { recursive: true, force: true });
            } catch (e) { console.log("Gagal hapus folder sesi"); }
        }
        engines[i].isInitializing = false;
    }

    bot.editMessageText("✅ **LOGOUT TOTAL BERHASIL**\nSilahkan klik login untuk scan ulang.", {
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

    if (text === "♻️ RESTART") await handleRestartLogika(chatId);
    if (text === "🚪 LOGOUT WA") await handleLogout(chatId);
    if (text === "📊 LAPORAN HARIAN") {
        const laporan = `📊 **LAPORAN BLAST NINJA**\n━━━━━━━━━━━━━━━━━━━\n🕒 **Terakhir Blast:**\n${stats.terakhirBlast}\n\n🚀 **Total Blast Hari Ini:** ${stats.totalHariIni}\n📈 **Rekapan Total Harian:** ${stats.rekapanHarian}\n━━━━━━━━━━━━━━━━━━━`;
        bot.sendMessage(chatId, laporan, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "view_bulanan" }]] }
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

    if (q.data === 'view_bulanan') {
        bot.editMessageText(`📅 **REKAPAN TOTAL BULANAN**\n━━━━━━━━━━━━\nTotal: ${stats.rekapanBulanan}\n━━━━━━━━━━━━`, {
            chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "⬅️ KEMBALI", callback_data: "back_to_laporan" }]] }
        });
    }

    if (q.data === 'back_to_laporan') {
        const laporan = `📊 **LAPORAN BLAST NINJA**\n━━━━━━━━━━━━━━━━━━━\n🕒 **Terakhir Blast:**\n${stats.terakhirBlast}\n\n🚀 **Total Blast Hari Ini:** ${stats.totalHariIni}\n📈 **Rekapan Total Harian:** ${stats.rekapanHarian}\n━━━━━━━━━━━━━━━━━━━`;
        bot.editMessageText(laporan, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "view_bulanan" }]] }
        });
    }

    if (q.data === 'batal') {
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**", menuUtama);
    }

    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
