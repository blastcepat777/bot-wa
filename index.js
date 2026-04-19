const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, delay } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA & PERSISTENT STATS ---
const STATS_FILE = './stats.json';
const REKAP_DIR = './rekap_bulanan';
if (!fs.existsSync(REKAP_DIR)) fs.mkdirSync(REKAP_DIR);

let stats = { totalHariIni: 0, rekapanTotalHarian: 0, terakhirBlast: "-" };
if (fs.existsSync(STATS_FILE)) {
    try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch (e) {}
}

const saveStats = () => fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

// Anti-Spam: Simpan ID pesan terakhir untuk mencegah proses ganda
let lastProcessedMsgId = null;

const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

/**
 * Fungsi Log Bulanan: Mencatat akumulasi total kirim per bulan
 */
const logToMonthly = (jumlah) => {
    const now = new Date();
    const monthYear = now.toLocaleString('id-ID', { month: 'long', year: 'numeric' }).replace(/ /g, '_');
    const filePath = path.join(REKAP_DIR, `Rekap_${monthYear}.json`);
    
    let data = { month: monthYear, total: 0, history: [] };
    if (fs.existsSync(filePath)) {
        try {
            data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {}
    }
    
    data.total += jumlah;
    data.history.push({ waktu: getWIBTime(), dikirim: jumlah });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false, qrTimeout: null, config: { ev: 0, every: 0, delay: 0 }, blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 }, step: null },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false, qrTimeout: null, config: { ev: 0, every: 0, delay: 0 }, blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 }, step: null }
};

const menuUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }]],
        resize_keyboard: true, one_time_keyboard: false
    }
};

async function cleanupEngine(chatId, id) {
    if (engines[id].qrTimeout) { clearTimeout(engines[id].qrTimeout); engines[id].qrTimeout = null; }
    if (engines[id].lastQrMsgId) { await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {}); engines[id].lastQrMsgId = null; }
    if (engines[id].sock) {
        try {
            engines[id].sock.ev.removeAllListeners('connection.update');
            engines[id].sock.ev.removeAllListeners('creds.update');
            engines[id].sock.ev.removeAllListeners('messages.upsert');
            engines[id].sock.end();
            engines[id].sock = null;
        } catch (e) {}
    }
    engines[id].isInitializing = false;
    engines[id].step = null;
}

// --- LOGIKA PESAN TELEGRAM ---
bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;
    const msgId = msg.message_id;

    // ANTI-SPAM: Jangan proses jika ID pesan sama dengan yang terakhir (mencegah double trigger)
    if (msgId === lastProcessedMsgId) return;
    lastProcessedMsgId = msgId;

    if (text === "♻️ RESTART") {
        await cleanupEngine(chatId, 1);
        await cleanupEngine(chatId, 2);
        return bot.sendMessage(chatId, "♻️ **SYSTEM RESTART**", { 
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } 
        });
    }

    if (text === "📊 LAPORAN HARIAN") {
        const lap = `📊 **LAPORAN BLAST NINJA**\n━━━━━━━━━━━━━━\n🕒 **Terakhir:** ${stats.terakhirBlast}\n🚀 **Hari Ini:** \`${stats.totalHariIni}\` chat\n📈 **Total Harian:** \`${stats.rekapanTotalHarian}\` chat\n━━━━━━━━━━━━━━`;
        return bot.sendMessage(chatId, lap, { 
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "cek_bulanan" }]] }
        });
    }

    // Prosedur Input Angka (Setup)
    for (let id in engines) {
        if (engines[id].step) {
            const val = parseInt(text);
            if (isNaN(val)) return bot.sendMessage(chatId, "❌ **Gagal!** Masukkan angka saja.");

            if (engines[id].step === 'input_ev') {
                engines[id].config.ev = val;
                engines[id].step = 'input_every';
                return bot.sendMessage(chatId, `✅ **ev num: ** \`${val}\`\n━━━━━━━━━━━━━━\n⌨️ Masukkan **every**:`, { parse_mode: 'Markdown' });
            } 
            // ... (lanjutkan logika step lainnya seperti kode awal Anda)
        }
    }
    
    // Default Start
    if (text === "/start") return bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**", menuUtama);
});

// --- LOGIKA CALLBACK (TOMBOL) ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === 'cek_bulanan') {
        const files = fs.readdirSync(REKAP_DIR).filter(f => f.endsWith('.json'));
        if (files.length === 0) return bot.answerCallbackQuery(q.id, { text: "❌ Belum ada rekapan.", show_alert: true });
        
        let txt = "📂 **REKAPAN BULANAN**\n━━━━━━━━━━━━━━\n";
        files.forEach((f) => {
            try {
                const content = JSON.parse(fs.readFileSync(path.join(REKAP_DIR, f), 'utf-8'));
                txt += `📅 **${content.month.replace('_', ' ')}**\n📈 Total: \`${content.total}\` chat\n\n`;
            } catch (e) {}
        });
        
        bot.editMessageText(txt, { 
            chat_id: chatId, 
            message_id: msgId, 
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "⬅️ KEMBALI", callback_data: "back_to_laporan" }]] }
        });
        return bot.answerCallbackQuery(q.id);
    }

    if (q.data === 'back_to_laporan') {
        const lap = `📊 **LAPORAN BLAST NINJA**\n━━━━━━━━━━━━━━\n🕒 **Terakhir:** ${stats.terakhirBlast}\n🚀 **Hari Ini:** \`${stats.totalHariIni}\` chat\n📈 **Total Harian:** \`${stats.rekapanTotalHarian}\` chat\n━━━━━━━━━━━━━━`;
        bot.editMessageText(lap, {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "cek_bulanan" }]] }
        });
        return bot.answerCallbackQuery(q.id);
    }

    if (q.data.startsWith('jalan_blast_')) {
        const id = q.data.split('_')[2];
        const sock = engines[id].sock;
        
        try {
            // Anti-Spam & Duplikasi: Gunakan Set untuk nomor unik
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').map(n => n.trim()).filter(n => n !== "");
            const uniqueNumbers = [...new Set(dataNomor)];

            bot.sendMessage(chatId, `🚀 **BLASTING STARTED...**\nTotal: \`${uniqueNumbers.length}\` nomor unik.`);
            
            // Logika pengiriman (looping)
            for (let i = 0; i < uniqueNumbers.length; i++) {
                // ... (proses kirim pesan Anda)
            }

            // Catat ke laporan bulanan setelah selesai
            logToMonthly(uniqueNumbers.length);
            bot.sendMessage(chatId, `✅ **SELESAI!** Laporan bulanan diperbarui.`);
        } catch (e) {
            bot.sendMessage(chatId, "❌ Error membaca file nomor.");
        }
        return bot.answerCallbackQuery(q.id);
    }

    // ... (sisa callback lainnya)
    bot.answerCallbackQuery(q.id);
});

// Fungsi initWA tetap sama namun pastikan event listener ditata agar tidak menumpuk.
