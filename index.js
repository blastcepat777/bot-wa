const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

// --- DATABASE REKAPAN ANTI-HILANG ---
const DB_FILE = './rekapan_blast.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ total_seumur_hidup: 0, laporan_harian: {} }));
}

function simpanDataBlast(jumlah) {
    let data = JSON.parse(fs.readFileSync(DB_FILE));
    let hariIni = new Date().toLocaleDateString('id-ID');
    
    data.total_seumur_hidup += jumlah;
    if (!data.laporan_harian[hariIni]) data.laporan_harian[hariIni] = 0;
    data.laporan_harian[hariIni] += jumlah;
    
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return { total: data.total_seumur_hidup, hariIni: data.laporan_harian[hariIni] };
}

// --- FIX RAILWAY: WAJIB ADA SERVER EXPRESS AGAR TIDAK 'COMPLETED' ---
const app = express();
app.get('/', (req, res) => res.send('NINJA STORM ENGINE IS LIVE 🚀'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server mendengarkan di port ${PORT}`));

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

// Fungsi generate tombol supaya tidak hilang
const getMarkupEngine = (id) => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
            [{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }],
            [{ text: "📊 CEK REKAPAN", callback_data: 'cek_statistik' }],
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
            const sent = await bot.sendPhoto(chatId, buffer, { 
                caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n🕒 ${waktu}`,
                reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] }
            });
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            engines[id].lastQrMsgId = sent.message_id;
        }

        if (connection === 'open') {
            if (chatId) {
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `✅ **ENGINE ${id} TELAH ONLINE**\n🕒 ${waktu}`, getMarkupEngine(id));
            }
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            // LAPORAN WA KELUAR / BANNED
            if (reason === DisconnectReason.loggedOut) {
                bot.sendMessage(chatId || 'ADMIN_ID', `🚫 **PERINGATAN: WA ENGINE ${id} KELUAR/DIBATASI**\n🕒 ${waktu}\n\nSession telah dihapus, silahkan login ulang.`);
                fs.rmSync(engines[id].session, { recursive: true, force: true });
            } else {
                initWA(chatId, id);
            }
        }
    });
}

// Auto connect session lama saat bot start
Object.keys(engines).forEach(id => {
    if (fs.existsSync(engines[id].session)) initWA(null, id);
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data === 'restart_bot') {
        await bot.sendMessage(chatId, "♻️ **RESTARTING... TUNGGU 5 DETIK UNTUK TOMBOL BARU**");
        setTimeout(() => process.exit(0), 1000); // Keluar agar Railway restart otomatis
        return;
    }

    if (data === 'cek_statistik') {
        const stats = JSON.parse(fs.readFileSync(DB_FILE));
        const hariIni = new Date().toLocaleDateString('id-ID');
        bot.sendMessage(chatId, `📊 **LAPORAN BLAST NINJA**\n\n📅 Hari Ini: ${stats.laporan_harian[hariIni] || 0}\n🌍 Total Seumur Hidup: ${stats.total_seumur_hidup}\n🕒 Waktu: ${new Date().toLocaleTimeString('id-ID')}`);
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, "Engine belum login!");
        bot.sendMessage(chatId, `${engines[id].color} **SEDANG MEMFILTER NOMOR...**`);
        
        try {
            const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            let aktif = [];
            for (const line of lines) {
                const num = line.replace(/[^0-9]/g, '');
                const [res] = await engines[id].sock.onWhatsApp(num).catch(() => [null]);
                if (res?.exists) aktif.push(line.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            bot.sendMessage(chatId, `✅ **FILTER ${id} SELESAI**\nAktif: ${aktif.length} Nomor`, getMarkupEngine(id));
        } catch (e) { bot.sendMessage(chatId, "Gagal filter, cek file nomor!"); }
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return;
        
        try {
            const numbers = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const script = fs.readFileSync(engines[id].script, 'utf-8');
            
            bot.sendMessage(chatId, `🚀 **MELEDAKKAN ${numbers.length} PESAN SEKALIGUS...**`);

            // Kecepatan Penuh
            await Promise.all(numbers.map(line => {
                const jid = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                return engines[id].sock.sendMessage(jid, { text: script }).catch(() => {});
            }));

            const hasil = simpanDataBlast(numbers.length);
            bot.sendMessage(chatId, `✅ **BLAST ENGINE ${id} BERHASIL!**\n\n🚀 Terkirim: ${numbers.length}\n📊 Total Hari Ini: ${hasil.hariIni}`, getMarkupEngine(id));
        } catch (e) { bot.sendMessage(chatId, "Gagal Blast! Pastikan sudah Filter nomor."); }
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🌪️ **NINJA STORM ENGINE**", {
        reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]] }
    });
});
