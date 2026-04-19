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
if (!fs.existsSync(REKAP_DIR)) fs.mkdirSync(REKAP_DIR, { recursive: true });

let stats = { totalHariIni: 0, rekapanTotalHarian: 0, terakhirBlast: "-" };
if (fs.existsSync(STATS_FILE)) {
    try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch (e) {}
}

// Fungsi Simpan Laporan (Harian & Bulanan)
const saveStats = (count) => {
    const sekarang = new Date();
    const tgl = sekarang.toISOString().split('T')[0]; 
    const bln = tgl.slice(0, 7); 

    stats.totalHariIni += count;
    stats.terakhirBlast = sekarang.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

    const pathBln = path.join(REKAP_DIR, `rekap-${bln}.json`);
    let dataBln = fs.existsSync(pathBln) ? JSON.parse(fs.readFileSync(pathBln, 'utf-8')) : {};
    dataBln[tgl] = (dataBln[tgl] || 0) + count;
    fs.writeFileSync(pathBln, JSON.stringify(dataBln, null, 2));
};

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false, config: { ev: 0, every: 0, delay: 0 }, step: null },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false, config: { ev: 0, every: 0, delay: 0 }, step: null }
};

const menuUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }]],
        resize_keyboard: true
    }
};

async function cleanupEngine(chatId, id) {
    if (engines[id].lastQrMsgId) { await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {}); engines[id].lastQrMsgId = null; }
    if (engines[id].sock) {
        try {
            engines[id].sock.ev.removeAllListeners();
            engines[id].sock.end();
            engines[id].sock = null;
        } catch (e) {}
    }
    engines[id].isInitializing = false;
}

async function initWA(chatId, id, silent = false) {
    if (engines[id].isInitializing && !silent) return; // Kunci biar gak spam barcode
    engines[id].isInitializing = true;
    try {
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ubuntu", "Chrome", "122.0.6261.112"],
            printQRInTerminal: false
        });

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;
            if (qr && !silent) { 
                const buffer = await QRCode.toBuffer(qr, { scale: 3 });
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                const sent = await bot.sendPhoto(chatId, buffer, { caption: `📸 **SCAN QR ENGINE ${id}**` });
                engines[id].lastQrMsgId = sent.message_id;
            }
            if (connection === 'open') {
                engines[id].sock = sock;
                engines[id].isInitializing = false;
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE**`, {
                    reply_markup: { inline_keyboard: [[{ text: `🔍 SETUP FILTER & JAM`, callback_data: `start_filter_${id}` }]] }
                });
            }
            if (connection === 'close') {
                engines[id].isInitializing = false;
                if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(() => initWA(chatId, id, true), 5000);
                }
            }
        });
    } catch (err) { engines[id].isInitializing = false; }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const id = q.data.split('_')[2] || q.data.split('_')[1];

    if (q.data.startsWith('start_filter_')) {
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `🔢 **ENGINE ${id}**\nMasukkan jumlah **ev num**:`);
    }

    if (q.data.startsWith('execute_filter_')) {
        const engine = engines[id];
        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim().length > 5).slice(0, engine.config.ev);
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            const statusMsg = await bot.sendMessage(chatId, `⏳ **PROSES NGEJAM ${dataNomor.length} NOMOR...**`);
            engine.sock.query = async () => { return true; }; // PROSES NGEJAM

            for (let i = 0; i < dataNomor.length; i++) {
                let num = dataNomor[i].replace(/[^0-9]/g, "");
                let jid = (num.startsWith('0') ? '62' + num.slice(1) : num) + '@s.whatsapp.net';
                let sapa = dataNomor[i].split(/[0-9]/)[0].trim() || "Kak";
                let msg = (i % 2 === 0 ? p1 : p2).replace(/{id}/g, sapa);
                engine.sock.sendMessage(jid, { text: msg }).catch(() => {});
                if (i % 10 === 0) await delay(50); 
            }

            bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
            saveStats(dataNomor.length);
            bot.sendMessage(chatId, `✅ **NGEJAM SELESAI!**\nTotal: \`${dataNomor.length}\``, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 LEPAS JAM", callback_data: `lepas_jam_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ Error: " + e.message); }
    }

    if (q.data.startsWith('lepas_jam_')) {
        bot.editMessageText(`🚀 **MELEPAS...**`, { chat_id: chatId, message_id: q.message.message_id });
        initWA(chatId, id, true); // Balikin koneksi normal buat kirim antrean
    }
    if (q.data.startsWith('login_')) initWA(chatId, id);
    if (q.data === 'pilih_engine') {
        bot.sendMessage(chatId, "📌 **PILIH ENGINE:**", {
            reply_markup: { inline_keyboard: [[{ text: "1", callback_data: "login_1" }, { text: "2", callback_data: "login_2" }]] }
        });
    }
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const cid = msg.chat.id;

    for (let id in engines) {
        if (engines[id].step) {
            const val = parseInt(text);
            if (engines[id].step === 'input_ev') { engines[id].config.ev = val; engines[id].step = 'input_every'; return bot.sendMessage(cid, `✅ ev: ${val}, Masukkan **every**:`); }
            if (engines[id].step === 'input_every') { engines[id].config.every = val; engines[id].step = 'input_delay'; return bot.sendMessage(cid, `✅ every: ${val}, Masukkan **delay**:`); }
            if (engines[id].step === 'input_delay') { 
                engines[id].config.delay = val; engines[id].step = null; 
                return bot.sendMessage(cid, `⚙️ **SETTING SELESAI**`, { reply_markup: { inline_keyboard: [[{ text: "🔍 JALANKAN", callback_data: `execute_filter_${id}` }]] } }); 
            }
        }
    }

    if (text === "📊 LAPORAN") {
        bot.sendMessage(cid, `📊 **REKAP BLAST**\n🚀 Hari Ini: \`${stats.totalHariIni}\` chat\n🕒 Terakhir: ${stats.terakhirBlast}`);
    }
    if (text === "♻️ RESTART") {
        await cleanupEngine(cid, 1); await cleanupEngine(cid, 2);
        bot.sendMessage(cid, "♻️ **SYSTEM RESTART**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }
    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS**\n";
        for (let i=1; i<=2; i++) st += `Engine ${i}: ${engines[i].sock?.user ? "✅ ON" : "❌ OFF"}\n`;
        bot.sendMessage(cid, st);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
