const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi Anti-Crash
process.on('uncaughtException', (err) => console.log('Error: ', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection: ', reason));

let stats = { totalBlast: 0, hariIni: 0 };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪', menuSent: false, isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊', menuSent: false, isInitializing: false }
};

// --- SETTINGAN KEYBOARD BAWAH (SCRIPT 2) ---
const menuBawah = {
    reply_markup: {
        keyboard: [
            [{ text: "📊 LAPORAN HARIAN" }],
            [{ text: "♻️ RESTART" }, { text: "🛡️ CEK STATUS WA" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

const sendMenuEngine = (chatId, id) => {
    bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE**\n\nSilahkan Pilih Aksi:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
                [{ text: "♻️ RESTART BOT", callback_data: 'restart_bot' }],
                [{ text: "❌ KELUAR", callback_data: 'batal' }]
            ]
        }
    });
};

async function initWA(chatId, id) {
    if (engines[id].isInitializing) return;
    engines[id].isInitializing = true;

    if (chatId && fs.existsSync(engines[id].session)) {
        try { fs.rmSync(engines[id].session, { recursive: true, force: true }); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
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

        // --- LOGIKA QR CODE (SCRIPT 1) ---
        if (qr && chatId) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 8 });
                const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n🕒 Update: ${new Date().toLocaleTimeString('id-ID')}`;

                if (engines[id].lastQrMsgId) {
                    await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                }

                const sent = await bot.sendPhoto(chatId, buffer, { 
                    caption, 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: "❌ CANCEL", callback_data: 'batal' }]]
                    }
                });
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
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) initWA(chatId, id);
        }
    });
}

// Auto-load
Object.keys(engines).forEach(id => {
    if (fs.existsSync(engines[id].session)) {
        initWA(null, id); 
    }
});

// --- CALLBACK HANDLER ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    const data = q.data;

    if (data === 'cmd_login') {
        return bot.editMessageText("🚀 Pilih Engine untuk Scan:", {
            chat_id: chatId, message_id: msgId,
            reply_markup: {
                inline_keyboard: [[{ text: "🌪 QR1", callback_data: 'login_1' }, { text: "🌊 QR2", callback_data: 'login_2' }]]
            }
        });
    }

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        bot.sendMessage(chatId, `⏳ **Menyiapkan QR Engine ${id}...**`);
        initWA(chatId, id);
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
                    inline_keyboard: [[{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }]]
                }
            });
        } catch (e) { bot.sendMessage(chatId, `❌ File ${engines[id].file} tidak ditemukan.`); }
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        const numbers = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const pesanBlast = fs.readFileSync(engines[id].script, 'utf-8'); 
        bot.sendMessage(chatId, `🚀 **BLAST ENGINE ${id} JALAN...**`);
        numbers.forEach((line) => {
            const num = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            engines[id].sock.sendMessage(num, { text: pesanBlast }).catch(() => {});
            stats.totalBlast++;
        });
        bot.sendMessage(chatId, `✅ **BLAST ${id} SELESAI!**`);
    }

    if (data === 'restart_bot') process.exit();
    if (data === 'batal') await bot.deleteMessage(chatId, msgId).catch(() => {});
    bot.answerCallbackQuery(q.id);
});

// --- PESAN HANDLER (UTAMA) ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ **RESTARTING...**", { reply_markup: { remove_keyboard: true } });
        setTimeout(() => process.exit(0), 1000);
    }
    
    if (text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **LAPORAN BLAST**\nTotal Berhasil: ${stats.totalBlast}`, menuBawah);
    }
    
    if (text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **STATUS KONEKSI WA**\n\n";
        for (let i = 1; i <= 2; i++) {
            status += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        }
        bot.sendMessage(chatId, status, menuBawah);
    }
});

// COMMANDS
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🌪️ **NINJA STORM ENGINE READY**\nGunakan tombol di bawah untuk kontrol.", menuBawah);
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 Pilih Engine untuk Login:", {
        reply_markup: {
            inline_keyboard: [[{ text: "🌪 QR1", callback_data: 'login_1' }, { text: "🌊 QR2", callback_data: 'login_2' }]]
        }
    });
});
