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
    rekapanTotalHarian: 0, 
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
    // Tutup koneksi lama jika ada sebelum membuat baru (Pencegahan QR Muter)
    if (engines[id].sock) {
        try {
            engines[id].sock.ev.removeAllListeners('connection.update');
            engines[id].sock.end();
            engines[id].sock = null;
        } catch (e) {}
    }

    engines[id].isInitializing = true;

    try {
        if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ninja Storm", "Chrome", "1.0.0"],
            printQRInTerminal: false,
            syncFullHistory: false, 
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 30000,
            keepAliveIntervalMs: 15000,
            generateHighQualityQR: true
        });

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;

            if (qr && chatId && engines[id].isInitializing) { 
                try {
                    // Ukuran diperkecil (scale 3) agar kamera HP cepat fokus
                    const buffer = await QRCode.toBuffer(qr, { scale: 3, margin: 2 });
                    
                    if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                    if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                    
                    const sent = await bot.sendPhoto(chatId, buffer, {
                        caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n\n🕒 Generate: ${getWIBTime()}\n💡 *Tips: Jika muter, klik Re-Generate.*`,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: `🔄 RE-GENERATE QR ${id}`, callback_data: `login_${id}` }], [{ text: "❌ CANCEL", callback_data: 'batal' }]] }
                    });
                    engines[id].lastQrMsgId = sent.message_id;
                } catch (e) {}
            }

            if (connection === 'close') {
                const sCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = sCode !== DisconnectReason.loggedOut && engines[id].isInitializing;
                
                if (!shouldReconnect) {
                    engines[id].isInitializing = false;
                    engines[id].sock = null;
                } else {
                    setTimeout(() => initWA(chatId, id), 3000);
                }
            }

            if (connection === 'open') {
                engines[id].isInitializing = false;
                engines[id].sock = sock; 
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI FILTER`, callback_data: `start_filter_${id}` }]] }
                });
            }
        });
    } catch (err) { engines[id].isInitializing = false; }
}

// --- BUTTON LOGIC ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === 'cek_bulanan') {
        const bln = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        bot.editMessageText(`📂 **REKAPAN BULANAN**\n━━━━━━━━━━━━\n📅 ${bln}\n📈 Terkirim: ${stats.rekapanTotalHarian}`, {
            chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "⬅️ KEMBALI", callback_data: "kembali_laporan" }]] }
        });
    }

    if (q.data === 'kembali_laporan') {
        const lap = `📊 **LAPORAN BLAST**\n━━━━━━━━━━━━\n🚀 Hari Ini: ${stats.totalHariIni}\n📈 Total: ${stats.rekapanTotalHarian}`;
        bot.editMessageText(lap, {
            chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "cek_bulanan" }]] }
        });
    }

    if (q.data === 'pilih_engine') {
        bot.editMessageText("📌 **PILIH ENGINE:**", { chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }], [{ text: "❌ BATAL", callback_data: "batal" }]] }
        });
    }

    if (q.data.startsWith('login_')) {
        const id = q.data.split('_')[1];
        await bot.editMessageText(`⏳ **Menghubungkan Engine ${id}...**`, { chat_id: chatId, message_id: msgId });
        initWA(chatId, id, msgId); 
    }

    if (q.data === 'batal') { await bot.deleteMessage(chatId, msgId).catch(() => {}); bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**", menuUtama); }
    bot.answerCallbackQuery(q.id);
});

// --- MENU PESAN ---
bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (text === "♻️ RESTART") {
        for (let i in engines) {
            engines[i].isInitializing = false;
            if (engines[i].sock) { try { engines[i].sock.end(); } catch(e){} engines[i].sock = null; }
        }
        bot.sendMessage(chatId, "♻️ **SYSTEM RESTART**", { 
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } 
        });
    }

    if (text === "📊 LAPORAN HARIAN") {
        const lap = `📊 **LAPORAN BLAST**\n━━━━━━━━━━━━\n🚀 Hari Ini: ${stats.totalHariIni}\n📈 Total: ${stats.rekapanTotalHarian}`;
        bot.sendMessage(chatId, lap, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "cek_bulanan" }]] }
        });
    }

    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS**\n";
        for (let i=1; i<=2; i++) st += `${engines[i].color} Engine ${i}: ${engines[i].sock ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        bot.sendMessage(chatId, st, menuUtama);
    }

    if (text === "🚪 LOGOUT WA") {
        for (let i in engines) { 
            if (engines[i].sock) engines[i].sock.logout();
            if (fs.existsSync(engines[i].session)) fs.rmSync(engines[i].session, { recursive: true, force: true }); 
        }
        bot.sendMessage(chatId, "✅ **LOGOUT BERHASIL**", menuUtama);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
