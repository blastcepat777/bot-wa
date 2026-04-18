const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA & STATS ---
let stats = { totalBlast: 0, lastBlastTime: "Belum ada aktivitas" };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', color: '🌪', isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', color: '🌊', isInitializing: false }
};

const getWIBTime = () => {
    return new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";
};

// --- KEYBOARD CONFIG ---
const menuBawah = {
    reply_markup: {
        keyboard: [
            [{ text: "♻️ RESTART" }], 
            [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }] 
        ],
        resize_keyboard: true
    }
};

// Fungsi munculkan tombol login di bawah pesan System Online
const sendPilihanLogin = (chatId, text = "✅ **SYSTEM ONLINE!**\nSilahkan login kembali untuk memulai blast:") => {
    bot.sendMessage(chatId, text, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 LOGIN ENGINE 1", callback_data: "login_1" }, { text: "🚀 LOGIN ENGINE 2", callback_data: "login_2" }]
            ]
        }
    });
};

// --- CORE FUNCTIONS ---
async function initWA(chatId, id) {
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
        const { connection, qr, lastDisconnect } = u;

        // QR DENGAN TOMBOL NAVIGASI LENGKAP
        if (qr && chatId) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 4 });
                const otherId = id == 1 ? 2 : 1;
                const opts = {
                    caption: `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n🕒 Generate: ${getWIBTime()}`,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: `🔄 KE QR ENGINE ${otherId}`, callback_data: `login_${otherId}` }],
                            [{ text: "❌ CANCEL", callback_data: 'batal' }]
                        ]
                    }
                };
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
                    inline_keyboard: [
                        [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
                        [{ text: "❌ KELUAR", callback_data: 'batal' }]
                    ]
                }
            });
        }

        if (connection === 'close') {
            engines[id].isInitializing = false;
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) initWA(chatId, id);
        }
    });
}

// --- HANDLERS ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    
    if (msg.text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ **SYSTEM REBOOTING...**\n_Harap tunggu sejenak._", menuBawah);
        for (let i in engines) { 
            if (engines[i].sock) engines[i].sock.end(); 
            engines[i].isInitializing = false; 
        }
        // Jeda agar reboot terasa, lalu kirim pesan online + tombol login
        setTimeout(() => sendPilihanLogin(chatId), 2000);
    }

    if (msg.text === "📊 LAPORAN HARIAN") {
        const laporan = `📊 **LAPORAN BLAST**\n` +
                        `--------------------------\n` +
                        `🕒 Jam Cek: ${getWIBTime()}\n` +
                        `🚀 Total Blast: ${stats.totalBlast}\n` +
                        `📅 Terakhir: ${stats.lastBlastTime}\n` +
                        `--------------------------`;
        bot.sendMessage(chatId, laporan, menuBawah);
    }

    if (msg.text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **STATUS ENGINE**\n";
        for (let i=1; i<=2; i++) {
            status += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        }
        bot.sendMessage(chatId, status, menuBawah);
    }

    if (msg.text === "🚪 LOGOUT WA") {
        bot.sendMessage(chatId, "🚪 **PILIH ENGINE UNTUK LOGOUT:**", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🌪 LOGOUT ENGINE 1", callback_data: "logout_1" }, { text: "🌊 LOGOUT ENGINE 2", callback_data: "logout_2" }]
                ]
            }
        });
    }
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        if (engines[id].isInitializing) return bot.answerCallbackQuery(q.id, { text: "Proses sedang berjalan..." });
        bot.sendMessage(chatId, `⏳ **Menyiapkan QR Engine ${id}...**`);
        initWA(chatId, id);
    }

    if (data === 'batal') {
        await bot.deleteMessage(chatId, q.message.message_id).catch(() => {});
        sendPilihanLogin(chatId, "🌪 **NINJA STORM ENGINE**\nSilahkan pilih:");
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        bot.sendMessage(chatId, `${engines[id].color} **FILTER ${id} SELESAI**\nAktif: 28`, {
            reply_markup: {
                inline_keyboard: [[{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }]]
            }
        });
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        stats.lastBlastTime = getWIBTime();
        stats.totalBlast += 28; // Simulasi total
        bot.sendMessage(chatId, `✅ **BLAST ENGINE ${id} SELESAI!**`, menuBawah);
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => sendPilihanLogin(msg.chat.id));
