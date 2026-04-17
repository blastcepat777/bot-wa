const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi Anti-Crash
process.on('uncaughtException', (err) => console.log('Sistem Aman:', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection Aman:', reason));

let stats = { totalBlast: 0, hariIni: 0 };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪', menuSent: false, isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊', menuSent: false, isInitializing: false }
};

// Menu Keyboard Bawah
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

    // Reset session jika login manual agar fresh
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
        browser: ["Mac OS", "Chrome", "121.0.0.0"], // Identitas Mac biasanya lebih cepat scan
        syncFullHistory: false,
        qrTimeout: 60000, // Beri waktu 1 menit sebelum ganti QR
        connectTimeoutMs: 60000
    });

    const sock = engines[id].sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr && chatId) {
            try {
                // QR Dibuat Sangat Kontras (Error Level M)
                const buffer = await QRCode.toBuffer(qr, { scale: 10, margin: 2, errorCorrectionLevel: 'M' });
                const caption = `${engines[id].color} **SCAN QR ENGINE ${id}**\n\n⌚ **Update:** ${new Date().toLocaleTimeString('id-ID')} WIB\n\n_Pastikan layar terang dan fokus!_`;

                if (engines[id].lastQrMsgId) {
                    await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                }

                const sent = await bot.sendPhoto(chatId, buffer, { 
                    caption, 
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] }
                });
                engines[id].lastQrMsgId = sent.message_id;
            } catch (e) { console.log("Gagal buat QR"); }
        }

        if (connection === 'open') {
            engines[id].isInitializing = false;
            if (engines[id].lastQrMsgId && chatId) {
                await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            }
            sendMenuEngine(chatId, id);
        }
        
        if (connection === 'close') {
            engines[id].isInitializing = false;
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) initWA(chatId, id);
        }
    });
}

// Handler Pesan Utama
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ **SYSTEM RESTARTING...**");
        setTimeout(() => process.exit(0), 1000);
    }
    
    if (text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **TOTAL BLAST:** ${stats.totalBlast}\n🏠 **HARI INI:** ${stats.hariIni}`, menuBawah);
    }
    
    if (text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **STATUS ENGINE**\n\n";
        for (let i = 1; i <= 2; i++) {
            status += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ CONNECTED" : "❌ DISCONNECTED"}\n`;
        }
        bot.sendMessage(chatId, status, menuBawah);
    }
});

// Handler Callback
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        bot.sendMessage(chatId, `⏳ Menyiapkan QR Engine ${id}...`);
        initWA(chatId, id);
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Login dulu Bos!`);
        bot.sendMessage(chatId, `${engines[id].color} **FILTERING...**`);
        try {
            const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            let aktif = [];
            for (const line of lines) {
                const num = line.replace(/[^0-9]/g, '');
                const [res] = await engines[id].sock.onWhatsApp(num).catch(() => [null]);
                if (res?.exists) aktif.push(line.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            bot.sendMessage(chatId, `✅ **FILTER ${id} OK**\nAktif: ${aktif.length}`, {
                reply_markup: { inline_keyboard: [[{ text: `🚀 BLAST ${id}`, callback_data: `jalan_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, `❌ Error Filter.`); }
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        const numbers = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const pesan = fs.readFileSync(engines[id].script, 'utf-8');
        bot.sendMessage(chatId, `🚀 **BLASTING ENGINE ${id}...**`);
        numbers.forEach(l => {
            const num = l.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            engines[id].sock.sendMessage(num, { text: pesan }).catch(() => {});
            stats.totalBlast++;
        });
        bot.sendMessage(chatId, `✅ **BLAST ${id} SELESAI!**`);
    }

    if (data === 'batal') await bot.deleteMessage(chatId, q.message.message_id).catch(() => {});
    if (data === 'restart_bot') process.exit();
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "🌪️ **NINJA STORM ENGINE READY**", menuBawah));
bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 Pilih Engine:", {
        reply_markup: { inline_keyboard: [[{ text: "🌪 Engine 1", callback_data: 'login_1' }, { text: "🌊 Engine 2", callback_data: 'login_2' }]] }
    });
});
