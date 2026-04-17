const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

// --- DATABASE SEDERHANA (DATABASE.JSON) ---
const DB_FILE = './database.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ total_keseluruhan: 0, harian: {} }));
}

function updateStats(count) {
    let data = JSON.parse(fs.readFileSync(DB_FILE));
    let today = new Date().toLocaleDateString('id-ID');
    
    data.total_keseluruhan += count;
    if (!data.harian[today]) data.harian[today] = 0;
    data.harian[today] += count;
    
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return { total: data.total_keseluruhan, today: data.harian[today] };
}

// --- SERVER AGAR RAILWAY TETAP HIDUP ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Ninja Storm Engine Active 24/7'));
app.listen(PORT, '0.0.0.0', () => console.log(`Server aktif di port ${PORT}`));

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const ADMIN_ID = 'YOUR_TELEGRAM_ID_HERE'; // Ganti dengan ID Telegram Anda untuk laporan otomatis
const bot = new TelegramBot(TOKEN, { polling: true });

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪', menuSent: false, isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊', menuSent: false, isInitializing: false }
};

async function initWA(chatId, id) {
    if (engines[id].isInitializing) return;
    engines[id].isInitializing = true;

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ninja Storm", "Chrome", "1.0.0"],
    });

    const sock = engines[id].sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;
        const time = new Date().toLocaleString('id-ID');

        if (qr && chatId) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 4 });
                const sent = await bot.sendPhoto(chatId, buffer, { caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n🕒 ${time}` });
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                engines[id].lastQrMsgId = sent.message_id;
            } catch (e) {}
        }

        if (connection === 'open') {
            engines[id].isInitializing = false;
            bot.sendMessage(chatId || ADMIN_ID, `✅ **ENGINE ${id} CONNECTED**\n🕒 ${time}`);
        }

        if (connection === 'close') {
            engines[id].isInitializing = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason = lastDisconnect?.error?.output?.payload?.message || "Unknown";
            
            // LAPORAN JIKA WA KELUAR / TERBLOKIR
            if (statusCode === DisconnectReason.loggedOut) {
                bot.sendMessage(chatId || ADMIN_ID, `🚫 **LAPORAN: ENGINE ${id} LOGGED OUT/BANNED**\n⚠️ Alasan: ${reason}\n🕒 ${time}\n\nSilahkan login ulang.`);
                fs.rmSync(engines[id].session, { recursive: true, force: true });
            } else {
                bot.sendMessage(chatId || ADMIN_ID, `⚠️ **ENGINE ${id} DISCONNECTED**\nReconnecting...\n🕒 ${time}`);
                initWA(chatId, id);
            }
        }
    });
}

// AUTO-RECONNECT
Object.keys(engines).forEach(id => {
    if (fs.existsSync(engines[id].session)) initWA(null, id);
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        const engine = engines[id];
        if (!engine.sock) return;

        try {
            const numbers = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const script = fs.readFileSync(engine.script, 'utf-8');
            const startTime = new Date().toLocaleString('id-ID');
            
            bot.sendMessage(chatId, `🚀 **FIRE IN THE HOLE!**\nMeledakkan ${numbers.length} pesan...`);

            await Promise.all(numbers.map(line => {
                const jid = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                return engine.sock.sendMessage(jid, { text: script }).catch(() => {});
            }));

            // UPDATE REKAPAN
            const stats = updateStats(numbers.length);
            const endTime = new Date().toLocaleString('id-ID');

            bot.sendMessage(chatId, `✅ **BLAST ENGINE ${id} SELESAI**\n\n📊 **REKAPAN BLAST:**\n📅 Tanggal: ${new Date().toLocaleDateString('id-ID')}\n⏱️ Selesai: ${endTime}\n🚀 Terkirim: ${numbers.length}\n\n📈 **TOTAL AKUMULASI:**\n Hari ini: ${stats.today}\n Keseluruhan: ${stats.total}`);
        } catch (e) { bot.sendMessage(chatId, "❌ Gagal Blast. Cek file nomor!"); }
    }
    
    if (data === 'restart_bot') {
        await bot.sendMessage(chatId, "♻️ **RESTARTING SYSTEM...**");
        setTimeout(() => process.exit(0), 1000); // Exit dengan code 0 agar Railway me-restart bersih
    }
});

// Perintah cek rekapan manual
bot.onText(/\/rekap/, (msg) => {
    const data = JSON.parse(fs.readFileSync(DB_FILE));
    const today = new Date().toLocaleDateString('id-ID');
    bot.sendMessage(msg.chat.id, `📊 **REKAPAN TOTAL BLAST**\n\n📅 Hari ini (${today}): ${data.harian[today] || 0}\n🌍 Total Keseluruhan: ${data.total_keseluruhan}`);
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "🌪️ **NINJA STORM ENGINE**\n/rekap - Cek Total Blast\n/restart - Restart Bot"));
