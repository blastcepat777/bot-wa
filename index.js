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
        syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;
        if (qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(qr, { scale: 8 });
            if (qrMsgId) await bot.deleteMessage(chatId, qrMsgId).catch(() => {});
            if (msgToEdit && !qrMsgId) await bot.deleteMessage(chatId, msgToEdit).catch(() => {});
            const sentPhoto = await bot.sendPhoto(chatId, buffer, { caption: `📸 **SCAN QR SEKARANG**` });
            qrMsgId = sentPhoto.message_id;
        }
        if (connection === 'open') {
            if (qrMsgId) await bot.deleteMessage(chatId, qrMsgId).catch(() => {});
            qrMsgId = null;
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG**\nMode Ninja Stealth Aktif.");
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) initWA(chatId, method, phoneNumber, msgToEdit);
        }
    });
}

// --- COMMANDS ---
bot.onText(/\/start/, (msg) => {
    const rep = getReport();
    bot.sendMessage(msg.chat.id, `**NINJA BLAST ENGINE**\n\n📊 **REPORT HARI INI:** ${rep.total}\n\n/login - Hubungkan WA\n/filter - Cek Nomor Aktif\n/jalan - Blast (No Delay)\n/restart - Hapus Sesi`, { parse_mode: 'Markdown' });
});

bot.onText(/\/login/, (msg) => {
    const opts = { reply_markup: { inline_keyboard: [[{ text: "📸 QR Scan", callback_data: 'l_qr' }], [{ text: "🔑 Pairing Code", callback_data: 'l_cd' }]] } };
    bot.sendMessage(msg.chat.id, "Pilih metode login:", opts);
});

bot.on('callback_query', (q) => {
    const chatId = q.message.chat.id;
    if (q.data === 'l_qr') initWA(chatId, 'QR', null, q.message.message_id);
});

// --- FITUR FILTER (Cek WA Aktif) ---
bot.onText(/\/filter/, async (msg) => {
    if (!sock) return bot.sendMessage(msg.chat.id, "🔴 Login dulu!");
    bot.sendMessage(msg.chat.id, "🔍 **Memulai Filtering Nomor...**");
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        let aktif = [];
        for (let i = 0; i < data.length; i++) {
            const num = data[i].trim().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const [result] = await sock.onWhatsApp(num);
            if (result && result.exists) aktif.push(data[i].trim());
        }
        fs.writeFileSync('nomor_aktif.txt', aktif.join('\n'));
        bot.sendMessage(msg.chat.id, `✅ **FILTER SELESAI**\nTotal Aktif: ${aktif.length}\nData disimpan ke: nomor_aktif.txt`);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Gagal filter."); }
});

// --- ENGINE BLAST (KECEPATAN MAKSIMAL - 0 DETIK) ---
bot.onText(/\/jalan/, async (msg) => {
    if (isProcessing || !sock) return bot.sendMessage(msg.chat.id, "🔴 Belum login!");
    isProcessing = true;
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const s1 = fs.readFileSync('script1.txt', 'utf-8');
        const s2 = fs.readFileSync('script2.txt', 'utf-8');
        
        bot.sendMessage(msg.chat.id, `🌪️ **STORM STARTED!** (Super Fast Mode)`);

        // Menggunakan Promise.all untuk mengirim secara simultan (Gila-gilaan)
        const sendPromises = data.map(async (line, i) => {
            const parts = line.trim().split(/\s+/);
            const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const pesan = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, parts[0]);
