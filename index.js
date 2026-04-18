const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA & PERSISTENT STATS ---
const STATS_FILE = './stats.json';
let stats = { totalHariIni: 0, rekapanTotalHarian: 0, terakhirBlast: "-" };
if (fs.existsSync(STATS_FILE)) {
    try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch (e) {}
}
const saveStats = () => fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false, config: { ev: 100, every: 0, delay: 0 }, step: null },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false, config: { ev: 100, every: 0, delay: 0 }, step: null }
};

const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

const menuUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }]],
        resize_keyboard: true
    }
};

async function cleanupEngine(chatId, id) {
    if (engines[id].lastQrMsgId) { await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {}); engines[id].lastQrMsgId = null; }
    if (engines[id].sock) {
        try {
            engines[id].sock.ev.removeAllListeners('connection.update');
            engines[id].sock.end();
            engines[id].sock = null;
        } catch (e) {}
    }
    engines[id].isInitializing = false;
    engines[id].step = null;
}

// --- CORE KONEKSI (FIX: ANTI MUTER/STUCK) ---
async function initWA(chatId, id, msgIdToEdit) {
    // 1. Hapus session lama sebelum scan baru agar tidak "muter terus"
    if (fs.existsSync(engines[id].session)) {
        try { fs.rmSync(engines[id].session, { recursive: true, force: true }); } catch (e) {}
    }
    
    await cleanupEngine(chatId, id);
    engines[id].isInitializing = true;
    
    try {
        if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version, 
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ubuntu", "Chrome", "122.0.6261.112"],
            syncFullHistory: true,
            printQRInTerminal: false,
            connectTimeoutMs: 60000, // Timeout lebih lama agar stabil
            defaultQueryTimeoutMs: 0
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;

            if (qr && engines[id].isInitializing) { 
                // 2. Render QR dengan Scale 6 agar lebih tajam dan mudah scan
                const buffer = await QRCode.toBuffer(qr, { scale: 6, margin: 1 });
                
                if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                
                const sent = await bot.sendPhoto(chatId, buffer, {
                    caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n🕒 ${getWIBTime()}\n\n⚠️ *Gunakan HP lain jika barcode tidak muncul.*`,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] }
                });
                engines[id].lastQrMsgId = sent.message_id;
            }

            if (connection === 'open') {
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                engines[id].sock = sock; 
                engines[id].isInitializing = false;
                
                // 3. Alur Input Config (Ev -> Every -> Delay)
                engines[id].step = 'input_ev';
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**\n\nIdentitas: Ubuntu Chrome\n\n⌨️ Masukkan **Ev num** (Contoh: 100):`);
            }

            if (connection === 'close') {
                const sCode = lastDisconnect?.error?.output?.statusCode;
                if (sCode !== DisconnectReason.loggedOut && engines[id].isInitializing) {
                    setTimeout(() => initWA(chatId, id), 3000);
                }
            }
        });
    } catch (err) { engines[id].isInitializing = false; }
}

// --- CALLBACK & BUTTON LOGIC ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const id = q.data.split('_').pop();

    if (q.data.startsWith('start_filter_')) {
        const sock = engines[id].sock;
        const conf = engines[id].config;
        if (!sock) return bot.answerCallbackQuery(q.id, { text: "❌ Engine Offline!", show_alert: true });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "").slice(0, conf.ev);
            bot.sendMessage(chatId, `🔍 **FILTERING PROCESS...**\n🎯 Target: ${dataNomor.length} nomor\n⏳ Delay: ${conf.delay}s per ${conf.every} nomor`);

            for (let i = 0; i < dataNomor.length; i++) {
                let nomor = dataNomor[i].replace(/[^0-9]/g, "");
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                
                // Trigger buka history percakapan
                sock.onWhatsApp(jid).catch(() => {});

                if (conf.every > 0 && conf.delay > 0 && (i + 1) % conf.every === 0) {
                    await new Promise(r => setTimeout(r, conf.delay * 1000));
                }
            }
            bot.sendMessage(chatId, `✅ **FILTER SELESAI**`, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN TURBO", callback_data: `jalan_blast_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ File nomor tidak ditemukan."); }
    }

    if (q.data.startsWith('jalan_blast_')) {
        const sock = engines[id].sock;
        const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "");
        const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
        const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

        bot.sendMessage(chatId, `🚀 **WATERFALL BLAST STARTED!**`, menuUtama);
        dataNomor.forEach((baris, index) => {
            let nomor = baris.replace(/[^0-9]/g, "");
            let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
            let sapaan = baris.split(/[0-9]/)[0].trim() || "";
            sock.sendMessage(jid, { text: ((index % 2 === 0) ? p1 : p2).replace(/{id}/g, sapaan) }).catch(() => {});
        });
    }

    if (q.data === 'pilih_engine') {
        bot.sendMessage(chatId, "📌 **PILIH ENGINE:**", {
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }]] }
        });
    }
    if (q.data.startsWith('login_')) initWA(chatId, id);
    if (q.data === 'batal') { await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2); }
    bot.answerCallbackQuery(q.id);
});

// --- MESSAGE HANDLER (INPUT CAPTURE) ---
bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    for (let i = 1; i <= 2; i++) {
        if (engines[i].step) {
            const val = parseInt(text);
            if (isNaN(val)) return bot.sendMessage(chatId, "❌ Masukkan angka saja!");

            if (engines[i].step === 'input_ev') {
                engines[i].config.ev = val;
                engines[i].step = 'input_every';
                return bot.sendMessage(chatId, `✅ Ev num: **${val}**\n\n⌨️ Masukkan **Every** (Per berapa nomor jeda?):`);
            } 
            else if (engines[i].step === 'input_every') {
                engines[i].config.every = val;
                engines[i].step = 'input_delay';
                return bot.sendMessage(chatId, `✅ Every: **${val}**\n\n⌨️ Masukkan **Delay** (Detik jeda?):`);
            } 
            else if (engines[i].step === 'input_delay') {
                engines[i].config.delay = val;
                engines[i].step = null;
                return bot.sendMessage(chatId, `⚙️ **SETTING ENGINE ${i} SELESAI**\n\nEv: ${engines[i].config.ev}\nEvery: ${engines[i].config.every}\nDelay: ${engines[i].config.delay}s`, {
                    reply_markup: { inline_keyboard: [[{ text: "🔍 MULAI FILTER", callback_data: `start_filter_${i}` }]] }
                });
            }
        }
    }

    if (text === "♻️ RESTART") {
        await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2);
        bot.sendMessage(chatId, "♻️ **SYSTEM RESTARTED**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM READY**", menuUtama));
