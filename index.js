const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

// --- DATABASE REKAPAN (WAJIB ADA & AKURAT) ---
const DB_FILE = './database_ninja_final.json';
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

// --- KEEP ALIVE RAILWAY (AGAR TIDAK COMPLETED) ---
const app = express();
app.get('/', (req, res) => res.send('NINJA STORM ENGINE IS ACTIVE 🚀'));
app.listen(process.env.PORT || 3000, '0.0.0.0');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

// --- FUNGSI TOMBOL AKSI ---
const getMenuAksi = (id) => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
            [{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }],
            [{ text: "📊 CEK REKAPAN", callback_data: 'cek_statistik' }],
            [{ text: "♻️ RESTART", callback_data: 'reboot_internal' }]
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
            browser: ["Ninja Storm", "Chrome", "1.0.0"],
            connectTimeoutMs: 60000
        });

        const sock = engines[id].sock;
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (u) => {
            const { connection, qr, lastDisconnect } = u;
            const waktu = new Date().toLocaleString('id-ID');

            if (qr && chatId) {
                const buffer = await QRCode.toBuffer(qr, { scale: 4 });
                const sent = await bot.sendPhoto(chatId, buffer, { caption: `⚡ **SCAN QR ENGINE ${id}**\n🕒 ${waktu}` });
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                engines[id].lastQrMsgId = sent.message_id;
            }

            if (connection === 'open') {
                if (chatId) {
                    if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                    bot.sendMessage(chatId, `✅ **ENGINE ${id} TELAH ONLINE**\n🕒 ${waktu}`, getMenuAksi(id));
                }
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                // LAPORAN WA KELUAR / BANNED
                if (reason === DisconnectReason.loggedOut) {
                    bot.sendMessage(chatId || '8657782534', `🚫 **PERINGATAN: WA ENGINE ${id} KELUAR/BANNED**\n🕒 ${waktu}\nSession otomatis dihapus.`);
                    fs.rmSync(engines[id].session, { recursive: true, force: true });
                } else {
                    initWA(chatId, id); // Auto reconnect
                }
            }
        });
    } catch (err) {
        if (chatId) bot.sendMessage(chatId, `❌ **ERROR ENGINE ${id}:** ${err.message}`);
    }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data === 'cmd_login') {
        bot.sendMessage(chatId, "🚀 **PILIH ENGINE UNTUK LOGIN:**", {
            reply_markup: { inline_keyboard: [[{ text: "🌪 QR1", callback_data: 'login_1' }, { text: "🌊 QR2", callback_data: 'login_2' }]] }
        });
    }

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        bot.sendMessage(chatId, `⏳ **Menghubungkan Engine ${id}...**`);
        initWA(chatId, id);
    }

    if (data === 'reboot_internal') {
        await bot.sendMessage(chatId, "♻️ **RESTART BERHASIL.** Silahkan klik Login lagi.");
        bot.sendMessage(chatId, "🌪️ **NINJA STORM ENGINE READY**", {
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]] }
        });
    }

    if (data === 'cek_statistik') {
        const d = JSON.parse(fs.readFileSync(DB_FILE));
        const hariIni = new Date().toLocaleDateString('id-ID');
        bot.sendMessage(chatId, `📊 **REKAPAN BLAST NINJA**\n\n📅 Hari Ini: ${d.harian[hariIni] || 0}\n🌍 Total Seumur Hidup: ${d.total_keseluruhan}\n🕒 Waktu: ${new Date().toLocaleTimeString('id-ID')}`);
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, "❌ Login WA dulu, Bos!");
        bot.sendMessage(chatId, `🔍 **ENGINE ${id} MEMFILTER NOMOR...**`);
        try {
            const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            let aktif = [];
            for (const line of lines) {
                const num = line.replace(/[^0-9]/g, '');
                const [res] = await engines[id].sock.onWhatsApp(num).catch(() => [null]);
                if (res?.exists) aktif.push(line.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            bot.sendMessage(chatId, `✅ **FILTER SELESAI**\nAktif: ${aktif.length} Nomor`, getMenuAksi(id));
        } catch (e) { bot.sendMessage(chatId, `❌ **GAGAL FILTER:** Pastikan file ${engines[id].file} ada!`); }
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        try {
            const numbers = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const script = fs.readFileSync(engines[id].script, 'utf-8');
            bot.sendMessage(chatId, `🚀 **MELEDAKKAN ${numbers.length} PESAN...**`);

            await Promise.all(numbers.map(line => {
                const jid = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                return engines[id].sock.sendMessage(jid, { text: script }).catch(() => {});
            }));

            const hasil = simpanRekapan(numbers.length);
            bot.sendMessage(chatId, `✅ **ENGINE ${id} SELESAI MELEDAK!**\n📊 Total Hari Ini: ${hasil.today}`, getMenuAksi(id));
        } catch (e) { bot.sendMessage(chatId, "❌ **GAGAL BLAST:** Filter nomor dulu Bos!"); }
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🌪️ **NINJA STORM ENGINE READY**", {
        reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]] }
    });
});
