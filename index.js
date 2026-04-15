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
let qrMsgId = null;

async function initWA(chatId, method) {
    if (!fs.existsSync('./session_data')) fs.mkdirSync('./session_data');
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        markOnlineOnConnect: true,
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
            bot.sendMessage(chatId || "Auto", "✅ **WA TERHUBUNG**\nEngine siap meledak!");
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) initWA(chatId, 'AUTO');
        }
    });
}

// Jalankan otomatis jika sesi ada
if (fs.existsSync('./session_data/creds.json')) initWA(null, 'AUTO');

// --- COMMANDS ---

// MENU START DENGAN REPORT
bot.onText(/\/start/, (msg) => {
    const rep = getReport();
    const menu = `🌪️ **NINJA BLAST ENGINE**\n\n` +
                 `📅 **HARI INI:** ${rep.date}\n` +
                 `📊 **TOTAL BLAST:** ${rep.total}\n\n` +
                 `/login - Hubungkan WhatsApp\n` +
                 `/filter - Cek Nomor Aktif\n` +
                 `/jalan - Blast Massal (Speed 0s)\n` +
                 `/restart - Reset Sesi & Engine`;
    bot.sendMessage(msg.chat.id, menu, { parse_mode: 'Markdown' });
});

bot.onText(/\/login/, (msg) => {
    initWA(msg.chat.id, 'QR');
});

// FITUR FILTER
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
        bot.sendMessage(msg.chat.id, `✅ **Filter Selesai!**\nAktif: ${aktif.length}\nData: nomor_aktif.txt`);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Gagal filter."); }
});

// BLAST SPEED DEWA (0 DETIK)
bot.onText(/\/jalan/, async (msg) => {
    if (isProcessing || !sock) return bot.sendMessage(msg.chat.id, "🔴 Belum siap!");
    isProcessing = true;
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const s1 = fs.readFileSync('script1.txt', 'utf-8');
        const s2 = fs.readFileSync('script2.txt', 'utf-8');
        
        bot.sendMessage(msg.chat.id, `🌪️ **STORM STARTED!**\nNembak ${data.length} chat sekaligus...`);

        // Kirim semua sekaligus tanpa jeda
        await Promise.all(data.map(async (line, i) => {
            const parts = line.trim().split(/\s+/);
            const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const pesan = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, parts[0]);
            return sock.sendMessage(jid, { text: pesan }).catch(() => {});
        }));

        updateReport(data.length);
        bot.sendMessage(msg.chat.id, `🚀 **BOOM! MELEDAK.**\n${data.length} pesan masuk.`);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Error file."); }
    isProcessing = false;
});

// RESTART ENGINE
bot.onText(/\/restart/, async (msg) => {
    bot.sendMessage(msg.chat.id, "♻️ **RESETTING ENGINE...**\nSesi dihapus, silakan /login kembali.");
    if (sock) { sock.logout(); sock.end(); }
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    sock = null;
    qrMsgId = null;
});
