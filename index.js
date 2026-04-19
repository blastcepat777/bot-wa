const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA & PERSISTENT STATS ---
const STATS_FILE = './stats.json';
let stats = { totalHariIni: 0, rekapanTotalHarian: 0, terakhirBlast: "-" };
if (fs.existsSync(STATS_FILE)) { try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch (e) {} }
const saveStats = () => fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

// SINGLE ENGINE DATA
let engine = {
    sock: null,
    lastQrMsgId: null,
    session: './session_wa',
    color: '🌪',
    isInitializing: false,
    config: { ev: 0, every: 0, delay: 0 },
    blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 },
    step: null
};

const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

const menuUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }]],
        resize_keyboard: true
    }
};

async function cleanupEngine(chatId) {
    if (engine.lastQrMsgId) { await bot.deleteMessage(chatId, engine.lastQrMsgId).catch(() => {}); engine.lastQrMsgId = null; }
    if (engine.sock) { try { engine.sock.end(); engine.sock = null; } catch (e) {} }
    engine.isInitializing = false;
    engine.step = null;
}

async function initWA(chatId, msgIdToEdit) {
    await cleanupEngine(chatId);
    engine.isInitializing = true;
    try {
        if (!fs.existsSync(engine.session)) fs.mkdirSync(engine.session, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(engine.session);
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ubuntu", "Chrome", "122.0.6261.112"],
            syncFullHistory: false,
            markOnlineOnConnect: true,
            printQRInTerminal: false,
            connectTimeoutMs: 60000
        });

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;
            if (qr && engine.isInitializing) { 
                const buffer = await QRCode.toBuffer(qr, { scale: 4 });
                if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                if (engine.lastQrMsgId) await bot.deleteMessage(chatId, engine.lastQrMsgId).catch(() => {});
                const sent = await bot.sendPhoto(chatId, buffer, { caption: `🌪 **SCAN QR WHATSAPP**\n🕒 ${getWIBTime()}` });
                engine.lastQrMsgId = sent.message_id;
            }
            if (connection === 'open') {
                engine.sock = sock;
                engine.isInitializing = false;
                bot.sendMessage(chatId, `🌪 **WHATSAPP ONLINE!**`, {
                    reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI FILTER`, callback_data: `start_filter` }]] }
                });
            }
            if (connection === 'close') {
                const sCode = lastDisconnect?.error?.output?.statusCode;
                if (sCode !== DisconnectReason.loggedOut) initWA(chatId);
            }
        });
    } catch (err) { engine.isInitializing = false; }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;

    if (q.data === 'start_filter') {
        engine.step = 'input_ev';
        bot.sendMessage(chatId, `⌨️ **SETUP FILTER**\nMasukkan jumlah nomor:`);
    }

    if (q.data === 'execute_filter') {
        const sock = engine.sock;
        const conf = engine.config;
        bot.sendMessage(chatId, "🔍 **Filter Berjalan...**");
        try {
            const dataNomor = fs.readFileSync(`./nomor1.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "").slice(0, conf.ev);
            for (let i = 0; i < dataNomor.length; i++) {
                let nomor = dataNomor[i].replace(/[^0-9]/g, "");
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                await sock.onWhatsApp(jid).catch(() => {});
                if (conf.every > 0 && (i + 1) % conf.every === 0) await new Promise(r => setTimeout(r, conf.delay * 1000));
            }
            bot.sendMessage(chatId, "✅ **FILTER SELESAI**", {
                reply_markup: { inline_keyboard: [[{ text: "🚀 SETUP BLAST", callback_data: `setup_blast` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ File nomor1.txt tidak ditemukan."); }
    }

    if (q.data === 'setup_blast') {
        engine.step = 'blast_delay_msg';
        bot.sendMessage(chatId, `🚀 **SETTING BLAST**\nMasukkan Delay (Detik):`);
    }

    if (q.data === 'jalan_blast') {
        const sock = engine.sock;
        const bConf = engine.blastConfig;
        if (!sock) return bot.sendMessage(chatId, "🔴 WA Offline!");

        try {
            const dataNomor = fs.readFileSync(`./nomor1.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "");
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            bot.sendMessage(chatId, `🌪️ **BLASTING...**\nTarget: ${dataNomor.length} nomor.`);

            for (let i = 0; i < dataNomor.length; i++) {
                let baris = dataNomor[i];
                let nomor = baris.replace(/[^0-9]/g, "");
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                let sapaan = baris.split(/[0-9]/)[0].trim() || "";
                let pesan = (i % 2 === 0 ? p1 : p2).replace(/{id}/g, sapaan);

                // --- ANTI-BANNED SIMULATION ---
                await sock.sendPresenceUpdate('composing', jid); // Status Mengetik
                await new Promise(r => setTimeout(r, 1000)); // Ngetik 1 detik
                
                await sock.sendMessage(jid, { text: pesan }).catch(() => {});
                
                stats.totalHariIni++;
                stats.rekapanTotalHarian++;
                stats.terakhirBlast = getWIBTime();
                saveStats();

                if (bConf.delayMsg > 0 && i < dataNomor.length - 1) {
                    await new Promise(res => setTimeout(res, bConf.delayMsg * 1000));
                }
                
                if (bConf.breakAfter > 0 && (i + 1) % bConf.breakAfter === 0) {
                    await new Promise(res => setTimeout(res, bConf.delayBreak * 1000));
                }
            }
            bot.sendMessage(chatId, `✅ **SELESAI!**\nTotal: ${dataNomor.length} Chat.`);
        } catch (e) { bot.sendMessage(chatId, "❌ Error file."); }
    }

    if (q.data === 'login_1') initWA(chatId);
    bot.answerCallbackQuery(q.id);
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (engine.step) {
        const val = parseInt(text);
        if (engine.step === 'input_ev') { engine.config.ev = val; engine.step = 'input_every'; bot.sendMessage(chatId, "✅ Every:"); }
        else if (engine.step === 'input_every') { engine.config.every = val; engine.step = 'input_delay'; bot.sendMessage(chatId, "✅ Delay:"); }
        else if (engine.step === 'input_delay') {
            engine.config.delay = val; engine.step = null;
            bot.sendMessage(chatId, "⚙️ Filter Oke.", { reply_markup: { inline_keyboard: [[{ text: "🔍 JALAN FILTER", callback_data: "execute_filter" }]] } });
        }
        else if (engine.step === 'blast_delay_msg') { engine.blastConfig.delayMsg = val; engine.step = 'blast_break'; bot.sendMessage(chatId, "✅ Break After (Pesan):"); }
        else if (engine.step === 'blast_break') { engine.blastConfig.breakAfter = val; engine.step = 'blast_delay_break'; bot.sendMessage(chatId, "✅ Delay Break (Detik):"); }
        else if (engine.step === 'blast_delay_break') {
            engine.blastConfig.delayBreak = val; engine.step = null;
            bot.sendMessage(chatId, "🔥 Siap Blast?", { reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN SEKARANG", callback_data: "jalan_blast" }]] } });
        }
        return;
    }

    if (text === "📊 LAPORAN HARIAN") bot.sendMessage(chatId, `📊 **LAPORAN**\n🚀 Hari Ini: ${stats.totalHariIni}\n📈 Total: ${stats.rekapanTotalHarian}`);
    if (text === "♻️ RESTART") { await cleanupEngine(chatId); bot.sendMessage(chatId, "♻️ **RESTART**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "login_1" }]] } }); }
    if (text === "🛡️ CEK STATUS WA") bot.sendMessage(chatId, `🛡️ Status: ${engine.sock?.user ? "✅ ONLINE" : "❌ OFFLINE"}`);
    if (text === "🚪 LOGOUT WA") { await cleanupEngine(chatId); if (fs.existsSync(engine.session)) fs.rmSync(engine.session, { recursive: true, force: true }); bot.sendMessage(chatId, "✅ LOGOUT"); }
    if (text === "/start") bot.sendMessage(chatId, "🌪️ **NINJA SOLO READY!**", menuUtama);
});
