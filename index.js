const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, delay } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA & STATS ---
const STATS_FILE = './stats.json';
let stats = { totalHariIni: 0, rekapanTotalHarian: 0, terakhirBlast: "-" };
if (fs.existsSync(STATS_FILE)) {
    try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch (e) {}
}
const saveStats = () => fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false, config: { ev: 0, every: 0, delay: 0 }, blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 }, step: null, originalQuery: null },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false, config: { ev: 0, every: 0, delay: 0 }, blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 }, step: null, originalQuery: null }
};

const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

const menuUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }]],
        resize_keyboard: true, one_time_keyboard: false
    }
};

// --- CORE FUNCTIONS ---
async function cleanupEngine(chatId, id) {
    if (engines[id].qrTimeout) clearTimeout(engines[id].qrTimeout);
    if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
    
    // PENTING: Kembalikan fungsi query sebelum engine dimatikan
    if (engines[id].sock && engines[id].originalQuery) {
        engines[id].sock.query = engines[id].originalQuery;
    }

    if (engines[id].sock) {
        try {
            engines[id].sock.ev.removeAllListeners('connection.update');
            engines[id].sock.end();
        } catch (e) {}
    }
    engines[id].sock = null;
    engines[id].originalQuery = null;
    engines[id].step = null;
}

async function initWA(chatId, id, msgIdToEdit) {
    await cleanupEngine(chatId, id);
    engines[id].isInitializing = true;
    try {
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version, auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ubuntu", "Chrome", "122.0.6261.112"],
            syncFullHistory: false
        });

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;
            if (qr) {
                const buffer = await QRCode.toBuffer(qr, { scale: 3 });
                if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                const sent = await bot.sendPhoto(chatId, buffer, { caption: `**SCAN QR ENGINE ${id}**`, parse_mode: 'Markdown' });
                engines[id].lastQrMsgId = sent.message_id;
            }
            if (connection === 'open') {
                engines[id].sock = sock;
                bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE**`, {
                    reply_markup: { inline_keyboard: [[{ text: "🔍 SETUP FILTER", callback_data: `start_filter_${id}` }]] }
                });
            }
            if (connection === 'close') {
                const sCode = lastDisconnect?.error?.output?.statusCode;
                if (sCode === DisconnectReason.loggedOut) {
                    fs.rmSync(engines[id].session, { recursive: true, force: true });
                    cleanupEngine(chatId, id);
                } else { initWA(chatId, id); }
            }
        });

        sock.ev.on('messages.upsert', m => {
            const msg = m.messages[0];
            if (msg.key.fromMe && !msg.key.remoteJid.includes('status')) {
                stats.totalHariIni++; stats.rekapanTotalHarian++; stats.terakhirBlast = getWIBTime();
                saveStats();
            }
        });
    } catch (e) { engines[id].isInitializing = false; }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const id = q.data.split('_').pop();

    if (q.data.startsWith('start_filter_')) {
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `⌨️ **ENGINE ${id}**\nMasukkan jumlah **ev num**:`);
    }

    if (q.data.startsWith('execute_filter_')) {
        const sock = engines[id].sock;
        const conf = engines[id].config;
        if (!sock) return bot.answerCallbackQuery(q.id, { text: "Offline!" });

        bot.sendMessage(chatId, `🔍 **Filtering...**`);
        try {
            const nums = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim()).slice(0, conf.ev);
            for (let i = 0; i < nums.length; i++) {
                let jid = nums[i].replace(/[^0-9]/g, "") + '@s.whatsapp.net';
                if (!jid.startsWith('62')) jid = '62' + jid.replace(/^0/, "");
                await sock.onWhatsApp(jid).catch(() => {});
                if (conf.every > 0 && (i + 1) % conf.every === 0) await delay(conf.delay * 1000);
            }
            bot.sendMessage(chatId, `✅ **FILTER SELESAI**`, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 SETUP BLAST", callback_data: `setup_blast_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ Gagal baca nomor."); }
    }

    if (q.data.startsWith('jalan_blast_')) {
        const sock = engines[id].sock;
        const bConf = engines[id].blastConfig;
        try {
            const nums = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim());
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8');
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8');

            if (!engines[id].originalQuery) engines[id].originalQuery = sock.query;

            for (let i = 0; i < nums.length; i++) {
                // SUMBAT JARINGAN
                sock.query = async () => new Promise(() => {});

                let jid = nums[i].replace(/[^0-9]/g, "") + '@s.whatsapp.net';
                if (!jid.startsWith('62')) jid = '62' + jid.replace(/^0/, "");
                let pesan = (i % 2 === 0 ? p1 : p2).replace(/{id}/g, nums[i].split(/[0-9]/)[0] || "Kak");

                await sock.sendMessage(jid, { text: pesan }).catch(() => {});

                if ((i + 1) % (bConf.breakAfter || 30) === 0 || (i + 1) === nums.length) {
                    sock.query = engines[id].originalQuery; // LEPAS BENDUNGAN
                    bot.sendMessage(chatId, `🚀 **BURST!** melepaskan paket chat...`);
                    await delay(bConf.delayBreak * 1000 || 3000);
                }
                await delay(bConf.delayMsg * 100 || 100);
            }
            bot.sendMessage(chatId, `✅ **SELESAI**`);
        } catch (e) { bot.sendMessage(chatId, "❌ File script/nomor hilang."); }
    }

    if (q.data.startsWith('setup_blast_')) {
        engines[id].step = 'blast_delay_msg';
        bot.sendMessage(chatId, `🚀 **SETTING BLAST**\nDelay Message (Detik):`);
    }
    
    if (q.data === 'pilih_engine') {
        bot.sendMessage(chatId, "📌 **PILIH ENGINE:**", {
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }]] }
        });
    }

    if (q.data.startsWith('login_')) initWA(chatId, id, q.message.message_id);
    if (q.data === 'batal') { cleanupEngine(chatId, 1); cleanupEngine(chatId, 2); bot.sendMessage(chatId, "RESET", menuUtama); }
    bot.answerCallbackQuery(q.id);
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;
    if (!text) return;

    for (let id in engines) {
        if (engines[id].step) {
            const val = parseInt(text);
            if (engines[id].step === 'input_ev') { engines[id].config.ev = val; engines[id].step = 'input_every'; return bot.sendMessage(chatId, "Every:"); }
            if (engines[id].step === 'input_every') { engines[id].config.every = val; engines[id].step = 'input_delay'; return bot.sendMessage(chatId, "Delay:"); }
            if (engines[id].step === 'input_delay') { 
                engines[id].config.delay = val; engines[id].step = null;
                return bot.sendMessage(chatId, "Filter Ready", { reply_markup: { inline_keyboard: [[{ text: "🔍 MULAI", callback_data: `execute_filter_${id}` }]] } });
            }
            if (engines[id].step === 'blast_delay_msg') { engines[id].blastConfig.delayMsg = val; engines[id].step = 'blast_break_after'; return bot.sendMessage(chatId, "Break After:"); }
            if (engines[id].step === 'blast_break_after') { engines[id].blastConfig.breakAfter = val; engines[id].step = 'blast_delay_break'; return bot.sendMessage(chatId, "Delay Break:"); }
            if (engines[id].step === 'blast_delay_break') { 
                engines[id].blastConfig.delayBreak = val; engines[id].step = null;
                return bot.sendMessage(chatId, "Blast Ready", { reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN", callback_data: `jalan_blast_${id}` }]] } });
            }
        }
    }

    if (text === "📊 LAPORAN HARIAN") bot.sendMessage(chatId, `📊 **LAPORAN**\nTotal: ${stats.totalHariIni}`);
    if (text === "♻️ RESTART") { await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2); bot.sendMessage(chatId, "RESTARTED", { reply_markup: { inline_keyboard: [[{ text: "LOGIN", callback_data: "pilih_engine" }]] } }); }
    if (text === "🛡️ CEK STATUS WA") bot.sendMessage(chatId, `E1: ${engines[1].sock ? "✅" : "❌"}\nE2: ${engines[2].sock ? "✅" : "❌"}`, menuUtama);
    if (text === "🚪 LOGOUT WA") { await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2); bot.sendMessage(chatId, "LOGOUT SUCCESS"); }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
