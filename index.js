const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, delay } = require("@whiskeysockets/baileys");
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
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false, qrTimeout: null, config: { ev: 0, every: 0, delay: 0 }, step: null },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false, qrTimeout: null, config: { ev: 0, every: 0, delay: 0 }, step: null }
};

const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

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

async function initWA(chatId, id, msgIdToEdit) {
    await cleanupEngine(chatId, id);
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
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0 
        });

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('messages.upsert', (m) => {
            if (m.type === 'append' || m.type === 'notify') {
                const msg = m.messages[0];
                if (msg.key.fromMe && !msg.key.remoteJid.includes('status')) { 
                    stats.totalHariIni++;
                    stats.rekapanTotalHarian++;
                    stats.terakhirBlast = getWIBTime();
                    saveStats();
                }
            }
        });

        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;
            if (qr && engines[id].isInitializing) { 
                try {
                    const buffer = await QRCode.toBuffer(qr, { scale: 3, margin: 2 });
                    if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                    if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                    const sent = await bot.sendPhoto(chatId, buffer, {
                        caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n🕒 ${getWIBTime()}\n⚠️ *Barcode akan refresh jika tidak di-scan.*`,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] }
                    });
                    engines[id].lastQrMsgId = sent.message_id;
                    clearTimeout(engines[id].qrTimeout);
                    engines[id].qrTimeout = setTimeout(() => { if (engines[id].isInitializing) initWA(chatId, id); }, 45000); 
                } catch (e) {}
            }
            if (connection === 'open') {
                await cleanupEngine(chatId, id);
                engines[id].sock = sock; 
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI FILTER`, callback_data: `start_filter_${id}` }]] }
                });
            }
            if (connection === 'close') {
                const sCode = lastDisconnect?.error?.output?.statusCode;
                if (sCode === DisconnectReason.loggedOut) {
                    if (fs.existsSync(engines[id].session)) fs.rmSync(engines[id].session, { recursive: true, force: true });
                    await cleanupEngine(chatId, id);
                } else if (engines[id].isInitializing) {
                    setTimeout(() => initWA(chatId, id), 5000);
                }
            }
        });
    } catch (err) { engines[id].isInitializing = false; }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    // --- LOGIKA CEK REKAPAN BULANAN (YANG DIPERBAIKI) ---
    if (q.data === 'cek_bulanan') {
        const folder = './rekap_bulanan';
        if (!fs.existsSync(folder)) fs.mkdirSync(folder);
        
        const files = fs.readdirSync(folder).filter(f => f.endsWith('.txt') || f.endsWith('.json'));
        
        if (files.length === 0) {
            return bot.answerCallbackQuery(q.id, { text: "❌ Belum ada file rekapan di folder rekap_bulanan", show_alert: true });
        }

        let txt = "📂 **HASIL REKAPAN BULANAN**\n━━━━━━━━━━━━━━\n";
        files.forEach((f, i) => { txt += `${i+1}. \`${f}\`\n`; });
        
        bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
        return bot.answerCallbackQuery(q.id);
    }

    if (q.data.startsWith('start_filter_')) {
        const id = q.data.split('_')[2];
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `⌨️ **SETUP ENGINE ${id}**\n━━━━━━━━━━━━━━\nMasukkan jumlah **ev num**:`, { parse_mode: 'Markdown' });
    }

    if (q.data.startsWith('execute_filter_')) {
        const id = q.data.split('_')[2];
        const conf = engines[id].config;
        const sock = engines[id].sock;
        if (!sock) return bot.answerCallbackQuery(q.id, { text: "❌ Engine Offline!" });

        bot.sendMessage(chatId, `🔍 **STATUS FILTERING...**\n━━━━━━━━━━━━━━\n📊 Ev    : \`${conf.ev}\` nomor\n⏳ Every : \`${conf.every}\` nomor\n🕒 Delay : \`${conf.delay}\` detik`, { parse_mode: 'Markdown' });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "").slice(0, conf.ev);
            for (let i = 0; i < dataNomor.length; i++) {
                let nomor = dataNomor[i].replace(/[^0-9]/g, "");
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                await sock.onWhatsApp(jid).catch(() => {});
                if (conf.every > 0 && conf.delay > 0 && (i + 1) % conf.every === 0) {
                    await new Promise(res => setTimeout(res, conf.delay * 1000));
                }
            }
            bot.sendMessage(chatId, `✅ **FILTER SELESAI**\n━━━━━━━━━━━━━━\nHistory percakapan telah dibuka secara waterfall.`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN TURBO", callback_data: `jalan_blast_${id}` }], [{ text: "❌ BATAL", callback_data: "batal" }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ File nomor error."); }
    }

    if (q.data.startsWith('jalan_blast_')) {
        const id = q.data.split('_')[2];
        const sock = engines[id].sock;
        const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "");
        const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
        const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();
        bot.sendMessage(chatId, `🚀 **TURBO WATERFALL ACTIVE!**`, menuUtama);
        dataNomor.forEach((baris, index) => {
            let nomor = baris.replace(/[^0-9]/g, "");
            let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
            let sapaan = baris.split(/[0-9]/)[0].trim() || "";
            sock.sendMessage(jid, { text: ((index % 2 === 0) ? p1 : p2).replace(/{id}/g, sapaan) }).catch(() => {});
        });
    }

    if (q.data === 'pilih_engine') {
        bot.editMessageText("📌 **PILIH ENGINE:**", { chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }], [{ text: "❌ BATAL", callback_data: "batal" }]] }
        });
    }
    if (q.data.startsWith('login_')) {
        const id = q.data.split('_')[1];
        await bot.editMessageText(`⏳ **Menyiapkan Engine ${id}...**`, { chat_id: chatId, message_id: msgId });
        initWA(chatId, id, msgId); 
    }
    if (q.data === 'batal') { await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2); bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**", menuUtama); }
    bot.answerCallbackQuery(q.id);
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    for (let id in engines) {
        if (engines[id].step) {
            const val = parseInt(text);
            if (isNaN(val)) return bot.sendMessage(chatId, "❌ **Gagal!** Masukkan angka saja.");

            if (engines[id].step === 'input_ev') {
                engines[id].config.ev = val;
                engines[id].step = 'input_every';
                return bot.sendMessage(chatId, `✅ **Ev Num :** \`${val}\`\n━━━━━━━━━━━━━━\n⌨️ Masukkan jumlah **every**:`, { parse_mode: 'Markdown' });
            } else if (engines[id].step === 'input_every') {
                engines[id].config.every = val;
                engines[id].step = 'input_delay';
                return bot.sendMessage(chatId, `✅ **Every :** \`${val}\`\n━━━━━━━━━━━━━━\n⌨️ Masukkan jumlah **delay**:`, { parse_mode: 'Markdown' });
            } else if (engines[id].step === 'input_delay') {
                engines[id].config.delay = val;
                engines[id].step = null;
                const conf = engines[id].config;
                return bot.sendMessage(chatId, 
                    `⚙️ **SETTING ENGINE ${id} SELESAI**\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `📊 **Ev Num** : \`${conf.ev}\` nomor\n` +
                    `⏳ **Every** : \`${conf.every}\` nomor\n` +
                    `🕒 **Delay** : \`${conf.delay}\` detik\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `👇 *Silahkan klik tombol di bawah :*`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "🔍 MULAI FILTER", callback_data: `execute_filter_${id}` }]] }
                });
            }
        }
    }

    if (text === "📊 LAPORAN HARIAN") {
        const lap = `📊 **LAPORAN BLAST NINJA**\n━━━━━━━━━━━━━━\n🕒 **Terakhir:** ${stats.terakhirBlast}\n🚀 **Hari Ini:** \`${stats.totalHariIni}\` chat\n📈 **Total Harian:** \`${stats.rekapanTotalHarian}\` chat\n━━━━━━━━━━━━━━`;
        bot.sendMessage(chatId, lap, { 
            parse_mode: 'Markdown',
            reply_markup: { 
                inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "cek_bulanan" }]] 
            }
        });
    }
    if (text === "♻️ RESTART") {
        await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2);
        bot.sendMessage(chatId, "♻️ **SYSTEM RESTART**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }
    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS ENGINE**\n━━━━━━━━━━━━━━\n";
        for (let i=1; i<=2; i++) st += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        bot.sendMessage(chatId, st, menuUtama);
    }
    if (text === "🚪 LOGOUT WA") {
        for (let i=1; i<=2; i++) { await cleanupEngine(chatId, i); if (fs.existsSync(engines[i].session)) fs.rmSync(engines[i].session, { recursive: true, force: true }); }
        bot.sendMessage(chatId, "✅ **LOGOUT BERHASIL**", menuUtama);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
