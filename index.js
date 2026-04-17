const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

// --- DATABASE PERSISTEN ---
const DB_FILE = './database_ninja.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ total: 0, harian: {} }));
}

function rekapData(n) {
    let d = JSON.parse(fs.readFileSync(DB_FILE));
    let tgl = new Date().toLocaleDateString('id-ID');
    d.total += n;
    d.harian[tgl] = (d.harian[tgl] || 0) + n;
    fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2));
    return d;
}

// --- KEEP ALIVE RAILWAY ---
const app = express();
app.get('/', (req, res) => res.send('NINJA STORM STATUS: OK'));
app.listen(process.env.PORT || 3000, '0.0.0.0');

// --- TELEGRAM CONFIG ---
const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
// Polling diatur lebih agresif agar cepat respon
const bot = new TelegramBot(TOKEN, { polling: { interval: 300, autoStart: true, params: { timeout: 10 } } });

let engines = {
    1: { sock: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

const menuAwal = {
    reply_markup: {
        inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: 'init_1' }, { text: "🌊 ENGINE 2", callback_data: 'init_2' }]]
    }
};

const menuAksi = (id) => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
            [{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }],
            [{ text: "📊 REKAPAN", callback_data: 'cek_rekap' }],
            [{ text: "♻️ RESTART", callback_data: 'reset_bot' }]
        ]
    }
});

async function konekWA(chatId, id) {
    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ninja Storm", "Chrome", "1.0.0"],
        printQRInTerminal: false
    });

    engines[id].sock.ev.on('creds.update', saveCreds);
    engines[id].sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr && chatId) {
            const buffer = await QRCode.toBuffer(qr, { scale: 4 });
            await bot.sendPhoto(chatId, buffer, { caption: `⚡ **SCAN QR ENGINE ${id}**\nSegera scan sebelum expired!` });
        }

        if (connection === 'open') {
            bot.sendMessage(chatId || '8657782534', `✅ **ENGINE ${id} ONLINE**\nSiap meledak, Bos!`, menuAksi(id));
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code === DisconnectReason.loggedOut) {
                bot.sendMessage(chatId || '8657782534', `🚫 **ENGINE ${id} KELUAR/BANNED**\nSession dihapus.`);
                fs.rmSync(engines[id].session, { recursive: true, force: true });
            } else {
                konekWA(chatId, id);
            }
        }
    });
}

// Handler Tombol
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data === 'reset_bot') {
        await bot.sendMessage(chatId, "♻️ **REBOOTING SYSTEM...**");
        bot.sendMessage(chatId, "🚀 **ENGINE REBOOTED.** Pilih Engine:", menuAwal);
        return;
    }

    if (data.startsWith('init_')) {
        const id = data.split('_')[1];
        bot.sendMessage(chatId, `⏳ **Menghubungkan Engine ${id}...**`);
        konekWA(chatId, id);
    }

    if (data === 'cek_rekap') {
        const d = JSON.parse(fs.readFileSync(DB_FILE));
        const tgl = new Date().toLocaleDateString('id-ID');
        bot.sendMessage(chatId, `📊 **TOTAL BLAST NINJA**\n\n📅 Hari Ini: ${d.harian[tgl] || 0}\n🌍 Keseluruhan: ${d.total}`);
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, "Login dulu Bos!");
        
        bot.sendMessage(chatId, `🔍 **ENGINE ${id} SEDANG FILTER...**`);
        const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
        let aktif = [];
        
        for (const l of lines) {
            const n = l.replace(/[^0-9]/g, '');
            const [check] = await engines[id].sock.onWhatsApp(n).catch(() => [null]);
            if (check?.exists) aktif.push(l.trim());
        }
        
        fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
        bot.sendMessage(chatId, `✅ **FILTER SELESAI**\nTotal Aktif: ${aktif.length}`, menuAksi(id));
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        try {
            const nums = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const msg = fs.readFileSync(engines[id].script, 'utf-8');
            
            bot.sendMessage(chatId, `🚀 **MELEDAKKAN ${nums.length} PESAN...**`);
            await Promise.all(nums.map(n => engines[id].sock.sendMessage(n.replace(/[^0-9]/g, '') + "@s.whatsapp.net", { text: msg }).catch(() => {})));
            
            const stats = rekapData(nums.length);
            bot.sendMessage(chatId, `✅ **ENGINE ${id} SUKSES MELEDAK!**\n📊 Total Hari Ini: ${stats.harian[new Date().toLocaleDateString('id-ID')]}`, menuAksi(id));
        } catch (e) { bot.sendMessage(chatId, "Filter dulu baru Jalan!"); }
    }
    bot.answerCallbackQuery(q.id);
});

// Perintah Dasar
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🌪️ **NINJA STORM ENGINE**\nSistem Siap Tempur.", menuAwal);
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 **PILIH ENGINE UNTUK LOGIN:**", menuAwal);
});

// Menangani Error Polling Telegram agar tidak mati
bot.on('polling_error', (error) => console.log('Polling Error:', error.code));
