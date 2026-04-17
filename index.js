const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi Anti-Crash Global (PENTING)
process.on('uncaughtException', (err) => console.log('Proteksi: Mencegah Crash ->', err.message));
process.on('unhandledRejection', (reason) => console.log('Proteksi: Mencegah Rejection ->', reason));

let stats = { totalBlast: 0, hariIni: 0, terahirUpdate: new Date().toLocaleDateString('id-ID') };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

// --- KEYBOARD MENU ---
const menuBawah = {
    reply_markup: {
        keyboard: [[
            { text: "📊 LAPORAN HARIAN" }, 
            { text: "♻️ RESTART" }, 
            { text: "🛡️ CEK STATUS WA" }
        ]],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

const safeDelete = async (chatId, msgId) => {
    if (msgId) { try { await bot.deleteMessage(chatId, msgId); } catch (e) {} }
};

// --- FUNGSI UPDATE QR (DENGAN OPTIMASI BUFFER) ---
async function sendOrUpdateQR(chatId, id, buffer) {
    const sekarang = new Date();
    const jam = sekarang.toLocaleTimeString('id-ID');
    const otherId = id == 1 ? 2 : 1;
    
    const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n` +
                    `⌚ **Update Jam:** ${jam}\n\n` +
                    `_Pastikan koneksi internet di HP stabil._`;

    const markup = {
        inline_keyboard: [
            [{ text: `(ON)${engines[otherId].color} QR${otherId}`, callback_data: `login_${otherId}` }],
            [{ text: "❌ CANCEL", callback_data: 'batal' }]
        ]
    };

    await safeDelete(chatId, engines[id].lastQrMsgId);
    const sent = await bot.sendPhoto(chatId, buffer, { caption, reply_markup: markup, parse_mode: 'Markdown' });
    engines[id].lastQrMsgId = sent.message_id;
}

// --- FUNGSI INIT WA (OPTIMASI ANTI-CRASH & SCAN CEPAT) ---
async function initWA(chatId, id) {
    // Bersihkan sesi yang rusak jika belum terhubung
    if (!engines[id].sock?.user && fs.existsSync(engines[id].session)) {
        try { fs.rmSync(engines[id].session, { recursive: true, force: true }); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"], // Identitas browser stabil
        syncFullHistory: false,                   // MATIKAN download chat lama (Penyebab Crash)
        shouldSyncHistoryMessage: () => false,    // Blokir sinkronisasi pesan masuk
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    engines[id].sock.ev.on('creds.update', saveCreds);

    engines[id].sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;
        
        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 4, margin: 2 });
            await sendOrUpdateQR(chatId, id, buffer);
        }

        if (connection === 'open') {
            await safeDelete(chatId, engines[id].lastQrMsgId);
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE** ✅`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `🔍 FILTER 1`, callback_data: `filter_1` }, { text: `🔍 FILTER 2`, callback_data: `filter_2` }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                }
            });
        }

        if (connection === 'close') {
            const status = lastDisconnect?.error?.output?.statusCode;
            if (status !== DisconnectReason.loggedOut) {
                // Reconnect otomatis jika koneksi terputus bukan karena logout
                setTimeout(() => initWA(chatId, id), 3000);
            } else {
                engines[id].sock = null;
            }
        }
    });
}

// --- HANDLER PESAN ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ **PROSES RESTART...**");
        setTimeout(() => process.exit(0), 1000);
    }
    if (msg.text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **REKAPAN BLAST**\n\nHari Ini: ${stats.hariIni}\nTotal: ${stats.totalBlast}`, menuBawah);
    }
    if (msg.text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **CEK KEAMANAN WA**\n\n";
        for (let i = 1; i <= 2; i++) {
            status += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        }
        bot.sendMessage(chatId, status, menuBawah);
    }
});

// --- HANDLER CALLBACK ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data === 'cmd_login') {
        bot.sendMessage(chatId, "🚀 Pilih Engine:", {
            reply_markup: { inline_keyboard: [[{ text: "🌪 QR1", callback_data: 'login_1' }, { text: "🌊 QR2", callback_data: 'login_2' }]] }
        });
    }

    if (data.startsWith('login_')) {
        initWA(chatId, data.split('_')[1]);
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Engine ${id} belum login!`);
        bot.sendMessage(chatId, `${engines[id].color} **FILTERING SEDANG JALAN...**`);
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
        } catch (e) { bot.sendMessage(chatId, `❌ File ${engines[id].file} bermasalah.`); }
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        try {
            const numbers = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const pesanBlast = fs.readFileSync(engines[id].script, 'utf-8'); 
            bot.sendMessage(chatId, `🚀 **ENGINE ${id} MULAI BLAST...**`);
            for (let line of numbers) {
                const num = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                await engines[id].sock.sendMessage(num, { text: pesanBlast }).catch(() => {});
                stats.totalBlast++;
                stats.hariIni++;
            }
            bot.sendMessage(chatId, `✅ **ENGINE ${id} SELESAI!**`);
        } catch (e) { bot.sendMessage(chatId, "❌ Gagal Blast."); }
    }

    if (data === 'batal') await safeDelete(chatId, q.message.message_id);
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => bot.sendMessage(
