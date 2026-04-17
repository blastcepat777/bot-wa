const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

// --- DATABASE REKAPAN (ANTI HILANG) ---
const DB_FILE = './rekapan_final.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ total_keseluruhan: 0, harian: {} }));
}

function updateRekapan(count) {
    let data = JSON.parse(fs.readFileSync(DB_FILE));
    let today = new Date().toLocaleDateString('id-ID');
    data.total_keseluruhan += count;
    if (!data.harian[today]) data.harian[today] = 0;
    data.harian[today] += count;
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return { total: data.total_keseluruhan, today: data.harian[today] };
}

// --- KEEP ALIVE RAILWAY (WAJIB) ---
const app = express();
app.get('/', (req, res) => res.send('SERVER RUNNING'));
app.listen(process.env.PORT || 3000, '0.0.0.0');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

// --- FUNGSI TOMBOL YANG GAK BAKAL HILANG ---
const sendMenuEngine = (chatId, id) => {
    bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} READY**\n🕒 ${new Date().toLocaleTimeString('id-ID')}`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
                [{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }],
                [{ text: "📊 CEK REKAPAN", callback_data: 'cek_rekap' }],
                [{ text: "♻️ RESTART", callback_data: 'restart_internal' }],
                [{ text: "❌ KELUAR", callback_data: 'batal' }]
            ]
        }
    });
};

async function initWA(chatId, id) {
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
        if (qr && chatId) {
            const buffer = await QRCode.toBuffer(qr, { scale: 4 });
            const sent = await bot.sendPhoto(chatId, buffer, { caption: `**SCAN QR ${id}**` });
            engines[id].lastQrMsgId = sent.message_id;
        }
        if (connection === 'open' && chatId) {
            sendMenuEngine(chatId, id);
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                bot.sendMessage(chatId || '8657782534', `🚫 **ENGINE ${id} TERBLOKIR/LOGOUT**`);
                fs.rmSync(engines[id].session, { recursive: true, force: true });
            } else {
                initWA(chatId, id);
            }
        }
    });
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    // --- PERBAIKAN RESTART: GAK PAKAI EXIT LAGI ---
    if (data === 'restart_internal') {
        await bot.sendMessage(chatId, "♻️ **RESTART BERHASIL (INTERNAL)**");
        // Munculkan menu utama lagi tanpa matiin engine
        bot.sendMessage(chatId, "🚀 **PILIH ENGINE:**", {
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: 'start_1' }, { text: "🌊 ENGINE 2", callback_data: 'start_2' }]] }
        });
        return;
    }

    if (data === 'cek_rekap') {
        const stats = JSON.parse(fs.readFileSync(DB_FILE));
        const tgl = new Date().toLocaleDateString('id-ID');
        bot.sendMessage(chatId, `📊 **REKAPAN BLAST**\n📅 Hari Ini: ${stats.harian[tgl] || 0}\n🌍 Total: ${stats.total_keseluruhan}`);
    }

    if (data.startsWith('start_')) {
        const id = data.split('_')[1];
        initWA(chatId, id);
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        bot.sendMessage(chatId, `🔍 **FILTERING ENGINE ${id}...**`);
        const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
        let aktif = [];
        for (const line of lines) {
            const num = line.replace(/[^0-9]/g, '');
            const [res] = await engines[id].sock.onWhatsApp(num).catch(() => [null]);
            if (res?.exists) aktif.push(line.trim());
        }
        fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
        bot.sendMessage(chatId, `✅ **FILTER SELESAI: ${aktif.length} AKTIF**`);
        sendMenuEngine(chatId, id); // Munculin tombol lagi
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        const nums = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const text = fs.readFileSync(engines[id].script, 'utf-8');
        
        bot.sendMessage(chatId, `🚀 **BLASTING ${nums.length} NOMOR...**`);
        await Promise.all(nums.map(n => engines[id].sock.sendMessage(n.replace(/[^0-9]/g, '') + "@s.whatsapp.net", { text }).catch(() => {})));
        
        const res = updateRekapan(nums.length);
        bot.sendMessage(chatId, `✅ **BLAST ENGINE ${id} SELESAI!**\n📊 Hari Ini: ${res.today}`);
        sendMenuEngine(chatId, id); // Munculin tombol lagi
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🌪️ **NINJA STORM READY**", {
        reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: 'start_1' }, { text: "🌊 ENGINE 2", callback_data: 'start_2' }]] }
    });
});
