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

// --- SERVER (Agar Railway tetap hidup) ---
const app = express();
app.get('/', (req, res) => res.send('NINJA STORM ENGINE ACTIVE'));
app.listen(process.env.PORT || 3000);

let sock;
let isProcessing = false;
let userState = {};
let qrMsgId = null; 

async function initWA(chatId, method, phoneNumber = null, msgToEdit = null) {
    // Pastikan folder session ada
    if (!fs.existsSync('./session_data')) fs.mkdirSync('./session_data');
    
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(qr, { scale: 8 });
            if (qrMsgId) await bot.deleteMessage(chatId, qrMsgId).catch(() => {});
            if (msgToEdit && !qrMsgId) await bot.deleteMessage(chatId, msgToEdit).catch(() => {});
            
            const sentPhoto = await bot.sendPhoto(chatId, buffer, { 
                caption: `📸 **SCAN QR SEKARANG**\nUpdate: ${new Date().toLocaleTimeString()}\n(Otomatis berganti di sini)` 
            });
            qrMsgId = sentPhoto.message_id;
        }

        if (connection === 'open') {
            if (qrMsgId) await bot.deleteMessage(chatId, qrMsgId).catch(() => {});
            qrMsgId = null;
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG**\nMode Ninja Stealth Aktif.");
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                initWA(chatId, method, phoneNumber, msgToEdit);
            }
        }
    });

    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
                let code = await sock.requestPairingCode(cleanNumber);
                const text = `🔑 **KODE PAIRING ANDA:**\n\n\`${code}\`\n\nMasukkan kode ini di WhatsApp HP Anda.`;
                
                if (msgToEdit) {
                    await bot.editMessageText(text, { chat_id: chatId, message_id: msgToEdit, parse_mode: 'Markdown' }).catch(() => {});
                } else {
                    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
                }
            } catch (err) {
                bot.sendMessage(chatId, "❌ **Gagal generate kode.**");
            }
        }, 5000); 
    }
}

// --- AUTO LOAD SESSION ON START ---
// Jika sudah ada sesi, bot akan otomatis online saat Railway start/deploy
if (fs.existsSync('./session_data/creds.json')) {
    console.log("Sesi ditemukan, mencoba menyambung otomatis...");
    initWA(null, 'AUTO'); 
}

// --- COMMANDS ---
bot.onText(/\/start/, (msg) => {
    const rep = getReport();
    bot.sendMessage(msg.chat.id, `Selamat datang di **NINJA BLAST ENGINE**\n\n📊 **REPORT HARI INI:** ${rep.total}\n/login - Hubungkan WA\n/jalan - Blast\n/restart - Hapus Sesi`, { parse_mode: 'Markdown' });
});

bot.onText(/\/login/, (msg) => {
    const opts = { reply_markup: { inline_keyboard: [[{ text: "📸 QR Scan", callback_data: 'l_qr' }], [{ text: "🔑 Pairing Code", callback_data: 'l_cd' }]] } };
    bot.sendMessage(msg.chat.id, "Pilih metode login:", opts);
});

bot.on('callback_query', (q) => {
    const chatId = q.message.chat.id;
    if (q.data === 'l_qr') initWA(chatId, 'QR', null, q.message.message_id);
    if (q.data === 'l_cd') {
        userState[chatId] = { step: 'WAIT_NUM', msgId: q.message.message_id };
        bot.editMessageText("📞 **Masukkan Nomor WA:**\n(Contoh: 62812xxx)", { chat_id: chatId, message_id: q.message.message_id });
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId]?.step === 'WAIT_NUM' && msg.text && !msg.text.startsWith('/')) {
        const num = msg.text.replace(/[^0-9]/g, '');
        const targetMsgId = userState[chatId].msgId;
        bot.deleteMessage(chatId, msg.message_id).catch(() => {}); 
        bot.editMessageText("⏳ **Menggenerate kode...**", { chat_id: chatId, message_id: targetMsgId });
        initWA(chatId, 'CODE', num, targetMsgId);
        delete userState[chatId];
    }
});

// --- ENGINE BLAST ---
bot.onText(/\/jalan/, async (msg) => {
    if (isProcessing || !sock) return bot.sendMessage(msg.chat.id, "🔴 Belum login!");
    isProcessing = true;
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const s1 = fs.readFileSync('script1.txt', 'utf-8');
        const s2 = fs.readFileSync('script2.txt', 'utf-8');
        
        bot.sendMessage(msg.chat.id, `🌪️ **STORM STARTED!**`);

        for (let i = 0; i < data.length; i++) {
            const parts = data[i].trim().split(/\s+/);
            const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const pesan = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, parts[0]);

            try {
                await sock.sendMessage(jid, { text: pesan });
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
            } catch (e) {}
        }

        updateReport(data.length);
        bot.sendMessage(msg.chat.id, `🚀 **BOOM! MELEDAK.**`);
        isProcessing = false;
    } catch (e) {
        bot.sendMessage(msg.chat.id, "❌ Error file.");
        isProcessing = false;
    }
});

// --- RESTART LOGIC FOR RAILWAY (24 JAM) ---
bot.onText(/\/restart/, async (msg) => {
    bot.sendMessage(msg.chat.id, `♻️ **MEMBERSIHKAN SESI...**\nAplikasi tetap berjalan, silakan /login kembali.`);
    
    if (sock) {
        sock.logout(); // Logout secara resmi dari WA
        sock.end();
    }

    // Hapus folder sesi tanpa mematikan proses
    if (fs.existsSync('./session_data')) {
        fs.rmSync('./session_data', { recursive: true, force: true });
    }

    // Inisialisasi ulang variabel agar bersih
    sock = null;
    qrMsgId = null;
});
