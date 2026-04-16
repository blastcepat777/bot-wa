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
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
    if (!fs.existsSync(REPORT_FILE)) return { date: today, total: 0 };
    try {
        let data = JSON.parse(fs.readFileSync(REPORT_FILE));
        if (data.date === today) return data;
        return { date: today, total: 0 };
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
let lastQrMsgId = null; 
let isLoggedOutNotified = false; 
let isConnected = false; // Guard agar tidak spam "WA TERHUBUNG"

async function initWA(chatId, method, phoneNumber = null) {
    if (!fs.existsSync('./session_data')) fs.mkdirSync('./session_data');
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        defaultQueryTimeoutMs: 0, 
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        // --- HANDLE QR (ANTI SPAM & AUTO UPDATE) ---
        if (qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(qr, { scale: 12 });
            const captionText = `📸 **SCAN QR SEKARANG**\n🕒 Update: ${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n⚠️ *Gunakan versi WA terbaru*`;
            
            if (lastQrMsgId) {
                // Gunakan editMessageMedia supaya tidak spam gambar baru
                await bot.editMessageMedia({
                    type: 'photo',
                    media: { source: buffer },
                    caption: captionText,
                    parse_mode: 'Markdown'
                }, { chat_id: chatId, message_id: lastQrMsgId }).catch(async () => {
                    // Jika gagal edit (misal pesan dihapus user), kirim baru
                    const sent = await bot.sendPhoto(chatId, buffer, { caption: captionText, parse_mode: 'Markdown' });
                    lastQrMsgId = sent.message_id;
                });
            } else {
                const sent = await bot.sendPhoto(chatId, buffer, { caption: captionText, parse_mode: 'Markdown' });
                lastQrMsgId = sent.message_id;
            }
        }

        // --- HUBUNGAN TERBUKA ---
        if (connection === 'open') {
            isLoggedOutNotified = false; 
            if (lastQrMsgId) {
                await bot.deleteMessage(chatId, lastQrMsgId).catch(() => {});
                lastQrMsgId = null;
            }
            
            if (!isConnected) { // Kirim notif terhubung hanya sekali
                bot.sendMessage(chatId || "System", "✅ **WA TERHUBUNG - /filter cek dulu ya**");
                isConnected = true;
            }
        }

        // --- HUBUNGAN TERPUTUS ---
        if (connection === 'close') {
            isConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                if (!isLoggedOutNotified) {
                    bot.sendMessage(chatId || "System", "🚫 **WA TERBLOKIR / LOGOUT!**\nSesi dihapus. Klik /restart lalu /login lagi.");
                    isLoggedOutNotified = true;
                }
                if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
                sock = null;
                lastQrMsgId = null;
            } else {
                // Reconnect otomatis tanpa spam
                initWA(chatId, method, phoneNumber);
            }
        }
    });

    // --- PAIRING CODE (ANTI SPAM) ---
    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
                const txt = `🔑 **KODE PAIRING ANDA:**\n\n\`${code}\`\n\nMasukkan di WhatsApp Anda.`;
                
                if (lastQrMsgId) {
                    await bot.editMessageText(txt, { chat_id: chatId, message_id: lastQrMsgId, parse_mode: 'Markdown' }).catch(async () => {
                        const sent = await bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
                        lastQrMsgId = sent.message_id;
                    });
                } else {
                    const sent = await bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
                    lastQrMsgId = sent.message_id;
                }
            } catch (e) { bot.sendMessage(chatId, "❌ Gagal pairing."); }
        }, 3000);
    }
}

// --- COMMANDS ---

bot.onText(/\/start/, (msg) => {
    const menu = `🌪️ **NINJA BLAST ENGINE**\n\n` +
                 `/login - Hubungkan WA (QR/Pairing)\n` +
                 `/filter - Cek Nomor Aktif\n` +
                 `/jalan - Blast Massal (Speed 0s)\n` +
                 `/report - Statistik Blast Hari Ini\n` +
                 `/restart - Reset Sesi & Engine`;
    bot.sendMessage(msg.chat.id, menu, { parse_mode: 'Markdown' });
});

bot.onText(/\/report/, (msg) => {
    const rep = getReport();
    const txt = `📊 **REPORT BLAST HARIAN**\n\n` +
                `📅 **Tanggal:** ${rep.date}\n` +
                `🚀 **Total Terkirim:** ${rep.total} Pesan\n\n` +
                `🔄 /restart jika ingin ganti nomor`;
    bot.sendMessage(msg.chat.id, txt, { parse_mode: 'Markdown' });
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "Pilih metode login:", {
        reply_markup: { inline_keyboard: [[{ text: "📸 QR Scan", callback_data: 'l_qr' }], [{ text: "🔑 Pairing Code", callback_data: 'l_cd' }]] }
    });
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    if (q.data === 'l_qr') { 
        lastQrMsgId = null; 
        initWA(chatId, 'QR'); 
    }
    if (q.data === 'l_cd') {
        userState[chatId] = { step: 'NUM', msgId: q.message.message_id };
        bot.editMessageText("📞 **Masukkan Nomor (628xxx):**", { chat_id: chatId, message_id: q.message.message_id });
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId]?.step === 'NUM' && msg.text && !msg.text.startsWith('/')) {
        lastQrMsgId = userState[chatId].msgId; 
        init
