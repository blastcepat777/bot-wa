const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

process.on('uncaughtException', (err) => console.log('Error: ', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection: ', reason));

let stats = { totalBlast: 0, lastBlastTime: "Belum ada aktivitas" };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', color: '🌪', menuSent: false, isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', color: '🌊', menuSent: false, isInitializing: false }
};

const getWIBTime = () => {
    return new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";
};

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

// --- FUNGSI LOGIN (POIN 1: DIPANGGIL SETELAH SYSTEM ONLINE) ---
const sendPilihanLogin = (chatId) => {
    bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**\nSilahkan login kembali untuk memulai blast:", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 LOGIN ENGINE 1", callback_data: "login_1" }, { text: "🚀 LOGIN ENGINE 2", callback_data: "login_2" }]
            ]
        }
    });
};

async function initWA(chatId, id) {
    if (engines[id].isInitializing) return;
    engines[id].isInitializing = true;

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ninja Storm", "Chrome", "1.0.0"],
        syncFullHistory: false, 
        printQRInTerminal: false,
        connectTimeoutMs: 60000 
    });

    const sock = engines[id].sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        // --- POIN 2: QR DENGAN TOMBOL PINDAH ENGINE & CANCEL ---
        if (qr && chatId) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 4 }); 
                const otherId = id == 1 ? 2 : 1;
                const markup = {
                    inline_keyboard: [
                        [
                            { text: `🔄 KE QR ENGINE ${otherId}`, callback_data: `login_${otherId}` },
                            { text: "❌ CANCEL", callback_data: 'batal' }
                        ]
                    ]
                };
                const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n🕒 Generate: ${getWIBTime()}`;
                const sent = await bot.sendPhoto(chatId, buffer, { caption, parse_mode: 'Markdown', reply_markup: markup });
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                engines[id].lastQrMsgId = sent.message_id;
            } catch (e) { console.log("QR Error"); }
        }

        if (connection === 'open') {
            engines[id].isInitializing = false;
            if (engines[id].lastQrMsgId && chatId) {
                await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                engines[id].lastQrMsgId = null;
            }
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} CONNECTED!**`, menuBawah);
        }
        
        if (connection === 'close') {
            engines[id].isInitializing = false;
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) initWA(chatId, id);
        }
    });
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ **SYSTEM REBOOTING...**", menuBawah);
        for (let id in engines) {
            if (engines[id].sock) { engines[id].sock.end(); engines[id].sock = null; }
            engines[id].isInitializing = false;
        }
        // Jeda 2 detik lalu munculkan tombol login
        setTimeout(() => { sendPilihanLogin(chatId); }, 2000);
    }

    if (text === "📊 LAPORAN HARIAN") {
        const rep = `📊 **LAPORAN BLAST NINJA**\n` +
                  `--------------------------\n` +
                  `🕒 Jam Cek: ${getWIBTime()}\n` +
                  `🚀 Total Blast: ${stats.totalBlast}\n` +
                  `📅 Terakhir: ${stats.lastBlastTime}\n` +
                  `--------------------------`;
        bot.sendMessage(chatId, rep, menuBawah);
    }

    if (text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **STATUS ENGINE**\n";
        for (let i = 1; i <= 2; i++) {
            status += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        }
        bot.sendMessage(chatId, status, menuBawah);
    }
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    const data = q.data;

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        if (engines[id].isInitializing) return bot.answerCallbackQuery(q.id, { text: "Sabar..." });
        bot.sendMessage(chatId, `⏳ **Meminta QR Engine ${id}...**`);
        initWA(chatId, id);
    }

    if (data === 'batal') {
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        bot.sendMessage(chatId, "❌ **Koneksi Dibatalkan.**", menuBawah);
    }

    // ... (Filter & Jalan Blast tetap seperti sebelumnya tapi dengan update stats.lastBlastTime)
    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        stats.lastBlastTime = getWIBTime();
        // (Logika sendMessage blast di sini)
        stats.totalBlast += 28; // Contoh penambahan
        bot.answerCallbackQuery(q.id, { text: "Blast Berjalan!" });
    }
});

bot.onText(/\/start/, (msg) => sendPilihanLogin(msg.chat.id));
