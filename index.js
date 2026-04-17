const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- PROTEKSI ANTI-CRASH (WAJIB) ---
process.on('uncaughtException', (err) => console.error('Sistem Menghalangi Crash:', err));
process.on('unhandledRejection', (reason) => console.error('Sistem Menghalangi Rejection:', reason));

let stats = { totalBlast: 0, hariIni: 0, terahirUpdate: new Date().toLocaleDateString('id-ID') };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
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

async function sendOrUpdateQR(chatId, id, buffer) {
    const sekarang = new Date();
    const jam = sekarang.toLocaleTimeString('id-ID');
    const otherId = id == 1 ? 2 : 1;
    const caption = `${engines[id].color} **SCAN QR ENGINE ${id}**\n⌚ Jam: ${jam}\n\n_Pastikan WA di HP tidak sedang loading._`;

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

// --- FUNGSI INIT WA ANTI-CRASH & ANTI-STUCK ---
async function initWA(chatId, id) {
    // Hapus sesi lama hanya jika tidak ada kredensial valid (Fresh Login)
    if (!fs.existsSync(`${engines[id].session}/creds.json`)) {
        if (fs.existsSync(engines[id].session)) {
            fs.rmSync(engines[id].session, { recursive: true, force: true });
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Windows", "Chrome", "11.0.0"],
        syncFullHistory: false, // Mematikan download chat lama (PENTING)
        shouldSyncHistoryMessage: () => false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    engines[id].sock.ev.on('creds.update', saveCreds);

    engines[id].sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 4 });
            await sendOrUpdateQR(chatId, id, buffer);
        }

        if (connection === 'open') {
            await safeDelete(chatId, engines[id].lastQrMsgId);
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE** ✅`, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: `🔍 FILTER 1`, callback_data: `filter_1` },
                        { text: `🔍 FILTER 2`, callback_data: `filter_2` }
                    ], [{ text: "❌ CANCEL", callback_data: 'batal' }]]
                }
            });
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            // Reconnect jika bukan karena sengaja Logout
            if (code !== DisconnectReason.loggedOut) {
                initWA(chatId, id);
            } else {
                engines[id].sock = null;
                if (fs.existsSync(engines[id].session)) fs.rmSync(engines[id].session, { recursive: true, force: true });
            }
        }
    });
}

// --- HANDLER CALLBACK & MESSAGE (FOKUS STABILITAS) ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data === 'cmd_login') {
        bot.editMessageText("🚀 Pilih Engine:", {
            chat_id: chatId, message_id: q.message.message_id,
            reply_markup: { inline_keyboard: [[{ text: "🌪 QR1", callback_data: 'login_1' }, { text: "🌊 QR2", callback_data: 'login_2' }]] }
        });
    }

    if (data.startsWith('login_')) {
        initWA(chatId, data.split('_')[1]);
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Engine ${id} OFF!`);
        bot.sendMessage(chatId, `${engines[id].color} **FILTERING...**`);
        try {
            const data = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.length > 5);
            let aktif = [];
            for (let line of data) {
                const num = line.replace(/[^0-9]/g, '');
                const [res] = await engines[id].sock.onWhatsApp(num).catch(() => [null]);
                if (res?.exists) aktif.push(line.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            bot.sendMessage(chatId, `✅ **FILTER ${id} OK**\nAktif: ${aktif.length}`, {
                reply_markup: { inline_keyboard: [[{ text: `🚀 BLAST ${id}`, callback_data: `jalan_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ File Error"); }
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        try {
            const nums = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.length > 5);
            const msg = fs.readFileSync(engines[id].script, 'utf-8');
            bot.sendMessage(chatId, `🚀 **BLASTING ENGINE ${id}...**`);
            for (let line of nums) {
                const target = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                await engines[id].sock.sendMessage(target, { text: msg }).catch(() => {});
                stats.totalBlast++; stats.hariIni++;
            }
            bot.sendMessage(chatId, `✅ **ENGINE ${id} SELESAI**`);
        } catch (e) { bot.sendMessage(chatId, "❌ Blast Error"); }
    }

    if (data === 'batal') await safeDelete(chatId, q.message.message_id);
    bot.answerCallbackQuery(q.
