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
let currentMethod = null;
let userState = {};
let isProcessing = false;

// --- ENGINE CORE ---

async function initWA(chatId, method, phoneNumber = null, msgId = null) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    currentMethod = method;

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false,
        // Optimasi untuk pengiriman massal
        defaultQueryTimeoutMs: undefined, 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;
        if (qr && currentMethod === 'QR' && msgId) {
            const buffer = await QRCode.toBuffer(qr, { scale: 8 });
            await bot.editMessageMedia({
                type: 'photo',
                media: { source: buffer, filename: 'qr.png' },
                caption: `📸 **SCAN SEKARANG**`
            }, { chat_id: chatId, message_id: msgId }).catch(() => {});
        }
        if (connection === 'open') {
            bot.sendMessage(chatId || msg.chat.id, "✅ **WA TERHUBUNG!**\n\nGunakan /jalan untuk blast atau /filter untuk cek nomor.");
        }
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                initWA(chatId, method, phoneNumber, msgId);
            }
        }
    });
}

// --- FEATURE: FILTER NOMOR ---
bot.onText(/\/filter/, async (msg) => {
    if (!sock) return bot.sendMessage(msg.chat.id, "❌ Hubungkan WA dulu via /login");
    bot.sendMessage(msg.chat.id, "🔍 **Memulai Filtering Nomor...**");

    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        let aktif = [];
        
        for (let line of data) {
            const cleanNum = line.replace(/[^0-9]/g, '');
            const [result] = await sock.onWhatsApp(cleanNum);
            if (result && result.exists) {
                aktif.push(line);
            }
        }

        fs.writeFileSync('nomor_filter.txt', aktif.join('\n'));
        bot.sendMessage(msg.chat.id, `✅ **Filter Selesai!**\nTotal Aktif: ${aktif.length}\nData disimpan di: nomor_filter.txt`);
    } catch (e) {
        bot.sendMessage(msg.chat.id, "❌ Pastikan file 'nomor.txt' tersedia.");
    }
});

// --- FEATURE: ULTRA FAST BLAST (0s Delay) ---
bot.onText(/\/jalan/, async (msg) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ Proses blast masih berjalan!");
    if (!sock) return bot.sendMessage(msg.chat.id, "❌ Login dulu bos!");

    isProcessing = true;
    bot.sendMessage(msg.chat.id, "🌪️ **STORM BLAST STARTED!**");

    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const s1 = fs.readFileSync('script1.txt', 'utf-8');
        const s2 = fs.readFileSync('script2.txt', 'utf-8');

        // Menggunakan Promise.all untuk eksekusi simultan tanpa jeda (Parallel Blast)
        const blastPromises = data.map(async (line, index) => {
            const parts = line.trim().split(/\s+/);
            const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            const pesan = (index % 2 === 0 ? s1 : s2).replace(/{id}/g, parts[0]);

            return sock.sendMessage(jid, { text: pesan }).catch(err => {
                console.log(`Gagal kirim ke ${jid}`);
            });
        });

        await Promise.all(blastPromises); 

        updateReport(data.length);
        bot.sendMessage(msg.chat.id, `🚀 **BOOM! MELEDAK.**\n${data.length} pesan terkirim tanpa jeda.`);
    } catch (e) {
        bot.sendMessage(msg.chat.id, "❌ Error: Cek script1.txt, script2.txt, dan nomor.txt");
    } finally {
        isProcessing = false;
    }
});

// --- LOGIN & RESTART (Sama seperti sebelumnya) ---
bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "Pilih metode login:", {
        reply_markup: { inline_keyboard: [[{ text: "📸 QR Scan", callback_data: 'l_qr' }], [{ text: "🔑 Pairing Code", callback_data: 'l_cd' }]] }
    });
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    if (q.data === 'l_qr') {
        const p = await bot.sendPhoto(chatId, 'https://placehold.jp/400x400.png?text=Generating%20QR...');
        initWA(chatId, 'QR', null, p.message_id);
    }
});
