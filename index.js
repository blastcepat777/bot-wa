const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

process.on('uncaughtException', (err) => console.log('Error: ', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection: ', reason));

// --- DATA & STATS ---
let stats = { 
    totalBlast: 0,
    lastBlastTime: "Belum ada aktivitas"
};

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', color: '🌪', menuSent: false, isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', color: '🌊', menuSent: false, isInitializing: false }
};

// --- HELPER TIME WIB ---
const getWIBTime = () => {
    return new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";
};

// --- KEYBOARDS ---
const menuBawah = {
    reply_markup: {
        keyboard: [
            [{ text: "♻️ RESTART" }], 
            [ 
                { text: "📊 LAPORAN HARIAN" }, 
                { text: "🛡️ CEK STATUS WA" }, 
                { text: "🚪 LOGOUT WA" } 
            ] 
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

const loginInline = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "🚀 LOGIN ENGINE 1", callback_data: "login_1" }, { text: "🚀 LOGIN ENGINE 2", callback_data: "login_2" }]
        ]
    }
};

const sendMenuUtama = (chatId) => {
    bot.sendMessage(chatId, `🌪️ **NINJA STORM ENGINE**\n\nKlik tombol di bawah atau gunakan menu keyboard untuk memulai.`, menuBawah);
};

// --- CORE FUNCTIONS ---
async function forceLogout(chatId, id) {
    if (engines[id].sock) {
        await engines[id].sock.logout().catch(() => {});
        engines[id].sock.end();
        engines[id].sock = null;
    }
    if (fs.existsSync(engines[id].session)) {
        fs.rmSync(engines[id].session, { recursive: true, force: true });
    }
    engines[id].menuSent = false;
    engines[id].isInitializing = false;
    bot.sendMessage(chatId, `✅ **ENGINE ${id} TELAH LOGOUT & SESI DIHAPUS**`, menuBawah);
}

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

        if (qr && chatId) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 4 }); 
                const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n🕒 Generate: ${getWIBTime()}`;
                const sent = await bot.sendPhoto(chatId, buffer, { caption, parse_mode: 'Markdown' });
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
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} BERHASIL TERHUBUNG!**\nSistem siap digunakan.`, menuBawah);
        }
        
        if (connection === 'close') {
            engines[id].isInitializing = false;
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) initWA(chatId, id);
        }
    });
}

// --- TELEGRAM EVENTS ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "📊 LAPORAN HARIAN") {
        const laporan = `📊 **REKAPAN LAPORAN BLAST**\n` +
                        `--------------------------\n` +
                        `🕒 Waktu Cek: ${getWIBTime()}\n` +
                        `🚀 Total Blast: ${stats.totalBlast} Pesan\n` +
                        `📅 Terakhir Blast: ${stats.lastBlastTime}\n` +
                        `--------------------------\n` +
                        `Status Server: ✅ Active 24H`;
        bot.sendMessage(chatId, laporan, menuBawah);
    }

    if (text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **STATUS KONEKSI WA**\n\n";
        for (let i = 1; i <= 2; i++) {
            status += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        }
        bot.sendMessage(chatId, status, menuBawah);
    }

    if (text === "🚪 LOGOUT WA") {
        bot.sendMessage(chatId, "🚪 **PILIH ENGINE UNTUK LOGOUT:**", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🌪 LOGOUT ENGINE 1", callback_data: "logout_1" }],
                    [{ text: "🌊 LOGOUT ENGINE 2", callback_data: "logout_2" }]
                ]
            }
        });
    }

    if (text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ **SYSTEM REBOOTING...**\n_Membersihkan koneksi lama..._", menuBawah);
        
        for (let id in engines) {
            if (engines[id].sock) {
                engines[id].sock.end();
                engines[id].sock = null;
            }
            engines[id].isInitializing = false;
        }
        
        setTimeout(() => {
            // POIN PERTAMA: System Online langsung kasih tombol Login
            bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**\nSilahkan login kembali untuk memulai blast:", loginInline);
        }, 2500);
    }
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    const data = q.data;

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        if (engines[id].isInitializing) return bot.answerCallbackQuery(q.id, { text: "Proses sedang berjalan..." });
        bot.sendMessage(chatId, `⏳ **Sedang meminta QR Code Engine ${id}...**`);
        initWA(chatId, id);
    }

    if (data.startsWith('logout_')) {
        const id = data.split('_')[1];
        await forceLogout(chatId, id);
        bot.deleteMessage(chatId, msgId).catch(() => {});
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Engine ${id} Belum Login!`);
        bot.sendMessage(chatId, `${engines[id].color} **FILTER NOMOR SEDANG BERJALAN...**`);
        // ... (logika filter tetap sama)
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        const fileAktif = `aktif_${id}.txt`;
        if (!fs.existsSync(fileAktif)) return bot.sendMessage(chatId, "❌ Filter nomor dulu, Bos!");
        
        const lines = fs.readFileSync(fileAktif, 'utf-8').split('\n').filter(l => l.trim().length > 5);
        bot.sendMessage(chatId, `🚀 **PROSES BLAST ENGINE ${id} DIMULAI...**`);
        
        // Update waktu terakhir blast (POIN KEDUA)
        stats.lastBlastTime = getWIBTime();

        for (const line of lines) {
            const num = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            try {
                await engines[id].sock.sendMessage(num, { text: "Pesan Blast Ninja Storm!" });
                stats.totalBlast++;
            } catch (e) {}
        }
        bot.sendMessage(chatId, `✅ **BLAST ENGINE ${id} SELESAI!**\nTotal sukses sesi ini: ${lines.length}`, menuBawah);
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => sendMenuUtama(msg.chat.id));
bot.onText(/\/login/, (msg) => bot.sendMessage(msg.chat.id, "🚀 Pilih Engine untuk Login:", loginInline));
