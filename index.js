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
let lastQrMsgId = null; 

async function initWA(chatId, method, phoneNumber = null, msgToEdit = null) {
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
        const { connection, qr } = u;

        if (qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(qr, { scale: 8 });
            
            // Hapus pesan QR lama jika ada (Teknik Delete & Resend)
            if (lastQrMsgId) {
                await bot.deleteMessage(chatId, lastQrMsgId).catch(() => {});
            }
            
            const sent = await bot.sendPhoto(chatId, buffer, { 
                caption: `📸 **SCAN QR SEKARANG (BARCODE OTOMATIS BERGANTI)**\nUpdate: ${new Date().toLocaleTimeString()}`,
                parse_mode: 'Markdown'
            });
            lastQrMsgId = sent.message_id;
        }

        if (connection === 'open') {
            if (lastQrMsgId) await bot.deleteMessage(chatId, lastQrMsgId).catch(() => {});
            lastQrMsgId = null;
            bot.sendMessage(chatId || "System", "✅ **WA TERHUBUNG - /filter cek dulu ya**");
        }
    });

    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
                const txt = `🔑 **KODE PAIRING ANDA:**\n\n\`${code}\`\n\nMasukkan di WhatsApp Anda.`;
                
                if (msgToEdit) {
                    // Mengedit pesan input nomor menjadi pesan kode pairing
                    await bot.editMessageText(txt, { chat_id: chatId, message_id: msgToEdit, parse_mode: 'Markdown' });
                    lastQrMsgId = msgToEdit;
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
                `*Data akan reset otomatis setiap hari baru! /restart untuk ulang*`;
    bot.sendMessage(msg.chat.id, txt, { parse_mode: 'Markdown' });
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "Pilih metode login:", {
        reply_markup: { inline_keyboard: [[{ text: "📸 QR Scan", callback_data: 'l_qr' }], [{ text: "🔑 Pairing Code", callback_data: 'l_cd' }]] }
    });
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === 'l_qr') { 
        // Hapus menu pilihan agar tidak menumpuk
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        lastQrMsgId = null; 
        initWA(chatId, 'QR'); 
    }
    if (q.data === 'l_cd') {
        userState[chatId] = { step: 'NUM', msgId: msgId };
        bot.editMessageText("📞 **Masukkan Nomor (628xxx):**", { chat_id: chatId, message_id: msgId });
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId]?.step === 'NUM' && msg.text && !msg.text.startsWith('/')) {
        initWA(chatId, 'CODE', msg.text, userState[chatId].msgId);
        delete userState[chatId];
    }
});

bot.onText(/\/filter/, async (msg) => {
    if (!sock) return bot.sendMessage(msg.chat.id, "🔴 Login dulu!");
    bot.sendMessage(msg.chat.id, "🔍 **SEBENTAR YA FILTER BENTAR DULU...**");
    try {
        const data = fs.readFileSync('
