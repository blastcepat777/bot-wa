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
        
        // --- MENGGUNAKAN SETTINGAN CHROME SCRIPT 1 ---
        const sock = makeWASocket({
            version, 
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ubuntu", "Chrome", "20.0.04"], // Versi Ninja Storm
            defaultQueryTimeoutMs: 0, // Bypass Timeout
            connectTimeoutMs: 60000,
            printQRInTerminal: false
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;
            if (qr && engines[id].isInitializing) { 
                try {
                    const buffer = await QRCode.toBuffer(qr, { scale: 3, margin: 2 });
                    if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                    if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                    const sent = await bot.sendPhoto(chatId, buffer, {
                        caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n🕒 ${getWIBTime()}`,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] }
                    });
                    engines[id].lastQrMsgId = sent.message_id;
                } catch (e) {}
            }
            if (connection === 'open') {
                await cleanupEngine(chatId, id);
                engines[id].sock = sock; 
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE (SPEED DEWA)!**`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI FILTER`, callback_data: `start_filter_${id}` }]] }
                });
            }
            if (connection === 'close') {
                const sCode = lastDisconnect?.error?.output?.statusCode;
                if (sCode !== DisconnectReason.loggedOut && engines[id].isInitializing) {
                    setTimeout(() => initWA(chatId, id), 5000);
                }
            }
        });
    } catch (err) { engines[id].isInitializing = false; }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;

    if (q.data.startsWith('start_filter_')) {
        const id = q.data.split('_')[2];
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `⌨️ **SETUP FILTER ENGINE ${id}**\nMasukkan jumlah nomor yang akan dicek:`);
    }

    // --- LOGIKA JALAN BLAST SPEED DEWA (PARALLEL) ---
    if (q.data.startsWith('jalan_blast_')) {
        const id = q.data.split('_')[2];
        const sock = engines[id].sock;
        if (!sock) return bot.answerCallbackQuery(q.id, { text: "🔴 Login dulu Bos!" });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim().length > 5);
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8');
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8');

            bot.sendMessage(chatId, `🌪️ **NINJA STORM STARTED ON ENGINE ${id}!**\nMeluncurkan ${dataNomor.length} pesan sekaligus...`);

            // MENGGUNAKAN LOGIKA PROMISE.ALL (Muntah Massal)
            const allBlast = dataNomor.map((line, i) => {
                const parts = line.trim().split(/\s+/);
                const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                const sapaan = parts[0] || "";
                const pesan = (i % 2 === 0 ? p1 : p2).replace(/{id}/g, sapaan);
                
                return sock.sendMessage(jid, { text: pesan }).catch(() => {});
            });

            await Promise.all(allBlast);

            // Update Statistik
            stats.totalHariIni += dataNomor.length;
            stats.rekapanTotalHarian += dataNomor.length;
            stats.terakhirBlast = getWIBTime();
            saveStats();

            bot.sendMessage(chatId, `🚀 **BOOM! MELEDAK.**\nTotal Terkirim: ${dataNomor.length} Pesan.`);
        } catch (e) { bot.sendMessage(chatId, "❌ File script1.txt/script2.txt atau nomor tidak ditemukan."); }
    }

    // Filter Logic
    if (q.data.startsWith('execute_filter_')) {
        const id = q.data.split('_')[2];
        const conf = engines[id].config;
        const sock = engines[id].sock;
        bot.sendMessage(chatId, `🔍 **Filtering Aktif...**`);
        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "").slice(0, conf.ev);
            for (let i = 0; i < dataNomor.length; i++) {
                let jid = dataNomor[i].replace(/[^0-9]/g, "") + '@s.whatsapp.net';
                await sock.onWhatsApp(jid).catch(() => {});
                if (conf.every > 0 && (i + 1) % conf.every === 0) await new Promise(res => setTimeout(res, conf.delay * 1000));
            }
            bot.sendMessage(chatId, `✅ **FILTER SELESAI**`, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 GAS BLAST", callback_data: `jalan_blast_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ Gagal Filter."); }
    }

    if (q.data === 'pilih_engine') {
        bot.sendMessage(chatId, "📌 **PILIH ENGINE:**", {
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }]] }
        });
    }
    if (q.data.startsWith('login_')) {
        const id = q.data.split('_')[1];
        initWA(chatId, id);
    }
    if (q.data === 'batal') { await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2); bot.sendMessage(chatId, "✅ Dibatalkan."); }
    bot.answerCallbackQuery(q.id);
});

// --- TELEGRAM MESSAGE HANDLER ---
bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    for (let id in engines) {
        if (engines[id].step) {
            const val = parseInt(text);
            if (engines[id].step === 'input_ev') {
                engines[id].config.ev = val;
                engines[id].step = 'input_every';
                return bot.sendMessage(chatId, `✅ Ev Num: ${val}\nMasukkan **Every** (Jeda per berapa nomor):`);
            } else if (engines[id].step === 'input_every') {
                engines[id].config.every = val;
                engines[id].step = 'input_delay';
                return bot.sendMessage(chatId, `✅ Every: ${val}\nMasukkan **Delay** (Detik):`);
            } else if (engines[id].step === 'input_delay') {
                engines[id].config.delay = val;
                engines[id].step = null;
                return bot.sendMessage(chatId, `⚙️ Setup Filter Selesai.`, {
                    reply_markup: { inline_keyboard: [[{ text: "🔍 MULAI FILTER", callback_data: `execute_filter_${id}` }]] }
                });
            }
        }
    }

    if (text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **LAPORAN BLAST**\n━━━━━━━━━━━━━━\n🚀 Hari Ini: ${stats.totalHariIni}\n📈 Total: ${stats.rekapanTotalHarian}\n🕒 Terakhir: ${stats.terakhirBlast}`);
    }
    if (text === "♻️ RESTART") {
        bot.sendMessage(chatId, "♻️ **RESTARTING...**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }
    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS ENGINE**\n";
        for (let i=1; i<=2; i++) st += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        bot.sendMessage(chatId, st, menuUtama);
    }
    if (text === "🚪 LOGOUT WA") {
        for (let i=1; i<=2; i++) { await cleanupEngine(chatId, i); if (fs.existsSync(engines[i].session)) fs.rmSync(engines[i].session, { recursive: true, force: true }); }
        bot.sendMessage(chatId, "✅ LOGOUT BERHASIL", menuUtama);
    }
    if (text === "/start") bot.sendMessage(chatId, "✅ **NINJA STORM ENGINE READY!**", menuUtama);
});
