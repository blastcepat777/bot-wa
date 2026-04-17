const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

// --- DATABASE REKAPAN ---
const DB_FILE = './database_ninja_final.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ total: 0, harian: {} }));
}

function updateRekapan(jumlah) {
    let data = JSON.parse(fs.readFileSync(DB_FILE));
    let tgl = new Date().toLocaleDateString('id-ID');
    data.total += jumlah;
    if (!data.harian[tgl]) data.harian[tgl] = 0;
    data.harian[tgl] += jumlah;
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return { total: data.total, today: data.harian[tgl] };
}

// --- KEEP ALIVE RAILWAY ---
const app = express();
app.get('/', (req, res) => res.send('NINJA STORM ACTIVE 🚀'));
app.listen(process.env.PORT || 3000, '0.0.0.0');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

let engines = {
    1: { sock: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

// --- KEYBOARD MENU (UKURAN KECIL + TOMBOL CANCEL) ---
const keyboardUtama = {
    reply_markup: {
        keyboard: [
            [{ text: "🌪 LOGIN QR 1" }, { text: "🌊 LOGIN QR 2" }],
            [{ text: "🔍 FILTER 1" }, { text: "🔍 FILTER 2" }],
            [{ text: "🚀 BLAST 1" }, { text: "🚀 BLAST 2" }],
            [{ text: "📊 LAPORAN REKAP" }, { text: "♻️ RESTART" }],
            [{ text: "❌ CANCEL" }] // Tombol Cancel Ditambahkan
        ],
        resize_keyboard: true, // Pastikan tombol mengecil
        one_time_keyboard: false
    }
};

async function startEngine(chatId, id) {
    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ninja Storm", "Chrome", "1.0.0"]
    });

    engines[id].sock.ev.on('creds.update', saveCreds);
    engines[id].sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;
        const waktu = new Date().toLocaleString('id-ID');

        if (qr && chatId) {
            const buffer = await QRCode.toBuffer(qr, { scale: 4 });
            await bot.sendPhoto(chatId, buffer, { caption: `⚡ **SCAN QR ENGINE ${id}**\n🕒 ${waktu}` });
        }

        if (connection === 'open') {
            bot.sendMessage(chatId || '8657782534', `✅ **ENGINE ${id} ONLINE!**`, keyboardUtama);
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                bot.sendMessage(chatId || '8657782534', `🚫 **LAPORAN: WA ${id} KELUAR / BANNED**\n🕒 ${waktu}`);
                fs.rmSync(engines[id].session, { recursive: true, force: true });
            } else {
                startEngine(chatId, id);
            }
        }
    });
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === "/start" || text === "♻️ RESTART") {
        return bot.sendMessage(chatId, "🌪️ **NINJA STORM ENGINE READY**", keyboardUtama);
    }

    if (text === "❌ CANCEL") {
        return bot.sendMessage(chatId, "❌ **AKSI DIBATALKAN.**", keyboardUtama);
    }

    if (text === "🌪 LOGIN QR 1") startEngine(chatId, 1);
    if (text === "🌊 LOGIN QR 2") startEngine(chatId, 2);

    if (text === "🔍 FILTER 1" || text === "🔍 FILTER 2") {
        const id = text.includes("1") ? 1 : 2;
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Login Engine ${id} dulu!`);
        bot.sendMessage(chatId, `🔍 **FILTERING ENGINE ${id}...**`);
        try {
            const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            let aktif = [];
            for (const l of lines) {
                const n = l.replace(/[^0-9]/g, '');
                const [res] = await engines[id].sock.onWhatsApp(n).catch(() => [null]);
                if (res?.exists) aktif.push(l.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            bot.sendMessage(chatId, `✅ **FILTER ${id} SELESAI**\nTotal: ${aktif.length}`, keyboardUtama);
        } catch (e) { bot.sendMessage(chatId, "❌ File nomor tidak ditemukan!"); }
    }

    if (text === "🚀 BLAST 1" || text === "🚀 BLAST 2") {
        const id = text.includes("1") ? 1 : 2;
        try {
            const nums = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const script = fs.readFileSync(engines[id].script, 'utf-8');
            bot.sendMessage(chatId, `🚀 **MELEDAKKAN ${nums.length} PESAN...**`);
            await Promise.all(nums.map(n => engines[id].sock.sendMessage(n.replace(/[^0-9]/g, '') + "@s.whatsapp.net", { text: script }).catch(() => {})));
            const stats = updateRekapan(nums.length);
            bot.sendMessage(chatId, `✅ **BLAST ${id} SELESAI!**\n📊 Hari Ini: ${stats.today}\n🌍 Total: ${stats.total}`, keyboardUtama);
        } catch (e) { bot.sendMessage(chatId, "❌ Filter dulu!"); }
    }

    if (text === "📊 LAPORAN REKAP") {
        const d = JSON.parse(fs.readFileSync(DB_FILE));
        const tgl = new Date().toLocaleDateString('id-ID');
        bot.sendMessage(chatId, `📊 **REKAP BLAST**\n📅 Tgl: ${tgl}\n🚀 Hari Ini: ${d.harian[tgl] || 0}\n🌍 Total: ${d.total}`, keyboardUtama);
    }
});
