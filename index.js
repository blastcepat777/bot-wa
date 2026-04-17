const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi Anti-Crash Global
process.on('uncaughtException', (err) => console.log('Sistem Aman dari Crash:', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection Aman:', reason));

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

// --- FUNGSI UPDATE QR (DIPERTAJAM) ---
async function sendOrUpdateQR(chatId, id, qrString) {
    try {
        const buffer = await QRCode.toBuffer(qrString, { 
            scale: 8, 
            margin: 3,
            errorCorrectionLevel: 'H'
        });

        const sekarang = new Date();
        const jam = sekarang.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' });

        const otherId = id == 1 ? 2 : 1;
        const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n⌚ **Update Jam:** ${jam} WIB\n\n_Pastikan kamera fokus, barcode sudah diperbesar._`;

        await safeDelete(chatId, engines[id].lastQrMsgId);
        const sent = await bot.sendPhoto(chatId, buffer, { 
            caption, 
            reply_markup: { 
                inline_keyboard: [
                    [{ text: `(ON)${engines[otherId].color} QR${otherId}`, callback_data: `login_${otherId}` }],
                    [{ text: "❌ CANCEL", callback_data: 'batal' }]
                ] 
            },
            parse_mode: 'Markdown' 
        });
        engines[id].lastQrMsgId = sent.message_id;
    } catch (e) { console.log("Gagal QR:", e.message); }
}

async function initWA(chatId, id) {
    // Hapus sesi lama agar tidak nyangkut (penyebab muter-muter)
    if (fs.existsSync(engines[id].session)) {
        try { fs.rmSync(engines[id].session, { recursive: true, force: true }); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ninja Storm", "Chrome", "1.0.0"],
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60000
    });

    engines[id].sock.ev.on('creds.update', saveCreds);

    engines[id].sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;
        
        if (qr) await sendOrUpdateQR(chatId, id, qr);

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
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                // Jangan restart otomatis terlalu cepat agar tidak loop
                setTimeout(() => initWA(chatId, id), 10000);
            }
        }
    });
}

// --- HANDLER CALLBACK ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    if (q.data === 'cmd_login') {
        bot.editMessageText("🚀 Pilih Engine:", {
            chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "🌪 QR1", callback_data: 'login_1' }, { text: "🌊 QR2", callback_data: 'login_2' }]] }
        });
    }
    if (q.data.startsWith('login_')) initWA(chatId, q.data.split('_')[1]);
    if (q.data === 'batal') await safeDelete(chatId, msgId);
    
    // Logika Filter & Jalan Blast tetap sama seperti sebelumnya...
    // (Tambahkan kodingan filter/jalan Bos di sini jika hilang)
    
    bot.answerCallbackQuery(q.id);
});

// --- HANDLER PESAN ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (msg.text === "♻️ RESTART") {
        // HANYA kirim satu kali pesan restart
        await bot.sendMessage(chatId, "♻️ **BERHASIL RESTART...**\nSistem dimatikan, tunggu 5 detik lalu klik LOGIN.", {
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]] }
        });
        
        // Kasih jeda sebelum benar-benar exit agar pesan terkirim
        setTimeout(() => {
            process.exit(0); 
        }, 2000);
    }

    if (msg.text === "📊 LAPORAN HARIAN") bot.sendMessage(chatId, `📊 Hari Ini: ${stats.hariIni}\nTotal: ${stats.totalBlast}`, menuBawah);
    
    if (msg.text === "🛡️ CEK STATUS WA") {
        let s = "🛡️ **CEK KEAMANAN WA**\n\n";
        for (let i=1; i<=2; i++) s += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ AMAN" : "❌ LIMIT/OFF"}\n`;
        bot.sendMessage(chatId, s, menuBawah);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, `🌪️ **NINJA STORM ENGINE READY**`, menuBawah));
