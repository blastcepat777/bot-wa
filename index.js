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

// Penambahan config & step tracker untuk input user
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
    if (engines[id].qrTimeout) { clearTimeout(engines[id].qrTimeout); engines[id].qrTimeout = null; }
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

// --- CORE KONEKSI ---
async function initWA(chatId, id, msgIdToEdit) {
    engines[id].isInitializing = true;
    try {
        if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version, auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ubuntu", "Chrome", "122.0.6261.112"],
            syncFullHistory: true,
            printQRInTerminal: false,
            defaultQueryTimeoutMs: 0
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (u) => {
            const { connection, qr } = u;

            if (qr && engines[id].isInitializing) { 
                const buffer = await QRCode.toBuffer(qr, { scale: 5, margin: 1 });
                if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                
                const sent = await bot.sendPhoto(chatId, buffer, {
                    caption: `${engines[id].color} **ENGINE ${id} READY!**\n🕒 ${getWIBTime()}`,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] }
                });
                engines[id].lastQrMsgId = sent.message_id;
            }

            if (connection === 'open') {
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                engines[id].sock = sock; 
                engines[id].isInitializing = false;
                
                // Mulai alur input konfigurasi persis sesuai gambar validator Anda
                engines[id].step = 'input_ev';
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**\n\nSilahkan isi settingan Validator:\n\n⌨️ Masukkan **Ev num** (Contoh: 100):`);
            }
        });
    } catch (err) { engines[id].isInitializing = false; }
}

// --- CALLBACK LOGIC ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const id = q.data.split('_').pop();

    if (q.data.startsWith('start_filter_')) {
        const sock = engines[id].sock;
        const conf = engines[id].config;
        if (!sock) return bot.answerCallbackQuery(q.id, { text: "❌ Offline!", show_alert: true });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "").slice(0, conf.ev);
            bot.sendMessage(chatId, `🔍 **MULAI FILTER...**\nEv: ${conf.ev} | Every: ${conf.every} | Delay: ${conf.delay}s`);

            for (let i = 0; i < dataNomor.length; i++) {
                let nomor = dataNomor[i].replace(/[^0-9]/g, "");
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                
                // Proses membuka history chat sesuai video
                sock.onWhatsApp(jid).catch(() => {});

                // Logika jeda sesuai input 'every' dan 'delay' dari user
                if (conf.every > 0 && conf.delay > 0 && (i + 1) % conf.every === 0) {
                    await new Promise(resolve => setTimeout(resolve, conf.delay * 1000));
                }
            }

            bot.sendMessage(chatId, `✅ **FILTER SELESAI**\nHistory percakapan telah dibuka.`, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN TURBO", callback_data: `jalan_blast_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ File nomor error."); }
    }

    if (q.data.startsWith('jalan_blast_')) {
        const sock = engines[id].sock;
        const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "");
        const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
        const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

        bot.sendMessage(chatId, `🌊 **WATERFALL BLAST ACTIVE**`, menuUtama);
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

// --- MESSAGE HANDLER ---
bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    // Menangani proses input berurutan (Ev -> Every -> Delay)
    for (let i = 1; i <= 2; i++) {
        if (engines[i].step) {
            const val = parseInt(text);
            if (isNaN(val)) return bot.sendMessage(chatId, "❌ Masukkan angka saja!");

            if (engines[i].step === 'input_ev') {
                engines[i].config.ev = val;
                engines[i].step = 'input_every';
                return bot.sendMessage(chatId, `✅ Ev num: **${val}**\n\n⌨️ Masukkan **Every** (Per berapa nomor?):`);
            } 
            else if (engines[i].step === 'input_every') {
                engines[i].config.every = val;
                engines[i].step = 'input_delay';
                return bot.sendMessage(chatId, `✅ Every: **${val}**\n\n⌨️ Masukkan **Delay** (Detik jeda filter?):`);
            } 
            else if (engines[i].step === 'input_delay') {
                engines[i].config.delay = val;
                engines[i].step = null;
                return bot.sendMessage(chatId, `⚙️ **SETTING ENGINE ${i} SELESAI**\n\nEv num: ${engines[i].config.ev}\nEvery: ${engines[i].config.every}\nDelay: ${engines[i].config.delay}s`, {
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
