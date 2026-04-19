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
const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false, qrTimeout: null, config: { ev: 0, every: 0, delay: 0 }, blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 }, step: null },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false, qrTimeout: null, config: { ev: 0, every: 0, delay: 0 }, blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 }, step: null }
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
            printQRInTerminal: false,
            connectTimeoutMs: 60000
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;
            if (qr && engines[id].isInitializing) { 
                const buffer = await QRCode.toBuffer(qr, { scale: 3 });
                if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                const sent = await bot.sendPhoto(chatId, buffer, { 
                    caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n🕒 ${getWIBTime()}`, 
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] }
                });
                engines[id].lastQrMsgId = sent.message_id;
                clearTimeout(engines[id].qrTimeout);
                engines[id].qrTimeout = setTimeout(() => { if (engines[id].isInitializing) initWA(chatId, id); }, 45000);
            }

            if (connection === 'open') {
                engines[id].sock = sock;
                engines[id].isInitializing = false;
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**`, {
                    reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI FILTER`, callback_data: `start_filter_${id}` }]] }
                });
            }

            if (connection === 'close') {
                const sCode = lastDisconnect?.error?.output?.statusCode;
                if (sCode === DisconnectReason.loggedOut) {
                    if (fs.existsSync(engines[id].session)) fs.rmSync(engines[id].session, { recursive: true, force: true });
                    cleanupEngine(chatId, id);
                } else {
                    setTimeout(() => initWA(chatId, id), 5000);
                }
            }
        });

        // Tracking centang dua (terkirim)
        sock.ev.on('messages.upsert', (m) => {
            const msg = m.messages[0];
            if (!msg.key.fromMe || msg.key.remoteJid.includes('status')) return;
            stats.totalHariIni++;
            stats.rekapanTotalHarian++;
            stats.terakhirBlast = getWIBTime();
            saveStats();
        });

    } catch (err) { engines[id].isInitializing = false; }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data.startsWith('start_filter_')) {
        const id = q.data.split('_')[2];
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `⌨️ **SETUP ENGINE ${id}**\nMasukkan jumlah **ev num**:`);
    }

    if (q.data.startsWith('execute_filter_')) {
        const id = q.data.split('_')[2];
        const engine = engines[id];
        if (!engine.sock) return bot.answerCallbackQuery(q.id, { text: "❌ Engine Offline!" });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').map(n => n.trim()).filter(n => n.length > 5).slice(0, engine.config.ev);
            bot.sendMessage(chatId, `🔍 **FILTERING ${dataNomor.length} NOMOR...**`);

            for (let i = 0; i < dataNomor.length; i++) {
                let nomor = dataNomor[i].replace(/[^0-9]/g, "");
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                await engine.sock.onWhatsApp(jid).catch(() => {});
                
                if (engine.config.every > 0 && (i + 1) % engine.config.every === 0) {
                    await delay(engine.config.delay * 1000);
                }
            }
            bot.sendMessage(chatId, `✅ **FILTER SELESAI**`, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 SETUP BLAST", callback_data: `setup_blast_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ Gagal: " + e.message); }
    }

    if (q.data.startsWith('setup_blast_')) {
        const id = q.data.split('_')[2];
        engines[id].step = 'blast_delay_msg';
        bot.sendMessage(chatId, `🚀 **SETTING BLAST ${id}**\nMasukkan **Delay Message** (Detik):`);
    }

    if (q.data.startsWith('jalan_blast_')) {
        const id = q.data.split('_')[2];
        const engine = engines[id];
        if (!engine.sock) return bot.answerCallbackQuery(q.id, { text: "❌ Engine Offline!" });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').map(n => n.trim()).filter(n => n.length > 5);
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            bot.sendMessage(chatId, `🚀 **BLASTING...**\nTotal: \`${dataNomor.length}\` nomor`);

            for (let i = 0; i < dataNomor.length; i++) {
                let baris = dataNomor[i];
                let nomor = baris.replace(/[^0-9]/g, "");
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                let sapaan = baris.split(/[0-9]/)[0].trim() || "Kak";
                let pesan = (i % 2 === 0 ? p1 : p2).replace(/{id}/g, sapaan);

                await engine.sock.sendMessage(jid, { text: pesan }).catch(() => {});
                
                await delay(engine.blastConfig.delayMsg * 1000);
                if (engine.blastConfig.breakAfter > 0 && (i + 1) % engine.blastConfig.breakAfter === 0) {
                    await delay(engine.blastConfig.delayBreak * 1000);
                }
            }
            bot.sendMessage(chatId, `✅ **BLAST SELESAI!**`);
        } catch (e) { bot.sendMessage(chatId, "❌ Error: " + e.message); }
    }

    if (q.data === 'pilih_engine') {
        bot.editMessageText("📌 **PILIH ENGINE:**", { chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }], [{ text: "❌ BATAL", callback_data: "batal" }]] }
        });
    }

    if (q.data.startsWith('login_')) initWA(chatId, q.data.split('_')[1], msgId);
    if (q.data === 'batal') { await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2); bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**", menuUtama); }
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
            
            if (engines[id].step === 'input_ev') { engines[id].config.ev = val; engines[id].step = 'input_every'; bot.sendMessage(chatId, "✅ Masukkan **every**:"); }
            else if (engines[id].step === 'input_every') { engines[id].config.every = val; engines[id].step = 'input_delay'; bot.sendMessage(chatId, "✅ Masukkan **delay**:"); }
            else if (engines[id].step === 'input_delay') { engines[id].config.delay = val; engines[id].step = null; bot.sendMessage(chatId, "⚙️ **SETTING SELESAI**", { reply_markup: { inline_keyboard: [[{ text: "🔍 MULAI FILTER", callback_data: `execute_filter_${id}` }]] } }); }
            else if (engines[id].step === 'blast_delay_msg') { engines[id].blastConfig.delayMsg = val; engines[id].step = 'blast_break_after'; bot.sendMessage(chatId, "✅ Masukkan **Break After**:"); }
            else if (engines[id].step === 'blast_break_after') { engines[id].blastConfig.breakAfter = val; engines[id].step = 'blast_delay_break'; bot.sendMessage(chatId, "✅ Masukkan **Delay Break**:"); }
            else if (engines[id].step === 'blast_delay_break') { engines[id].blastConfig.delayBreak = val; engines[id].step = null; bot.sendMessage(chatId, "✅ **SETTING BLAST SELESAI**", { reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN", callback_data: `jalan_blast_${id}` }]] } }); }
            return;
        }
    }

    if (text === "📊 LAPORAN HARIAN") bot.sendMessage(chatId, `📊 **LAPORAN**\n🕒 Terakhir: ${stats.terakhirBlast}\n🚀 Hari Ini: \`${stats.totalHariIni}\``, { parse_mode: 'Markdown' });
    if (text === "♻️ RESTART") { await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2); bot.sendMessage(chatId, "♻️ **RESTART**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } }); }
    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS**\n";
        for (let i=1; i<=2; i++) st += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ON" : "❌ OFF"}\n`;
        bot.sendMessage(chatId, st, menuUtama);
    }
    if (text === "🚪 LOGOUT WA") {
        for (let i=1; i<=2; i++) { await cleanupEngine(chatId, i); if (fs.existsSync(engines[i].session)) fs.rmSync(engines[i].session, { recursive: true, force: true }); }
        bot.sendMessage(chatId, "✅ **LOGOUT**", menuUtama);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
