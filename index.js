const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA & STATS ---
const STATS_FILE = './stats.json';
let stats = { totalHariIni: 0, rekapanTotalHarian: 0, terakhirBlast: "-" };
if (fs.existsSync(STATS_FILE)) { try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch (e) {} }
const saveStats = () => fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
setInterval(saveStats, 10000);

let engines = {
    1: { sock: null, session: './session_1', color: '🌪', config: { ev: 0, delay_msg: 0, break_after: 0, delay_break: 0 }, step: null },
    2: { sock: null, session: './session_2', color: '🌊', config: { ev: 0, delay_msg: 0, break_after: 0, delay_break: 0 }, step: null }
};

const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
const menuUtama = { reply_markup: { keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }]], resize_keyboard: true } };

async function cleanupEngine(chatId, id) {
    if (engines[id].sock) { try { engines[id].sock.ev.removeAllListeners(); engines[id].sock.end(); } catch (e) {} engines[id].sock = null; }
    engines[id].step = null;
}

async function initWA(chatId, id, msgIdToEdit) {
    await cleanupEngine(chatId, id);
    try {
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();
        const sock = makeWASocket({ 
            version, 
            auth: state, 
            logger: pino({ level: 'silent' }), 
            browser: ["Turbo Fire", "Chrome", "1.0.0"],
            syncFullHistory: false
        });

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (u) => {
            const { connection, qr, lastDisconnect } = u;
            if (qr) {
                const buffer = await QRCode.toBuffer(qr, { scale: 3 });
                if (msgIdToEdit) await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {});
                bot.sendPhoto(chatId, buffer, { caption: `✅ **SCAN QR ENGINE ${id}**\n🕒 ${getWIBTime()}`, parse_mode: 'Markdown' });
            }
            if (connection === 'open') {
                engines[id].sock = sock;
                bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE!**`, {
                    reply_markup: { inline_keyboard: [[{ text: "🔍 MULAI FILTER", callback_data: `start_filter_${id}` }]] }
                });
            }
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) initWA(chatId, id);
            }
        });
    } catch (err) { console.log(err) }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    const data = q.data;

    // Menjawab callback agar icon loading di Telegram hilang
    await bot.answerCallbackQuery(q.id).catch(() => {});

    if (data.includes('start_filter_')) {
        const id = data.split('_')[2];
        engines[id].step = 'input_ev';
        return bot.sendMessage(chatId, `⌨️ **SETUP ENGINE ${id}**\n━━━━━━━━━━━━━━\n📥 Masukkan jumlah **ev num**:`, {
            reply_markup: { force_reply: true }
        });
    }

    if (data.includes('execute_filter_')) {
        const id = data.split('_')[2];
        if (!engines[id].sock) return bot.sendMessage(chatId, "❌ Engine Offline! Silahkan login ulang.");

        bot.sendMessage(chatId, `🔍 **STATUS: OPENING HISTORY...**`);
        try {
            const lines = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim());
            const limit = engines[id].config.ev || lines.length;

            lines.slice(0, limit).forEach((l, i) => {
                setTimeout(() => {
                    let jid = l.replace(/[^0-9]/g, "") + '@s.whatsapp.net';
                    engines[id].sock.onWhatsApp(jid).catch(() => {});
                }, i * 30);
            });

            const c = engines[id].config;
            const lap = `📊 **LAPORAN SETTING BLAST**\n━━━━━━━━━━━━━━\n⌛ Delay Message : \`${c.delay_msg}\` s\n📦 Break After : \`${c.break_after}\` msg\n🕒 Delay Break : \`${c.delay_break}\` s\n━━━━━━━━━━━━━━\n👇 **Silahkan klik tombol di bawah :**`;
            
            return bot.sendMessage(chatId, lap, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN", callback_data: `jalan_blast_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ File nomor tidak ditemukan."); }
    }

    if (data.includes('jalan_blast_')) {
        const id = data.split('_')[2];
        if (!engines[id].sock) return bot.sendMessage(chatId, "❌ Engine Offline!");

        const lines = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim());
        const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
        const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();
        
        bot.sendMessage(chatId, `🚀 **BLASTING STARTED...**`, menuUtama);
        lines.forEach((l, i) => {
            setTimeout(() => {
                let jid = l.replace(/[^0-9]/g, "") + '@s.whatsapp.net';
                let sapa = l.split(/[0-9]/)[0].trim() || "";
                engines[id].sock.sendMessage(jid, { text: (i % 2 === 0 ? p1 : p2).replace(/{id}/g, sapa) }).catch(() => {});
                stats.totalHariIni++;
            }, i * (engines[id].config.delay_msg * 1000 || 100));
        });
    }

    if (data === 'pilih_engine') {
        bot.sendMessage(chatId, "📌 **PILIH ENGINE:**", { 
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }]] } 
        });
    }
    
    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        initWA(chatId, id, msgId);
    }
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (!text) return;

    for (let id in engines) {
        if (engines[id].step) {
            const val = parseInt(text);
            if (isNaN(val)) return bot.sendMessage(chatId, "❌ Mohon masukkan angka saja!");
            
            if (engines[id].step === 'input_ev') {
                engines[id].config.ev = val;
                engines[id].step = 'input_delay_msg';
                return bot.sendMessage(chatId, `✅ ev num: ${val}\n📥 **Masukkan Delay Message (Detik):**`, { reply_markup: { force_reply: true } });
            } 
            else if (engines[id].step === 'input_delay_msg') {
                engines[id].config.delay_msg = val;
                engines[id].step = 'input_break_after';
                return bot.sendMessage(chatId, `✅ Delay: ${val}s\n📥 **Masukkan Break After (Pesan):**`, { reply_markup: { force_reply: true } });
            } 
            else if (engines[id].step === 'input_break_after') {
                engines[id].config.break_after = val;
                engines[id].step = 'input_delay_break';
                return bot.sendMessage(chatId, `✅ Break: ${val} msg\n📥 **Masukkan Delay Break (Detik):**`, { reply_markup: { force_reply: true } });
            } 
            else if (engines[id].step === 'input_delay_break') {
                engines[id].config.delay_break = val;
                engines[id].step = null;
                return bot.sendMessage(chatId, `⚙️ **SETTING SELESAI**`, {
                    reply_markup: { inline_keyboard: [[{ text: "🔍 MULAI FILTER", callback_data: `execute_filter_${id}` }]] }
                });
            }
        }
    }

    if (text === "📊 LAPORAN HARIAN") bot.sendMessage(chatId, `📊 **LAPORAN**\n🚀 Hari Ini: \`${stats.totalHariIni}\` chat`, menuUtama);
    if (text === "♻️ RESTART") bot.sendMessage(chatId, "♻️ **SYSTEM READY**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    if (text === "🛡️ CEK STATUS WA") {
        let status = `🛡️ **STATUS ENGINE**\n`;
        status += `🌪 Engine 1: ${engines[1].sock ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        status += `🌊 Engine 2: ${engines[2].sock ? "✅ ONLINE" : "❌ OFFLINE"}`;
        bot.sendMessage(chatId, status, menuUtama);
    }
    if (text === "🚪 LOGOUT WA") { 
        await cleanupEngine(chatId, 1); 
        await cleanupEngine(chatId, 2); 
        bot.sendMessage(chatId, "✅ SEMUA SESSION TELAH DIRESET", menuUtama); 
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "🚀 **BOT OPERATIONAL**", menuUtama));
