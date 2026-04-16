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

async function initWA(chatId, method, phoneNumber = null, msgToEdit = null) {
    if (!fs.existsSync('./session_data')) fs.mkdirSync('./session_data');
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Mac OS", "Chrome", "121.0.6167.184"],
        defaultQueryTimeoutMs: 0,
        printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(qr, { 
                scale: 12, 
                margin: 3,
                color: { dark: '#000000', light: '#ffffff' }
            });
            
            const timeNow = new Date().toLocaleTimeString('id-ID', { 
                timeZone: 'Asia/Jakarta',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });

            if (lastQrMsgId) {
                await bot.deleteMessage(chatId, lastQrMsgId).catch(() => {});
            }
            
            const sent = await bot.sendPhoto(chatId, buffer, { 
                caption: `📸 **SCAN QR SEKARANG**\n\n🕒 **Update:** ${timeNow} WIB\n⚠️ *Pastikan koneksi internet stabil*`,
                parse_mode: 'Markdown'
            });
            lastQrMsgId = sent.message_id;
        }

        if (connection === 'open') {
            if (lastQrMsgId) await bot.deleteMessage(chatId, lastQrMsgId).catch(() => {});
            lastQrMsgId = null;
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG - /filter cek dulu ya**");
        }
        
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut || reason === 401) {
                bot.sendMessage(chatId, "🚫 **NOTIFIKASI: NOMOR WA ANDA TERBLOKIR / LOGOUT!**\nSesi otomatis dihapus. Silakan /restart ulang agar cache bersih & lancar pada saat blast.");
                if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
                sock = null;
            } else {
                initWA(chatId, method, phoneNumber, msgToEdit);
            }
        }
    });

    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
                const txt = `🔑 **KODE PAIRING ANDA:**\n\n\`${code}\`\n\nMasukkan di WhatsApp Anda.`;
                if (msgToEdit) {
                    await bot.editMessageText(txt, { chat_id: chatId, message_id: msgToEdit, parse_mode: 'Markdown' }).catch(() => {
                        bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
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
    const txt = `📊 **REPORT BLAST HAR
