const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

process.on('uncaughtException', (err) => console.log('Error: ', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection: ', reason));

// --- SISTEM STATISTIK REAL-TIME WIB ---
let stats = { 
    totalBlast: 0, 
    dailyBlast: 0, 
    lastBlastTime: "-", 
    lastDate: new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }) 
};

// Fungsi cek ganti hari untuk reset harian otomatis
const checkDateReset = () => {
    const currentDate = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
    if (stats.lastDate !== currentDate) {
        stats.dailyBlast = 0;
        stats.lastDate = currentDate;
    }
};

const getWIBTime = () => {
    return new Date().toLocaleTimeString('id-ID', { 
        timeZone: 'Asia/Jakarta', 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit' 
    }) + " WIB";
};

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', color: '🌪', menuSent: false, isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', color: '🌊', menuSent: false, isInitializing: false }
};

// --- KEYBOARD PERMANEN BAWAH (URUTAN SESUAI PERMINTAAN) ---
const menuBawah = {
    reply_markup: {
        keyboard: [
            [{ text: "♻️ RESTART" }],           // 1. Restart paling atas
            [{ text: "📊 LAPORAN HARIAN" }],    // 2. Laporan Harian di bawahnya
            [{ text: "🛡️ CEK STATUS WA" }],     // 3. Status WA
            [{ text: "🚪 LOGOUT WA" }]          // 4. Logout paling bawah
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

const sendMenuUtama = (chatId) => {
    bot.sendMessage(chatId, `🌪️ **NINJA STORM ENGINE**\n\n/login - Ambil Barcode\n/restart - Reset All`, menuBawah);
};

const sendMenuEngine = (chatId, id) => {
    bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE**\n\nSilahkan Pilih Aksi:`, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: `🔍 FILTER ${id}`, callback_data: `filter_${id}` },
                    { text: "🚪 LOGOUT", callback_data: `logout_${id}` }
                ],
                [{ text: "❌ KELUAR MENU", callback_data: 'batal' }]
            ]
        }
    });
};

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
    bot.sendMessage(chatId, `✅ **ENGINE ${id} TELAH LOGOUT**`, menuBawah);
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
                const caption = `${engines[id].color} **SCAN QR ENGINE ${id}**\n\n🕒 Update: ${getWIBTime()}`;
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
            if (!engines[id].menuSent && chatId) {
                sendMenuEngine(chatId, id);
                engines[id].menuSent = true;
            }
        }
        
        if (connection === 'close') {
            engines[id].isInitializing = false;
            engines[id].menuSent = false;
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) initWA(chatId, id);
        }
    });
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "📊 LAPORAN HARIAN") {
        checkDateReset();
        const laporan = `📊 **LAPORAN PRODUKSI**\n` +
                        `--------------------------\n` +
                        `📅 Tanggal: ${stats.lastDate}\n` +
                        `⏰ Terakhir Blast: ${stats.lastBlastTime}\n\n` +
                        `✅ Rekap Harian: ${stats.dailyBlast}\n` +
                        `🏆 Total Keseluruhan: ${stats.totalBlast}\n` +
                        `--------------------------`;
        bot.sendMessage(chatId, laporan, menuBawah);
    }

    if (text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **STATUS ENGINE**\n\n";
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
        await bot.sendMessage(chatId, "♻️ **SYSTEM RESTARTING...**", { reply_markup: { remove_keyboard: true } });
        setTimeout(() => process.exit(0), 1500);
    }
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    const data = q.data;

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        initWA(chatId, id);
    }

    if (data.startsWith('logout_')) {
        const id = data.split('_')[1];
        await forceLogout(chatId, id);
        bot.deleteMessage(chatId, msgId).catch(() => {});
    }

    if (data === 'batal') {
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        sendMenuUtama(chatId);
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Engine ${id} Belum Login!`);
        bot.sendMessage(chatId, `${engines[id].color} **FILTER ENGINE ${id} MULAI...**`);
        try {
            const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            let aktif = [];
            for (const line of lines) {
                const num = line.replace(/[^0-9]/g, '');
                const [res] = await engines[id].sock.onWhatsApp(num).catch(() => [null]);
                if (res?.exists) aktif.push(line.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            bot.sendMessage(chatId, `✅ **FILTER ${id} SELESAI**\nAktif: ${aktif.length}`, {
                reply_markup: {
                    inline_keyboard: [[{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }, { text: "❌ BATAL", callback_data: 'batal' }]]
                }
            });
        } catch (e) { bot.sendMessage(chatId, `❌ File ${engines[id].file} tidak ditemukan.`); }
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        const lines = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
        bot.sendMessage(chatId, `🚀 **BLAST ENGINE ${id} JALAN...**`);
        
        Promise.all(lines.map(line => {
            const num = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            return engines[id].sock.sendMessage(num, { text: "Pesan Blast Ninja Storm!" })
                .then(() => {
                    checkDateReset();
                    stats.totalBlast++;
                    stats.dailyBlast++;
                    stats.lastBlastTime = getWIBTime();
                }).catch(() => {});
        })).then(() => {
            bot.sendMessage(chatId, `✅ **BLAST ${id} SELESAI!**`);
        });
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => sendMenuUtama(msg.chat.id));
