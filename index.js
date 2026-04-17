const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi Anti-Crash
process.on('uncaughtException', (err) => console.log('Sistem Aman:', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection Aman:', reason));

let stats = { totalBlast: 0, hariIni: 0, terahirUpdate: new Date().toLocaleDateString() };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

// --- KEYBOARD SEJAJAR (FIX) ---
const menuBawah = {
    reply_markup: {
        keyboard: [[{ text: "📊 LAPORAN HARIAN" }, { text: "♻️ RESTART" }, { text: "🛡️ CEK STATUS WA" }]],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

const safeDelete = async (chatId, msgId) => {
    if (msgId) { try { await bot.deleteMessage(chatId, msgId); } catch (e) {} }
};

async function initWA(chatId, id) {
    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ninja Storm", "Chrome", "1.0.0"]
    });

    engines[id].sock.ev.on('creds.update', saveCreds);
    engines[id].sock.ev.on('connection.update', async (u) => {
        const { connection, qr } = u;
        
        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 4 });
            const otherId = id == 1 ? 2 : 1; // Mendeteksi ID engine satunya
            
            // FIX: Tambahkan tombol QR engine satunya agar tidak hilang
            const markup = {
                inline_keyboard: [
                    [{ text: `(ON)${engines[otherId].color} QR${otherId}`, callback_data: `login_${otherId}` }],
                    [{ text: "❌ CANCEL", callback_data: 'batal' }]
                ]
            };

            await safeDelete(chatId, engines[id].lastQrMsgId);
            const sent = await bot.sendPhoto(chatId, buffer, { 
                caption: `${engines[id].color} **SCAN QR ENGINE ${id}**`, 
                reply_markup: markup,
                parse_mode: 'Markdown'
            });
            engines[id].lastQrMsgId = sent.message_id;
        }

        if (connection === 'open') {
            await safeDelete(chatId, engines[id].lastQrMsgId);
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE** ✅`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `🔍 FILTER ${id}`, callback_data: `filter_${id}` }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                }
            });
        }
    });
}

// Handler pesan & callback tetap sama
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ **BERHASIL RESTART...**", {
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]] }
        });
        setTimeout(() => process.exit(0), 1000);
    }
    if (msg.text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **REKAPAN BLAST**\n\nHari Ini: ${stats.hariIni}\nTotal: ${stats.totalBlast}`, menuBawah);
    }
    if (msg.text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **CEK KEAMANAN WA**\n\n";
        for (let i = 1; i <= 2; i++) {
            status += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ AMAN" : "❌ LIMIT/OFF"}\n`;
        }
        bot.sendMessage(chatId, status, menuBawah);
    }
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    if (q.data === 'cmd_login') {
        bot.editMessageText("🚀 Pilih Engine:", {
            chat_id: chatId, message_id: q.message.message_id,
            reply_markup: { inline_keyboard: [[{ text: "🌪 QR1", callback_data: 'login_1' }, { text: "🌊 QR2", callback_data: 'login_2' }]] }
        });
    }
    if (q.data.startsWith('login_')) {
        initWA(chatId, q.data.split('_')[1]);
    }
    if (q.data === 'batal') {
        await safeDelete(chatId, q.message.message_id);
        bot.sendMessage(chatId, "❌ Dibatalkan.", menuBawah);
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, `🌪️ **NINJA STORM ENGINE READY**`, menuBawah));
