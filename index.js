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

        // HANDLE QR (Delete & Resend agar tidak spam & update di tempat yang sama)
        if (qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(qr, { scale: 12 });
            const captionText = `📸 **SCAN QR SEKARANG**\n🕒 Update: ${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n⚠️ *Pastikan koneksi internet stabil*`;
            
            if (lastQrMsgId) {
                await bot.deleteMessage(chatId, lastQrMsgId).catch(() => {});
            }
            const sent = await bot.sendPhoto(chatId, buffer, { caption: captionText, parse_mode: 'Markdown' });
            lastQrMsgId = sent.message_id;
        }

        if (connection === 'open') {
            isLoggedOutNotified = false; 
            if (lastQrMsgId) {
                await bot.deleteMessage(chatId, lastQrMsgId).catch(() => {});
                lastQrMsgId = null;
            }
            bot.sendMessage(chatId || "System", "✅ **WA TERHUBUNG - /filter cek dulu ya**");
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                if (!isLoggedOutNotified) {
                    bot.sendMessage(chatId || "System", "🚫 **NOTIFIKASI: NOMOR WA ANDA TERBLOKIR / LOGOUT!**\nSesi otomatis dihapus. Silakan /restart ulang agar cache bersih & lancar pada saat blast.");
                    isLoggedOutNotified = true;
                }
                if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
                sock = null;
                lastQrMsgId = null;
            } else {
                initWA(chatId, method, phoneNumber);
            }
        }
    });

    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
                const txt = `🔑 **KODE PAIRING ANDA:**\n\n\`${code}\`\n\nMasukkan di WhatsApp Anda.`;
                
                if (lastQrMsgId) {
                    await bot.deleteMessage(chatId, lastQrMsgId).catch(() => {});
                }
                const sent = await bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
                lastQrMsgId = sent.message_id;
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
                `*Data akan reset otomatis setiap hari baru!*\n\n` +
                `🔄 /restart dulu ya biar blast lebih lancar`;
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
        initWA(chatId, 'CODE', msg.text);
        delete userState[chatId];
    }
});

bot.onText(/\/filter/, async (msg) => {
    if (!sock) return bot.sendMessage(msg.chat.id, "🔴 Login dulu!");
    bot.sendMessage(msg.chat.id, "🔍 **SEBENTAR YA FILTER BENTAR DULU...**");
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        let aktif = [];
        for (let line of data) {
            const num = line.trim().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const [result] = await sock.onWhatsApp(num);
            if (result && result.exists) aktif.push(line.trim());
        }
        fs.writeFileSync('nomor_aktif.txt', aktif.join('\n'));
        bot.sendMessage(msg.chat.id, `✅ Selesai. Aktif: ${aktif.length}`);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Gagal."); }
});

bot.onText(/\/jalan/, async (msg) => {
    if (isProcessing || !sock) return bot.sendMessage(msg.chat.id, "🔴 Belum login!");
    isProcessing = true;
    try {
        const targetFile = fs.existsSync('nomor_aktif.txt') ? 'nomor_aktif.txt' : 'nomor.txt';
        const data = fs.readFileSync(targetFile, 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const s1 = fs.readFileSync('script1.txt', 'utf-8');
        const s2 = fs.readFileSync('script2.txt', 'utf-8');
        bot.sendMessage(msg.chat.id, `🌪️ **STORM STARTED! (${data.length} Pesan)**`);
        
        const allBlast = data.map((line, i) => {
            const parts = line.trim().split(/\s+/);
            const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const pesan = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, parts[0]);
            
            // UPDATE: Nambah report setiap kali pesan berhasil terkirim (Real-time)
            return sock.sendMessage(jid, { text: pesan })
                .then(() => updateReport(1))
                .catch(() => {});
        });

        await Promise.all(allBlast);
        bot.sendMessage(msg.chat.id, `✅ **BLAST SUDAH SELESAI !!**`);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Error File."); }
    isProcessing = false;
});

bot.onText(/\/restart/, async (msg) => {
    bot.sendMessage(msg.chat.id, "♻️ **SYSTEM RESTARTING...  /login untuk mulai blast**");
    if (sock) { try { sock.logout(); sock.end(); } catch(e){} }
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    sock = null;
    lastQrMsgId = null;
    isLoggedOutNotified = false;
});
