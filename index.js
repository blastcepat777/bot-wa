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

const saveStats = () => fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

const logToMonthly = (jumlah) => {
    const now = new Date();
    const monthYear = now.toLocaleString('id-ID', { month: 'long', year: 'numeric' }).replace(/ /g, '_');
    const filePath = path.join(REKAP_DIR, `Rekap_${monthYear}.json`);
    
    let data = { month: monthYear, total: 0, history: [] };
    if (fs.existsSync(filePath)) data = JSON.parse(fs.readFileSync(filePath));
    
    data.total += jumlah;
    data.history.push({ waktu: getWIBTime(), dikirim: jumlah });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

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
            browser: ["Chrome", "MacOS", "122.0.6261.112"],
            printQRInTerminal: false,
            connectTimeoutMs: 60000
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
                        caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n🕒 ${getWIBTime()}\n⚠️ *Barcode akan refresh otomatis.*`,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] }
                    });
                    engines[id].lastQrMsgId = sent.message_id;
                    clearTimeout(engines[id].qrTimeout);
                    engines[id].qrTimeout = setTimeout(() => { if (engines[id].isInitializing) initWA(chatId, id); }, 45000); 
                } catch (e) {}
            }
            if (connection === 'open') {
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

    if (q.data === 'cek_bulanan') {
        const files = fs.readdirSync(REKAP_DIR).filter(f => f.endsWith('.json'));
        if (files.length === 0) return bot.answerCallbackQuery(q.id, { text: "❌ Belum ada rekapan.", show_alert: true });
        let txt = "📂 **REKAPAN BULANAN (JSON)**\n━━━━━━━━━━━━━━\n";
        files.forEach((f) => {
            const content = JSON.parse(fs.readFileSync(path.join(REKAP_DIR, f)));
            txt += `📅 **${content.month}**\n📈 Total: \`${content.total}\` chat\n\n`;
        });
        bot.editMessageText(txt, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "⬅️ KEMBALI", callback_data: "back_to_laporan" }]] } });
        return bot.answerCallbackQuery(q.id);
    }

    if (q.data === 'back_to_laporan') {
        const lap = `📊 **LAPORAN BLAST NINJA**\n━━━━━━━━━━━━━━\n🕒 **Terakhir:** ${stats.terakhirBlast}\n🚀 **Hari Ini:** \`${stats.totalHariIni}\` chat\n📈 **Total Harian:** \`${stats.rekapanTotalHarian}\` chat\n━━━━━━━━━━━━━━`;
        bot.editMessageText(lap, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "cek_bulanan" }]] } });
        return bot.answerCallbackQuery(q.id);
    }

    if (q.data.startsWith('start_filter_')) {
        const id = q.data.split('_')[2];
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `⌨️ **SETUP ENGINE ${id}**\n━━━━━━━━━━━━━━\nMasukkan jumlah **ev num**:`);
    }

    if (q.data.startsWith('execute_filter_')) {
        const id = q.data.split('_')[2];
        const conf = engines[id].config;
        const sock = engines[id].sock;
        if (!sock) return bot.answerCallbackQuery(q.id, { text: "❌ Engine Offline!" });
        bot.sendMessage(chatId, `🔍 **STATUS FILTERING...**\n━━━━━━━━━━━━━━\n📊 Ev : \`${conf.ev}\` nomor`);
        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "").slice(0, conf.ev);
            for (let i = 0; i < dataNomor.length; i++) {
                let nomor = dataNomor[i].replace(/[^0-9]/g, "");
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                await sock.onWhatsApp(jid).catch(() => {});
                if (conf.every > 0 && (i + 1) % conf.every === 0) await new Promise(res => setTimeout(res, conf.delay * 1000));
            }
            bot.sendMessage(chatId, `✅ **FILTER SELESAI**`, { reply_markup: { inline_keyboard: [[{ text: "🚀 SETUP BLAST", callback_data: `setup_blast_${id}` }], [{ text: "❌ BATAL", callback_data: "batal" }]] } });
        } catch (e) { bot.sendMessage(chatId, "❌ File nomor error."); }
    }

    if (q.data.startsWith('setup_blast_')) {
        const id = q.data.split('_')[2];
        engines[id].step = 'blast_delay_msg';
        bot.sendMessage(chatId, `🚀 **SETUP BLAST ENGINE ${id}**\n━━━━━━━━━━━━━━\nMasukkan **Delay Message** (detik):`);
    }

    // --- PERBAIKAN BAGIAN JALAN BLAST (HUJAN MENGALIR + NGEJAM) ---
    if (q.data.startsWith('jalan_blast_')) {
        const id = q.data.split('_')[2];
        const sock = engines[id].sock;
        
        if (!sock) return bot.answerCallbackQuery(q.id, { text: "❌ Engine Offline!" });

        try {
            const rawNumbers = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').map(n => n.trim()).filter(n => n !== "");
            const uniqueNumbers = [...new Set(rawNumbers)]; 
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();
            
            bot.sendMessage(chatId, `🌧️ **MEMULAI BLAST MENGALIR...**\n━━━━━━━━━━━━━━\nTarget: \`${uniqueNumbers.length}\` nomor.\n\n*Pesan akan masuk antrean (ikon jam) secara berurutan.*`, menuUtama);
            
            (async () => {
                for (let i = 0; i < uniqueNumbers.length; i++) {
                    let baris = uniqueNumbers[i];
                    let nomor = baris.replace(/[^0-9]/g, "");
                    let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                    let sapaan = baris.split(/[0-9]/)[0].trim() || "";
                    let pesan = ((i % 2 === 0) ? p1 : p2).replace(/{id}/g, sapaan);

                    // EFEK NGEJAM: Kirim tanpa 'await' agar Baileys menumpuk di internal buffer (status jam)
                    sock.sendMessage(jid, { text: pesan }).catch(() => {});

                    // EFEK HUJAN MENGALIR: Jeda 100ms per pesan agar visual turun satu per satu di layar
                    await new Promise(res => setTimeout(res, 100)); 
                }

                logToMonthly(uniqueNumbers.length);
                bot.sendMessage(chatId, `✅ **ANTREAN SELESAI**\n━━━━━━━━━━━━━━\nTotal \`${uniqueNumbers.length}\` pesan sudah masuk kondisi jam.\nSekarang menunggu pengiriman otomatis oleh sistem.`);
            })();

        } catch (e) { bot.sendMessage(chatId, "❌ Error file atau Engine offline!"); }
        return bot.answerCallbackQuery(q.id);
    }

    if (q.data === 'pilih_engine') {
        bot.editMessageText("📌 **PILIH ENGINE:**", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }], [{ text: "❌ BATAL", callback_data: "batal" }]] } });
    }
    if (q.data.startsWith('login_')) {
        const id = q.data.split('_')[1];
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
            if (isNaN(val)) return bot.sendMessage(chatId, "❌ Masukkan angka.");
            
            if (engines[id].step === 'input_ev') {
                engines[id].config.ev = val;
                engines[id].step = 'input_every';
                bot.sendMessage(chatId, `✅ ev: \`${val}\`\nMasukkan **every**:`);
            } else if (engines[id].step === 'input_every') {
                engines[id].config.every = val;
                engines[id].step = 'input_delay';
                bot.sendMessage(chatId, `✅ every: \`${val}\`\nMasukkan **delay**:`);
            } else if (engines[id].step === 'input_delay') {
                engines[id].config.delay = val;
                engines[id].step = null;
                bot.sendMessage(chatId, `⚙️ **FILTER SELESAI**`, { reply_markup: { inline_keyboard: [[{ text: "🔍 MULAI FILTER", callback_data: `execute_filter_${id}` }]] } });
            } else if (engines[id].step === 'blast_delay_msg') {
                engines[id].blastConfig.delayMsg = val;
                engines[id].step = 'blast_break_after';
                bot.sendMessage(chatId, `✅ Delay: \`${val}\`s\nMasukkan **Break After**:`);
            } else if (engines[id].step === 'blast_break_after') {
                engines[id].blastConfig.breakAfter = val;
                engines[id].step = 'blast_delay_break';
                bot.sendMessage(chatId, `✅ Break: \`${val}\`msg\nMasukkan **Delay Break**:`);
            } else if (engines[id].step === 'blast_delay_break') {
                engines[id].blastConfig.delayBreak = val;
                engines[id].step = null;
                bot.sendMessage(chatId, `📊 **SETTING BLAST SELESAI**`, { reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN", callback_data: `jalan_blast_${id}` }]] } });
            }
            return;
        }
    }

    if (text === "📊 LAPORAN HARIAN") {
        const lap = `📊 **LAPORAN BLAST NINJA**\n━━━━━━━━━━━━━━\n🕒 **Terakhir:** ${stats.terakhirBlast}\n🚀 **Hari Ini:** \`${stats.totalHariIni}\` chat\n📈 **Total Harian:** \`${stats.rekapanTotalHarian}\` chat\n━━━━━━━━━━━━━━`;
        bot.sendMessage(chatId, lap, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "cek_bulanan" }]] } });
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
