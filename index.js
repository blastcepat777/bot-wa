const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, delay } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- KONFIGURASI LAPORAN (PROFESIONAL & RAPI) ---
const STATS_FILE = './stats.json';
const REKAP_DIR = './rekap_bulanan';
if (!fs.existsSync(REKAP_DIR)) fs.mkdirSync(REKAP_DIR, { recursive: true });

let stats = { totalHariIni: 0, terakhirBlast: "-" };
if (fs.existsSync(STATS_FILE)) {
    try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch (e) { console.log("Resetting corrupted stats file."); }
}

const updateLaporan = (jumlah) => {
    const sekarang = new Date();
    const tgl = sekarang.toISOString().split('T')[0]; // YYYY-MM-DD
    const bln = tgl.slice(0, 7); // YYYY-MM

    stats.totalHariIni += jumlah;
    stats.terakhirBlast = sekarang.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

    const pathBulan = path.join(REKAP_DIR, `rekap-${bln}.json`);
    let dataBulan = fs.existsSync(pathBulan) ? JSON.parse(fs.readFileSync(pathBulan, 'utf-8')) : {};
    dataBulan[tgl] = (dataBulan[tgl] || 0) + jumlah;
    fs.writeFileSync(pathBulan, JSON.stringify(dataBulan, null, 2));
};

// --- STATE MANAGEMENT ---
let engines = {
    1: { sock: null, session: './session_1', color: '🌪', qrSent: false, config: { ev: 0 }, step: null },
    2: { sock: null, session: './session_2', color: '🌊', qrSent: false, config: { ev: 0 }, step: null }
};

const menuUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN" }, { text: "🛡️ STATUS WA" }, { text: "🚪 LOGOUT" }]],
        resize_keyboard: true
    }
};

// --- LOGIKA KONEKSI ---
async function startEngine(chatId, id, silent = false) {
    if (engines[id].sock && !silent) return; // Jangan tumpuk koneksi jika sudah ada

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "122.0.6261.112"],
        printQRInTerminal: false,
        connectTimeoutMs: 20000, // Timeout lebih cepat agar tidak gantung
        defaultQueryTimeoutMs: undefined
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !engines[id].qrSent) {
            engines[id].qrSent = true;
            const buffer = await QRCode.toBuffer(qr, { scale: 3 });
            bot.sendPhoto(chatId, buffer, { 
                caption: `📝 **SCAN QR ENGINE ${id}**\n\n_QR ini hanya muncul sekali. Jika gagal, klik Restart._` 
            }).then(m => engines[id].lastMsg = m.message_id);
        }

        if (connection === 'open') {
            engines[id].sock = sock;
            engines[id].qrSent = false;
            if (engines[id].lastMsg) bot.deleteMessage(chatId, engines[id].lastMsg).catch(() => {});
            bot.sendMessage(chatId, `✅ **ENGINE ${id} AKTIF**`, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 SETUP BLAST", callback_data: `setup_${id}` }]] }
            });
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            engines[id].sock = null;
            engines[id].qrSent = false;
            
            if (code !== DisconnectReason.loggedOut) {
                // Reconnect otomatis tanpa spam QR
                setTimeout(() => startEngine(chatId, id, true), 5000);
            }
        }
    });
}

// --- TELEGRAM HANDLERS ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const [action, id] = q.data.split('_');

    if (action === 'setup') {
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `🔢 **ENGINE ${id}**\nMasukkan jumlah target:`);
    }

    if (action === 'gas') {
        const engine = engines[id];
        try {
            const data = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim().length > 5).slice(0, engine.config.ev);
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            bot.sendMessage(chatId, `⏳ **NGEJAM ${data.length} PESAN...**`);

            // LOCK QUERY (Force Jam)
            engine.sock.query = async () => { return true; };

            for (let i = 0; i < data.length; i++) {
                let raw = data[i].replace(/[^0-9]/g, "");
                let jid = (raw.startsWith('0') ? '62' + raw.slice(1) : raw) + '@s.whatsapp.net';
                let sapa = data[i].split(/[0-9]/)[0].trim() || "Kak";
                let teks = (i % 2 === 0 ? p1 : p2).replace(/{id}/g, sapa);

                engine.sock.sendMessage(jid, { text: teks }).catch(() => {});
                if (i % 25 === 0) await delay(50); // Flow control agar HP tidak panas
            }

            updateLaporan(data.length);
            bot.sendMessage(chatId, `✅ **JAM BERHASIL!**\nCek HP, pesan harusnya berikon jam.`, {
                reply_markup: { inline_keyboard: [[{ text: "🔓 LEPAS JAM SEKARANG", callback_data: `lepas_${id}` }]] }
            });

        } catch (err) { bot.sendMessage(chatId, `❌ Error: ${err.message}`); }
    }

    if (action === 'lepas') {
        bot.editMessageText(`🔓 **PROSES MELEPAS...**`, { chat_id: chatId, message_id: q.message.message_id });
        // Hancurkan koneksi yang disumbat
        engines[id].sock.end();
        // Paksa reconnect normal (tanpa trigger QR ulang)
        setTimeout(() => startEngine(chatId, id, true), 2000);
    }
    bot.answerCallbackQuery(q.id);
});

bot.on('message', (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (text === "/start") return bot.sendMessage(chatId, "✨ **SYSTEM READY**", menuUtama);

    for (let id in engines) {
        if (engines[id].step === 'input_ev') {
            engines[id].config.ev = parseInt(text);
            engines[id].step = null;
            return bot.sendMessage(chatId, `✅ Target: ${text} nomor`, {
                reply_markup: { inline_keyboard: [[{ text: "🔥 JALANKAN JAM", callback_data: `gas_${id}` }]] }
            });
        }
    }

    if (text === "📊 LAPORAN") {
        bot.sendMessage(chatId, `📂 **STATISTIK BLAST**\n━━━━━━━━━━━━━━\n🚀 Hari Ini: \`${stats.totalHariIni}\` chat\n🕒 Terakhir: ${stats.terakhirBlast}\n\n_Rekap bulanan otomatis tersimpan di folder /rekap_bulanan_`);
    }

    if (text === "🛡️ STATUS WA") {
        let txt = "🛡️ **STATUS KONEKSI**\n";
        for (let i in engines) txt += `${engines[i].color} Engine ${i}: ${engines[i].sock ? "✅ ON" : "❌ OFF"}\n`;
        bot.sendMessage(chatId, txt);
    }

    if (text === "♻️ RESTART") {
        startEngine(chatId, 1);
        startEngine(chatId, 2);
    }
});
