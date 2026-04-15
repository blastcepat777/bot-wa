const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATABASE REPORT ---
const REPORT_FILE = './daily_report.json';
function getReport() {
    const today = new Date().toLocaleDateString('id-ID');
    if (!fs.existsSync(REPORT_FILE)) return { date: today, total: 0 };
    try {
        let data = JSON.parse(fs.readFileSync(REPORT_FILE));
        if (data.date !== today) return { date: today, total: 0 };
        return data;
    } catch (e) { return { date: today, total: 0 }; }
}
function updateReport(count) {
    let data = getReport();
    data.total += count;
    fs.writeFileSync(REPORT_FILE, JSON.stringify(data));
}

// --- SERVER KEEP ALIVE ---
const app = express();
app.get('/', (req, res) => res.send('NINJA STORM ENGINE ACTIVE'));
app.listen(process.env.PORT || 3000);

let sock;
let isProcessing = false;
let userState = {};
let currentMethod = null;

const loginMenu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "📸 QR Scan", callback_data: 'l_qr' }],
            [{ text: "🔑 Pairing Code", callback_data: 'l_cd' }]
        ]
    }
};

async function initWA(chatId, method, phoneNumber = null, msgId = null) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    currentMethod = method;

    if (sock) { try { sock.end(); } catch (e) {} }

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        // UPDATE QR DI TEMPAT (EDIT MEDIA)
        if (qr && currentMethod === 'QR' && msgId) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 8 });
                await bot.editMessageMedia({
                    type: 'photo',
                    media: buffer,
                    caption: `📸 **SCAN QR SEKARANG**\nUpdate: ${new Date().toLocaleTimeString()}`,
                    parse_mode: 'Markdown'
                }, {
                    chat_id: chatId,
                    message_id: msgId,
                    reply_markup: {
                        inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu_del' }]]
                    }
                });
            } catch (err) {}
        }

        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG!**");
            if (msgId) bot.deleteMessage(chatId, msgId).catch(() => {});
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut && currentMethod !== 'STOP') {
                initWA(chatId, method, phoneNumber, msgId);
            }
        }
    });

    // PAIRING CODE DI TEMPAT
    if (method === 'CODE' && phoneNumber && msgId) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
                await bot.editMessageText(`🔑 **KODE PAIRING ANDA:**\n\n\`${code}\`\n\nMasukkan di HP Anda.`, {
                    chat_id: chatId,
                    message_id: msgId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu' }]]
                    }
                });
            } catch (e) {
                bot.editMessageText("❌ Gagal. Gunakan /restart.", { chat_id: chatId, message_id: msgId });
            }
        }, 5000);
    }
}

// --- COMMANDS ---
bot.onText(/\/start/, (msg) => {
    const rep = getReport();
    bot.sendMessage(msg.chat.id, `🌪️ **NINJA BLAST ENGINE**\n\n📊 Total Blast: ${rep.total}\n\n/login - Koneksi\n/restart - Reset Sesi`, { parse_mode: 'Markdown' });
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "Pilih metode login:", loginMenu);
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === 'l_qr') {
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        const p = await bot.sendPhoto(chatId, 'https://placehold.jp/40/333333/ffffff/400x400.png?text=Generating%20QR...', {
            caption: "⏳ Menyiapkan QR...",
            reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu_del' }]] }
        });
        initWA(chatId, 'QR', null, p.message_id);
    }

    if (q.data === 'l_cd') {
        userState[chatId] = { step: 'NUM', msgId: msgId };
        bot.editMessageText("📞 **Masukkan Nomor (628xxx):**", {
            chat_id: chatId,
            message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu' }]] }
        });
    }

    if (q.data === 'back_to_menu') {
        currentMethod = 'STOP';
        if (sock) { sock.end(); sock = null; }
        bot.editMessageText("Pilih metode login:", { chat_id: chatId, message_id: msgId, reply_markup: loginMenu.reply_markup });
    }

    if (q.data === 'back_to_menu_del') {
        currentMethod = 'STOP';
        if (sock) { sock.end(); sock = null; }
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        bot.sendMessage(chatId, "Pilih metode login:", loginMenu);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId]?.step === 'NUM' && msg.text && !msg.text.startsWith('/')) {
        const targetId = userState[chatId].msgId;
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        bot.editMessageText("⏳ **Meminta kode...**", { chat_id: chatId, message_id: targetId });
        initWA(chatId, 'CODE', msg.text, targetId);
        delete userState[chatId];
    }
});

bot.onText(/\/restart/, async (msg) => {
    currentMethod = 'STOP';
    await bot.sendMessage(msg.chat.id, "♻️ **SYSTEM RESTARTING...**\nSesi dihapus. Railway akan otomatis menyalakan ulang bot dalam beberapa detik.");
    
    if (sock) {
        sock.ev.removeAllListeners('connection.update');
        sock.end();
    }
    
    // Hapus folder sesi secara sinkron agar tuntas sebelum exit
    setTimeout(() => {
        if (fs.existsSync('./session_data')) {
            fs.rmSync('./session_data', { recursive: true, force: true });
        }
        process.exit(0); // Railway akan mendeteksi exit dan auto-start lagi 24/7
    }, 2000);
});
