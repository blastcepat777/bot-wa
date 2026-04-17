const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

// --- DATABASE REKAPAN (ANTI HILANG) ---
const DB_FILE = './rekapan.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ total_keseluruhan: 0, harian: {} }));
}

function simpanRekapan(jumlah) {
    let data = JSON.parse(fs.readFileSync(DB_FILE));
    let hariIni = new Date().toLocaleDateString('id-ID');
    
    data.total_keseluruhan += jumlah;
    if (!data.harian[hariIni]) data.harian[hariIni] = 0;
    data.harian[hariIni] += jumlah;
    
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return { total: data.total_keseluruhan, today: data.harian[hariIni] };
}

// --- FIX RAILWAY RESTART (KEEP-ALIVE) ---
const app = express();
app.get('/', (req, res) => res.send('NINJA STORM ENGINE ACTIVE 🚀'));
app.listen(process.env.PORT || 3000, '0.0.0.0');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

const getMenuEngine = (id) => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
            [{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }],
            [{ text: "📊 REKAPAN", callback_data: 'cek_rekap' }],
            [{ text: "♻️ RESTART", callback_data: 'restart_bot' }],
            [{ text: "❌ KELUAR", callback_data: 'batal' }]
        ]
    }
});

async function initWA(chatId, id) {
    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ninja Storm", "Chrome", "1.0.0"]
    });

    const sock = engines[id].sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;
        const waktu = new Date().toLocaleString('id-ID');

        if (qr && chatId) {
            const buffer = await QRCode.toBuffer(qr, { scale: 4 });
            const sent = await bot.sendPhoto(chatId, buffer, { caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n🕒 ${waktu}` });
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            engines[id].lastQrMsgId = sent.message_id;
        }

        if (connection === 'open') {
            if (chatId) {
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE**\n🕒 ${waktu}`, getMenuEngine(id));
            }
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            
            // LAPORAN WA KELUAR ATAU DIBATASI (BANNED)
            if (reason === DisconnectReason.loggedOut) {
                bot.sendMessage(chatId || '8657782534', `🚫 **LAPORAN: WA ${id} KELUAR / TERBLOKIR**\n⚠️ Status: Dibatasi/Logged Out\n🕒 ${waktu}`);
                fs.rmSync(engines[id].session, { recursive: true, force: true });
            } else {
                initWA(chatId, id);
            }
        }
    });
}

// AUTO CONNECT JIKA ADA SESSION
Object.keys(engines).forEach(id => {
    if (fs.existsSync(engines[id].session)) initWA(null, id);
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data === 'restart_bot') {
        await bot.sendMessage(chatId, "♻️ **RESTARTING... TOMBOL AKAN MUNCUL DALAM 5 DETIK**");
        setTimeout(() => process.exit(0), 1000); 
        return;
    }

    if (data === 'cek_rekap') {
        const d = JSON.parse(fs.readFileSync(DB_FILE));
        const hariIni = new Date().toLocaleDateString('id-ID');
        bot.sendMessage(chatId, `📊 **REKAPAN BLAST AKURAT**\n\n📅 Hari Ini: ${d.harian[hariIni] || 0}\n🌍 Total Keseluruhan: ${d.total_keseluruhan}\n🕒 Update: ${new Date().toLocaleTimeString('id-ID')}`);
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, "Login dulu Bos!");
        bot.sendMessage(chatId, `${engines[id].color} **FILTERING...**`);
        const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
        let aktif = [];
        for (const line of lines) {
            const num = line.replace(/[^0-9]/g, '');
            const [res] = await engines[id].sock.onWhatsApp(num).catch(() => [null]);
            if (res?.exists) aktif.push(line.trim());
        }
        fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
        bot.sendMessage(chatId, `✅ **FILTER ${id} SELESAI**\nAktif: ${aktif.length}`, getMenuEngine(id));
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        try {
            const numbers = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const script = fs.readFileSync(engines[id].script, 'utf-8');
            const jamMulai = new Date().toLocaleTimeString('id-ID');

            bot.sendMessage(chatId, `🚀 **MELEDAKKAN ${numbers.length} PESAN...**`);

            await Promise.all(numbers.map(line => {
                const jid = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                return engines[id].sock.sendMessage(jid, { text: script }).catch(() => {});
            }));

            const stats = simpanRekapan(numbers.length);
            bot.sendMessage(chatId, `✅ **BLAST ENGINE ${id} SELESAI!**\n\n⏱️ Jam: ${jamMulai}\n🚀 Terkirim: ${numbers.length}\n📊 Total Hari Ini: ${stats.today}`, getMenuEngine(id));
        } catch (e) { bot.sendMessage(chatId, "Filter dulu baru Blast!"); }
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "🌪️ **NINJA STORM ENGINE**", { 
    reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]] } 
}));

bot.on('message', (msg) => {
    if (msg.text === '/restart') process.exit(0);
});
