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

const saveStats = () => {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    // Simpan juga ke laporan bulanan berdasarkan tanggal
    const tgl = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
    const filePath = path.join(REKAP_DIR, `rekap-${tgl.slice(0, 7)}.json`); // Bulanan
    let dailyLog = {};
    if (fs.existsSync(filePath)) dailyLog = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    dailyLog[tgl] = (dailyLog[tgl] || 0) + (stats.totalHariIni - (dailyLog[tgl] || 0));
    fs.writeFileSync(filePath, JSON.stringify(dailyLog, null, 2));
};

const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false, config: { ev: 0, every: 0, delay: 0 }, step: null },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false, config: { ev: 0, every: 0, delay: 0 }, step: null }
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
            engines[id].sock.ev.removeAllListeners();
            engines[id].sock.end();
            engines[id].sock = null;
        } catch (e) {}
    }
    engines[id].isInitializing = false;
    engines[id].step = null;
}

async function initWA(chatId, id) {
    // ANTI-SPAM: Jika sedang inisialisasi, jangan jalankan lagi
    if (engines[id].isInitializing && engines[id].lastQrMsgId) return;
    
    engines[id].isInitializing = true;
    try {
        if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();
        const sock = makeWASocket({
            version, auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ubuntu", "Chrome", "122.0.6261.112"],
            printQRInTerminal: false,
            connectTimeoutMs: 60000
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;
            
            // Tampilkan QR hanya jika belum ada pesan QR yang aktif
            if (qr && engines[id].isInitializing && !engines[id].lastQrMsgId) { 
                const buffer = await QRCode.toBuffer(qr, { scale: 3 });
                const sent = await bot.sendPhoto(chatId, buffer, { 
                    caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n🕒 Barcode ini akan kadaluarsa dalam 45 detik.`, 
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] }
                });
                engines[id].lastQrMsgId = sent.message_id;
            }

            if (connection === 'open') {
                engines[id].sock = sock;
                engines[id].isInitializing = false;
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                engines[id].lastQrMsgId = null;
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**`, {
                    reply_markup: { inline_keyboard: [[{ text: `🔍 SETUP FILTER & JAM`, callback_data: `start_filter_${id}` }]] }
                });
            }

            if (connection === 'close') {
                const sCode = lastDisconnect?.error?.output?.statusCode;
                if (sCode === DisconnectReason.loggedOut) {
                    if (fs.existsSync(engines[id].session)) fs.rmSync(engines[id].session, { recursive: true, force: true });
                    cleanupEngine(chatId, id);
                } else {
                    // Reconnect otomatis tanpa spam QR jika session masih ada
                    setTimeout(() => initWA(chatId, id), 5000);
                }
            }
        });
    } catch (err) { engines[id].isInitializing = false; }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === 'cek_bulanan') {
        const files = fs.readdirSync(REKAP_DIR).filter(f => f.endsWith('.json'));
        if (files.length === 0) return bot.answerCallbackQuery(q.id, { text: "❌ Belum ada rekapan bulanan.", show_alert: true });
        
        let txt = "📂 **LAPORAN BULANAN**\n━━━━━━━━━━━━━━\n";
        files.forEach(f => {
            const data = JSON.parse(fs.readFileSync(path.join(REKAP_DIR, f)));
            const total = Object.values(data).reduce((a, b) => a + b, 0);
            txt += `📅 **Bulan ${f.replace('rekap-', '').replace('.json', '')}**: \`${total}\` chat\n`;
        });
        bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
        return bot.answerCallbackQuery(q.id);
    }

    if (q.data.startsWith('start_filter_')) {
        const id = q.data.split('_')[2];
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `⌨️ **SETUP ENGINE ${id}**\n━━━━━━━━━━━━━━\nMasukkan jumlah **ev num**:`);
    }

    if (q.data.startsWith('execute_filter_')) {
        const id = q.data.split('_')[2];
        const engine = engines[id];
        if (!engine.sock) return bot.answerCallbackQuery(q.id, { text: "❌ Engine Offline!" });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').map(n => n.trim()).filter(n => n.length > 5).slice(0, engine.config.ev);
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            engine.sock.query = async () => { return true; }; 
            for (let i = 0; i < dataNomor.length; i++) {
                let nomor = dataNomor[i].replace(/[^0-9]/g, "");
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                let sapaan = dataNomor[i].split(/[0-9]/)[0].trim() || "Kak";
                let pesan = (i % 2 === 0 ? p1 : p2).replace(/{id}/g, sapaan);
                engine.sock.sendMessage(jid, { text: pesan }).catch(() => {});
                if (i % 10 === 0) await new Promise(res => setTimeout(res, 50)); 
            }

            bot.sendMessage(chatId, `✅ **NGEJAM SELESAI!**\nTotal: \`${dataNomor.length}\` masuk antrean.`, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 LEPAS JAM SEKARANG", callback_data: `lepas_jam_${id}` }]] }
            });

            stats.totalHariIni += dataNomor.length;
            stats.terakhirBlast = getWIBTime();
            saveStats();
        } catch (e) { bot.sendMessage(chatId, "❌ Error: " + e.message); }
    }

    if (q.data.startsWith('lepas_jam_')) {
        const id = q.data.split('_')[2];
        bot.editMessageText(`🚀 **MELEPAS ANTREAN ENGINE ${id}...**`, { chat_id: chatId, message_id: msgId });
        initWA(chatId, id); 
    }

    if (q.data === 'pilih_engine') {
        bot.editMessageText("📌 **PILIH ENGINE:**", { chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }], [{ text: "❌ BATAL", callback_data: "batal" }]] }
        });
    }

    if (q.data.startsWith('login_')) initWA(chatId, q.data.split('_')[1]);
    if (q.data === 'batal') { await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2); bot.editMessageText("✅ **SYSTEM RESET**", { chat_id: chatId, message_id: msgId }); }
    bot.answerCallbackQuery(q.id);
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;
    if (!text) return;

    for (let id in engines) {
        if (engines[id].step) {
            const val = parseInt(text);
            if (isNaN(val)) return bot.sendMessage(chatId, "❌ Masukkan angka.");
            if (engines[id].step === 'input_ev') { engines[id].config.ev = val; engines[id].step = 'input_every'; bot.sendMessage(chatId, `✅ ev: \`${val}\` - Masukkan **every**:`); }
            else if (engines[id].step === 'input_every') { engines[id].config.every = val; engines[id].step = 'input_delay'; bot.sendMessage(chatId, `✅ every: \`${val}\` - Masukkan **delay**:`); }
            else if (engines[id].step === 'input_delay') { 
                engines[id].config.delay = val; engines[id].step = null; 
                bot.sendMessage(chatId, `⚙️ **SETTING SELESAI**`, { reply_markup: { inline_keyboard: [[{ text: "🔍 JALANKAN PROSES JAM", callback_data: `execute_filter_${id}` }]] } }); 
            }
            return;
        }
    }

    if (text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **LAPORAN HARIAN**\n━━━━━━━━━━━━━━\n🕒 Terakhir: ${stats.terakhirBlast}\n🚀 Berhasil Jam: \`${stats.totalHariIni}\` chat\n━━━━━━━━━━━━━━`, { 
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "📂 CEK REKAP BULANAN", callback_data: "cek_bulanan" }]] }
        });
    }
    
    if (text === "♻️ RESTART") {
        await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2);
        bot.sendMessage(chatId, "♻️ **RESTART**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }
    
    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS**\n";
        for (let i=1; i<=2; i++) st += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ON" : "❌ OFF"}\n`;
        bot.sendMessage(chatId, st, menuUtama);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
