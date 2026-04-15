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
let userState = {};
let isProcessing = false;

// Menu Utama Keyboard
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

    // Tutup socket lama jika ada untuk menghindari tabrakan sesi
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

        // Logika QR (Update di tempat menggunakan Edit Media)
        if (qr && method === 'QR' && msgId) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 8 });
                await bot.editMessageMedia({
                    type: 'photo',
                    media: buffer,
                    caption: `📸 **SCAN QR SEKARANG**\nUpdate: ${new Date().toLocaleTimeString()}\n\n_Gunakan tombol di bawah untuk batal._`,
                    parse_mode: 'Markdown'
                }, {
                    chat_id: chatId,
                    message_id: msgId,
                    reply_markup: {
                        inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu_del' }]]
                    }
                });
            } catch (err) { console.log("QR Update Error"); }
        }

        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG!**\nMode Ninja Stealth Aktif.");
            if (msgId) bot.deleteMessage(chatId, msgId).catch(() => {});
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect && method !== 'STOP') initWA(chatId, method, phoneNumber, msgId);
        }
    });

    // Logika Pairing (Update di tempat menggunakan Edit Text)
    if (method === 'CODE' && phoneNumber && msgId) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                await bot.editMessageText(`🔑 **KODE PAIRING ANDA:**\n\n\`${code}\`\n\nMasukkan di WhatsApp HP Anda.`, {
                    chat_id: chatId,
                    message_id: msgId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu' }]]
                    }
                });
            } catch (e) {
                bot.editMessageText("❌ Gagal generate kode. Silakan /restart dan coba lagi.", { chat_id: chatId, message_id: msgId });
            }
        }, 5000);
    }
}

// --- HANDLERS ---
bot.onText(/\/start/, (msg) => {
    const rep = getReport();
    bot.sendMessage(msg.chat.id, `🌪️ **NINJA BLAST ENGINE**\n\n📊 Total Blast: ${rep.total}\n\n/login - Hubungkan WA\n/jalan - Mulai Blast\n/restart - Reset Sesi`, { parse_mode: 'Markdown' });
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "Pilih metode login:", loginMenu);
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === 'l_qr') {
        // Hapus menu teks, ganti ke foto placeholder agar bisa di-editMedia
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        const placeholder = await bot.sendPhoto(chatId, 'https://placehold.jp/40/333333/ffffff/400x400.png?text=Generating%20QR...', {
            caption: "⏳ Sedang menyiapkan QR...",
            reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu_del' }]] }
        });
        initWA(chatId, 'QR', null, placeholder.message_id);
    }

    if (q.data === 'l_cd') {
        userState[chatId] = { step: 'WAIT_NUM', msgId: msgId };
        bot.editMessageText("📞 **Masukkan Nomor WA Anda:**\nContoh: 628xxx", {
            chat_id: chatId,
            message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: 'back_to_menu' }]] }
        });
    }

    if (q.data === 'back_to_menu') {
        if (sock) { sock.end(); sock = null; }
        bot.editMessageText("Pilih metode login:", { chat_id: chatId, message_id: msgId, reply_markup: loginMenu.reply_markup });
    }

    if (q.data === 'back_to_menu_del') {
        if (sock) { sock.end(); sock = null; }
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        bot.sendMessage(chatId, "Pilih metode login:", loginMenu);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId]?.step === 'WAIT_NUM' && msg.text && !msg.text.startsWith('/')) {
        const num = msg.text.replace(/[^0-9]/g, '');
        const targetMsgId = userState[chatId].msgId;
        
        bot.deleteMessage(chatId, msg.message_id).catch(() => {}); 
        bot.editMessageText("⏳ **Meminta kode pairing...**", { chat_id: chatId, message_id: targetMsgId });
        
        initWA(chatId, 'CODE', num, targetMsgId);
        delete userState[chatId];
    }
});

bot.onText(/\/jalan/, async (msg) => {
    if (isProcessing || !sock) return bot.sendMessage(msg.chat.id, "🔴 Belum login!");
    isProcessing = true;
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const s1 = fs.readFileSync('script1.txt', 'utf-8');
        const s2 = fs.readFileSync('script2.txt', 'utf-8');
        bot.sendMessage(msg.chat.id, `🌪️ **STORM STARTED!**\nTarget: ${data.length} nomor.`);

        for (let i = 0; i < data.length; i++) {
            const parts = data[i].trim().split(/\s+/);
            const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const pesan = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, parts[0]);
            await sock.sendMessage(jid, { text: pesan });
            await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
        }
        updateReport(data.length);
        bot.sendMessage(
