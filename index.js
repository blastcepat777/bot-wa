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

// --- SERVER ---
const app = express();
app.get('/', (req, res) => res.send('NINJA STORM ENGINE ACTIVE'));
app.listen(process.env.PORT || 3000);

let sock;
let isProcessing = false;
let userState = {};
let qrMsgId = null;

async function initWA(chatId, method, phoneNumber = null, msgToEdit = null) {
    if (!fs.existsSync('./session_data')) fs.mkdirSync('./session_data');
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(qr, { scale: 8 });
            if (qrMsgId) await bot.deleteMessage(chatId, qrMsgId).catch(() => {});
            const sent = await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR SEKARANG**" });
            qrMsgId = sent.message_id;
        }

        if (connection === 'open') {
            if (qrMsgId) await bot.deleteMessage(chatId, qrMsgId).catch(() => {});
            bot.sendMessage(chatId || "Auto", "✅ **WA TERHUBUNG**");
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) initWA(chatId, method, phoneNumber, msgToEdit);
        }
    });

    // --- PAIRING CODE LOGIC ---
    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
                const txt = `🔑 **KODE PAIRING ANDA:**\n\n\`${code}\`\n\nMasukkan di HP Anda.`;
                if (msgToEdit) {
                    await bot.editMessageText(txt, { chat_id: chatId, message_id: msgToEdit, parse_mode: 'Markdown' });
                } else {
                    await bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
                }
            } catch (e) { bot.sendMessage(chatId, "❌ Gagal generate kode."); }
        }, 3000);
    }
}

// --- COMMANDS ---
bot.onText(/\/start/, (msg) => {
    const rep = getReport();
    bot.sendMessage(msg.chat.id, `🌪️ **NINJA BLAST ENGINE**\n\n📊 **TOTAL BLAST HARI INI:** ${rep.total}\n\n/login - Hubungkan WA\n/filter - Cek Nomor Aktif\n/jalan - Blast Massal (0s)\n/restart - Reset Sesi`, { parse_mode: 'Markdown' });
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "Pilih metode login:", {
        reply_markup: { inline_keyboard: [[{ text: "📸 QR Scan", callback_data: 'l_qr' }], [{ text: "🔑 Pairing Code", callback_data: 'l_cd' }]] }
    });
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    if (q.data === 'l_qr') initWA(chatId, 'QR');
    if (q.data === 'l_cd') {
        userState[chatId] = { step: 'NUM', msgId: q.message.message_id };
        bot.editMessageText("📞 **Masukkan Nomor (628xxx):**", { chat_id: chatId, message_id: q.message.message_id });
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId]?.step === 'NUM' && msg.text && !msg.text.startsWith('/')) {
        initWA(chatId, 'CODE', msg.text, userState[chatId].msgId);
        delete userState[chatId];
    }
});

// --- FILTER ---
bot.onText(/\/filter/, async (msg) => {
    if (!sock) return bot.sendMessage(msg.chat.id, "🔴 Login dulu!");
    bot.sendMessage(msg.chat.id, "🔍 **Filtering...**");
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        let aktif = [];
        for (let line of data) {
            const num = line.trim().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const [result] = await sock.onWhatsApp(num);
            if (result && result.exists) aktif.push(line.trim());
        }
        fs.writeFileSync('nomor_aktif.txt', aktif.join('\n'));
        bot.sendMessage(msg.chat.id, `✅ Aktif: ${aktif.length}`);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Gagal."); }
});

// --- BLAST 0 DETIK ---
bot.onText(/\/jalan/, async (msg) => {
    if (isProcessing || !sock) return bot.sendMessage(msg.chat.id, "🔴 Belum login!");
    isProcessing = true;
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const s1 = fs.readFileSync('script1.txt', 'utf-8');
        const s2 = fs.readFileSync('script2.txt', 'utf-8');
        bot.sendMessage(msg.chat.id, "🌪️ **STORM STARTED!**");
        
        await Promise.all(data.map(async (line, i) => {
            const parts = line.trim().split(/\s+/);
            const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const pesan = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, parts[0]);
            return sock.sendMessage(jid, { text: pesan }).catch(() => {});
        }));

        updateReport(data.length);
        bot.sendMessage(msg.chat.id, `🚀 **BOOM! MELEDAK.**`);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Error."); }
    isProcessing = false;
});

// --- RESTART ---
bot.onText(/\/restart/, async (msg) => {
    bot.sendMessage(msg.chat.id, "♻️ **SYSTEM RESTARTING...**");
    if (sock) { sock.logout(); sock.end(); }
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    sock = null;
});
