const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi Anti-Crash
process.on('uncaughtException', (err) => console.log('Log Error:', err.message));
process.on('unhandledRejection', (reason) => console.log('Log Rejection:', reason));

let stats = { totalBlast: 0, hariIni: 0 };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

// --- FUNGSI MEMBERSIHKAN SESSION (SOLUSI QR MUTAR) ---
const clearSession = (folder) => {
    if (fs.existsSync(folder)) {
        fs.rmSync(folder, { recursive: true, force: true });
        console.log(`Folder ${folder} dibersihkan.`);
    }
};

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
    // Jika tidak ada koneksi aktif, bersihkan folder session agar QR tidak stuck/mutar
    if (!engines[id].sock) {
        clearSession(engines[id].session);
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ninja Storm", "Chrome", "1.0.0"],
        connectTimeoutMs: 60000, // Tambah waktu timeout
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    const sock = engines[id].sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 4 });
            const sekarang = new Date();
            const caption = `${engines[id].color} **SCAN QR ENGINE ${id}**\n\n` +
                            `📅 **Tanggal:** ${sekarang.toLocaleDateString('id-ID')}\n` +
                            `⌚ **Update Jam:** ${sekarang.toLocaleTimeString('id-ID')}\n\n` +
                            `_Jika mutar terus, klik RESTART di bawah._`;

            const markup = {
                inline_keyboard: [
                    [{ text: `(ON) QR ${id == 1 ? 2 : 1}`, callback_data: `login_${id == 1 ? 2 : 1}` }],
                    [{ text: "❌ CANCEL", callback_data: 'batal' }]
                ]
            };

            await safeDelete(chatId, engines[id].lastQrMsgId);
            const sent = await bot.sendPhoto(chatId, buffer, { caption, reply_markup: markup, parse_mode: 'Markdown' });
            engines[id].lastQrMsgId = sent.message_id;
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
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (!shouldReconnect) {
                engines[id].sock = null; // Reset sock jika logout total
            } else {
                initWA(chatId, id);
            }
        }
    });
}

// --- HANDLER BUTTONS ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        bot.answerCallbackQuery(q.id, { text: "Meminta Barcode baru..." });
        initWA(chatId, id);
    }
    
    // Handler filter, jalan_blast, batal, dll (sama seperti sebelumnya)
    if (data === 'batal') {
        await safeDelete(chatId, q.message.message_id);
        bot.sendMessage(chatId, "❌ Dibatalkan.", menuBawah);
    }
});

bot.on('message', async (msg) => {
    if (msg.text === "♻️ RESTART") {
        await bot.sendMessage(msg.chat.id, "♻️ **SYSTEM RESTART...** Folder session dibersihkan.");
        // Hapus semua session saat restart manual agar tidak stuck
        clearSession('./session_1');
        clearSession('./session_2');
        setTimeout(() => process.exit(0), 1000);
    }
    // Handler status dan laporan...
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, `🌪️ **NINJA STORM ENGINE READY**`, menuBawah));
