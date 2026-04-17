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
        browser: ["Ubuntu", "Chrome", "20.0.04"],
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
    const txt = `📊 **REPORT BLAST HARIAN**\n\n` +
                `📅 **Tanggal:** ${rep.date}\n` +
                `🚀 **Total Terkirim:** ${rep.total} Pesan \n\n` +
                `🔄 **/restart dulu ya biar blast lebih lancar`;
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
    if (!sock) return bot.sendMessage(msg.chat.id, "OKE SEBENTAR YA!");
    bot.sendMessage(msg.chat.id, "🔍 **FILTERING SEDANG BERJALAN...**");
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        let aktif = [];
        for (let line of data) {
            const num = line.trim().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const [result] = await sock.onWhatsApp(num);
            if (result && result.exists) aktif.push(line.trim());
        }
        fs.writeFileSync('nomor_aktif.txt', aktif.join('\n'));
        bot.sendMessage(msg.chat.id, `✅ Selesai. Aktif: ${aktif.length} /jalan untuk blast`);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Gagal."); }
});

bot.onText(/\/jalan/, async (msg) => {
    if (isProcessing || !sock) return bot.sendMessage(msg.chat.id, "OKE SEBENTAR YA!");
    isProcessing = true;
    try {
        const targetFile = fs.existsSync('nomor_aktif.txt') ? 'nomor_aktif.txt' : 'nomor.txt';
        const data = fs.readFileSync(targetFile, 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const s1 = fs.readFileSync('script1.txt', 'utf-8');
        const s2 = fs.readFileSync('script2.txt', 'utf-8');
        
        bot.sendMessage(msg.chat.id, `🌪️ **BLAST DIMULAI MODE CEPAT! (${data.length} Nomor)**`);
        
        let successCount = 0;
        for (let i = 0; i < data.length; i++) {
            const line = data[i];
            const parts = line.trim().split(/\s+/);
            const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const pesan = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, parts[0]);
            
            try {
                await sock.sendMessage(jid, { text: pesan });
                successCount++;
                updateReport(1); // UPDATE LANGSUNG SETIAP 1 PESAN TERKIRIM
            } catch (err) {
                if (err.toString().includes('401')) break; 
            }
        }

        bot.sendMessage(msg.chat.id, `✅ **BLAST SELESAI!**\nTerkirim sesi ini: ${successCount} nomor.\nCek /report`);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Error File."); }
    isProcessing = false;
});

bot.onText(/\/restart/, async (msg) => {
    bot.sendMessage(msg.chat.id, "♻️ **SYSTEM RESTARTING... /login untuk mulai blast**");
    if (sock) { try { sock.logout(); sock.end(); } catch(e){} }
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    sock = null;
    lastQrMsgId = null;
});
