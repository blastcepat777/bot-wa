const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

// --- DATABASE REKAPAN (WAJIB & AKURAT) ---
const DB_FILE = './database_ninja.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ total: 0, harian: {} }));
}

function catatRekapan(jumlah) {
    let d = JSON.parse(fs.readFileSync(DB_FILE));
    let tgl = new Date().toLocaleDateString('id-ID');
    let jam = new Date().toLocaleTimeString('id-ID');
    d.total += jumlah;
    if (!d.harian[tgl]) d.harian[tgl] = { total: 0, detail: [] };
    d.harian[tgl].total += jumlah;
    d.harian[tgl].detail.push({ jam, jumlah });
    fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2));
    return d;
}

// --- RAILWAY ANTI-COMPLETED ---
const app = express();
app.get('/', (req, res) => res.send('NINJA STORM LIVE 🚀'));
app.listen(process.env.PORT || 3000, '0.0.0.0');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
// Polling diperkuat agar tidak bengong
const bot = new TelegramBot(TOKEN, { polling: { interval: 500, autoStart: true } });

let engines = {
    1: { sock: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

const menuAksi = (id) => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
            [{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }],
            [{ text: "📊 CEK REKAPAN", callback_data: 'cek_rekap' }],
            [{ text: "♻️ RESET BOT", callback_data: 'reset_bot' }]
        ]
    }
});

async function initWA(chatId, id) {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();

        engines[id].sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ninja Storm", "Chrome", "1.0.0"]
        });

        engines[id].sock.ev.on('creds.update', saveCreds);
        engines[id].sock.ev.on('connection.update', async (up) => {
            const { connection, qr, lastDisconnect } = up;
            const waktu = new Date().toLocaleString('id-ID');

            if (qr && chatId) {
                const buffer = await QRCode.toBuffer(qr, { scale: 4 });
                await bot.sendPhoto(chatId, buffer, { caption: `⚡ **SCAN QR ENGINE ${id}**\n🕒 ${waktu}` });
            }

            if (connection === 'open') {
                bot.sendMessage(chatId || '8657782534', `✅ **ENGINE ${id} ONLINE**\n🕒 ${waktu}`, menuAksi(id));
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason === DisconnectReason.loggedOut) {
                    bot.sendMessage(chatId || '8657782534', `🚫 **LAPORAN: WA ${id} KELUAR / BANNED**\n🕒 ${waktu}\nSession dihapus.`);
                    fs.rmSync(engines[id].session, { recursive: true, force: true });
                } else {
                    initWA(chatId, id);
                }
            }
        });
    } catch (e) { bot.sendMessage(chatId, `❌ **ERROR INIT:** ${e.message}`); }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data === 'cmd_login') {
        bot.sendMessage(chatId, "🚀 **PILIH ENGINE:**", {
            reply_markup: { inline_keyboard: [[{ text: "🌪 QR 1", callback_data: 'login_1' }, { text: "🌊 QR 2", callback_data: 'login_2' }]] }
        });
    }

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        bot.sendMessage(chatId, `⏳ **Menghubungkan Engine ${id}...**`);
        initWA(chatId, id);
    }

    if (data === 'cek_rekap') {
        const d = JSON.parse(fs.readFileSync(DB_FILE));
        const tgl = new Date().toLocaleDateString('id-ID');
        const harian = d.harian[tgl] ? d.harian[tgl].total : 0;
        bot.sendMessage(chatId, `📊 **REKAPAN BLAST AKURAT**\n\n📅 Hari Ini (${tgl}): ${harian}\n🌍 Keseluruhan: ${d.total}\n🕒 Update: ${new Date().toLocaleTimeString('id-ID')}`);
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, "❌ Engine Belum Login!");
        bot.sendMessage(chatId, `🔍 **ENGINE ${id} FILTERING...**`);
        try {
            const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            let aktif = [];
            for (const l of lines) {
                const n = l.replace(/[^0-9]/g, '');
                const [res] = await engines[id].sock.onWhatsApp(n).catch(() => [null]);
                if (res?.exists) aktif.push(l.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            bot.sendMessage(chatId, `✅ **FILTER SELESAI**\nAktif: ${aktif.length}`, menuAksi(id));
        } catch (e) { bot.sendMessage(chatId, `❌ **ERROR FILTER:** ${e.message}`); }
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        try {
            const nums = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const script = fs.readFileSync(engines[id].script, 'utf-8');
            bot.sendMessage(chatId, `🚀 **MELEDAKKAN ${nums.length} PESAN...**`);
            await Promise.all(nums.map(n => engines[id].sock.sendMessage(n.replace(/[^0-9]/g, '') + "@s.whatsapp.net", { text: script }).catch(() => {})));
            const stats = catatRekapan(nums.length);
            bot.sendMessage(chatId, `✅ **BLAST SELESAI!**\n📊 Total Hari Ini: ${stats.harian[new Date().toLocaleDateString('id-ID')].total}`, menuAksi(id));
        } catch (e) { bot.sendMessage(chatId, "❌ Filter dulu baru Jalan!"); }
    }
    
    if (data === 'reset_bot') {
        bot.sendMessage(chatId, "♻️ **RESTART BERHASIL (INTERNAL)**", {
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]] }
        });
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (m) => bot.sendMessage(m.chat.id, "🌪️ **NINJA STORM ENGINE**", {
    reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]] }
}));
