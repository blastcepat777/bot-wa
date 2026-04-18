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
        const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }), browser: ["Turbo Fire", "Chrome", "1.0.0"], defaultQueryTimeoutMs: 0 });

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (u) => {
            const { connection, qr } = u;
            if (qr) {
                const buffer = await QRCode.toBuffer(qr, { scale: 3 });
                if (msgIdToEdit) await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {});
                bot.sendPhoto(chatId, buffer, { caption: `✅ **SCAN QR ENGINE ${id}**`, parse_mode: 'Markdown' });
            }
            if (connection === 'open') {
                engines[id].sock = sock;
                bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE!**`, {
                    reply_markup: { inline_keyboard: [[{ text: "🔍 MULAI FILTER", callback_data: `start_filter_${id}` }]] }
                });
            }
        });
    } catch (err) {}
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data.startsWith('start_filter_')) {
        const id = data.split('_')[2];
        engines[id].step = 'input_ev'; // Mulai dari input ev num
        bot.sendMessage(chatId, `⌨️ **SETUP ENGINE ${id}**\n━━━━━━━━━━━━━━\nMasukkan jumlah **ev num**:`);
    }

    if (data.startsWith('execute_filter_')) {
        const id = data.split('_')[2];
        bot.sendMessage(chatId, `🔍 **OPENING HISTORY...**`);
        try {
            const lines = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim());
            lines.slice(0, engines[id].config.ev).forEach((l, i) => {
                setTimeout(() => {
                    let jid = l.replace(/[^0-9]/g, "") + '@s.whatsapp.net';
                    engines[id].sock.onWhatsApp(jid).catch(() => {});
                }, i * 30);
            });
            const c = engines[id].config;
            bot.sendMessage(chatId, `📊 **LAPORAN SETTING BLAST**\n━━━━━━━━━━━━━━\n⌛ Delay Message : \`${c.delay_msg}\` s\n📦 Break After : \`${c.break_after}\` msg\n🕒 Delay Break : \`${c.delay_break}\` s`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN", callback_data: `jalan_blast_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ File nomor tidak ada."); }
    }

    if (data.startsWith('jalan_blast_')) {
        const id = data.split('_')[2];
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
            }, i * (engines[id].config.delay_msg * 1000 || 50));
        });
    }

    if (data === 'pilih_engine') {
        bot.sendMessage(chatId, "📌 **PILIH ENGINE:**", { reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }]] } });
    }
    if (data.startsWith('login_')) initWA(chatId, data.split('_')[1]);
    bot.answerCallbackQuery(q.id);
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    for (let id in engines) {
        if (engines[id].step) {
            const val = parseInt(text);
            if (isNaN(val)) return bot.sendMessage(chatId, "❌ Kirim angka!");
            
            if (engines[id].step === 'input_ev') {
                engines[id].config.ev = val;
                engines[id].step = 'input_delay_msg';
                return bot.sendMessage(chatId, `✅ ev num: ${val}\n📥 **Delay Message (s):**`);
            } else if (engines[id].step === 'input_delay_msg') {
                engines[id].config.delay_msg = val;
                engines[id].step = 'input_break_after';
                return bot.sendMessage(chatId, `✅ Delay: ${val}s\n📥 **Break After (msg):**`);
            } else if (engines[id].step === 'input_break_after') {
                engines[id].config.break_after = val;
                engines[id].step = 'input_delay_break';
                return bot.sendMessage(chatId, `✅ Break: ${val} msg\n📥 **Delay Break (s):**`);
            } else if (engines[id].step === 'input_delay_break') {
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
    if (text === "🛡️ CEK STATUS WA") bot.sendMessage(chatId, `🛡️ Engine 1: ${engines[1].sock ? "✅" : "❌"}\n🛡️ Engine 2: ${engines[2].sock ? "✅" : "❌"}`, menuUtama);
    if (text === "🚪 LOGOUT WA") { await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2); bot.sendMessage(chatId, "✅ LOGOUT", menuUtama); }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "🚀 **READY**", menuUtama));
