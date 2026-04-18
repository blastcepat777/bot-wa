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
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false, qrTimeout: null },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false, qrTimeout: null }
};

const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

const menuUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }]],
        resize_keyboard: true, one_time_keyboard: false
    }
};

// --- CLEANUP ---
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
}

// --- CORE KONEKSI (UBUNTU CHROME IDENTITY) ---
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
            // IDENTITY: Ubuntu Chrome (Lebih Stabil & Dipercaya WA)
            browser: ["Ubuntu", "Chrome", "122.0.6261.112"], 
            printQRInTerminal: false,
            syncFullHistory: true, // Membuka history untuk memperkuat session
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0 // No timeout untuk query kencang
        });

        sock.ev.on('creds.update', saveCreds);

        // TRACKER REAL-TIME (HP USER)
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
                        caption: `${engines[id].color} **ENGINE ${id} READY!**\nScan sekarang untuk turbo mode.`,
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
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**\nIdentity: Ubuntu Chrome`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: `🔍 FILTER & SYNC`, callback_data: `start_filter_${id}` }]] }
                });
            }
            if (connection === 'close') {
                if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut && engines[id].isInitializing) {
                    setTimeout(() => initWA(chatId, id), 5000);
                }
            }
        });
    } catch (err) { engines[id].isInitializing = false; }
}

// --- TURBO LOGIC ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data.startsWith('jalan_blast_')) {
        const id = q.data.split('_')[2];
        const sock = engines[id].sock;
        if (!sock) return bot.answerCallbackQuery(q.id, { text: "❌ Offline!", show_alert: true });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "");
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            bot.sendMessage(chatId, `🌊 **TURBO WATERFALL ACTIVE**\nGas kencang tanpa jeda...`, menuUtama);

            // LOGIKA AIR TERJUN: Tanpa Batch, Tanpa Delay, Langsung Bombardir Socket
            dataNomor.forEach((baris, index) => {
                let nomor = baris.replace(/[^0-9]/g, "");
                if (nomor.length < 9) return;
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                let sapaan = baris.split(/[0-9]/)[0].trim() || "";
                const textPesan = (index % 2 === 0) ? p1 : p2;
                
                // Eksekusi instan ke socket
                sock.sendMessage(jid, { text: textPesan.replace(/{id}/g, sapaan) }).catch(() => {});
            });

            bot.sendMessage(chatId, `✅ **TERLEPAS!**\nPesan sedang mengalir deras di HP Anda.`);
        } catch (e) { bot.sendMessage(chatId, "❌ File script/nomor error."); }
    }

    if (q.data.startsWith('start_filter_')) {
        const id = q.data.split('_')[2];
        const sock = engines[id].sock;
        // Simulasi Sinkronisasi & Filter
        bot.sendMessage(chatId, `🔄 **SYNCING HISTORY & FILTERING...**`);
        
        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "");
            // Memastikan socket siap menerima traffic besar
            if (sock) await sock.waitForSocketOpen(); 

            setTimeout(() => {
                bot.sendMessage(chatId, `✅ **SYNC SELESAI**\nTotal: ${dataNomor.length} Target siap tembak.`, {
                    reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN TURBO (0s)", callback_data: `jalan_blast_${id}` }], [{ text: "❌ BATAL", callback_data: "batal" }]] }
                });
            }, 1000);
        } catch (e) { bot.sendMessage(chatId, "❌ Gagal baca file."); }
    }

    // Standard Buttons
    if (q.data === 'pilih_engine') {
        bot.editMessageText("📌 **PILIH ENGINE:**", { chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }]] }
        });
    }
    if (q.data.startsWith('login_')) {
        const id = q.data.split('_')[1];
        initWA(chatId, id, msgId); 
    }
    if (q.data === 'batal') {
        await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2);
        bot.sendMessage(chatId, "✅ **SYSTEM READY**", menuUtama);
    }
    bot.answerCallbackQuery(q.id);
});

// --- MENU HANDLER ---
bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **REKAPAN REAL HP**\n━━━━━━━━━━━━━\n🔥 Hari Ini: ${stats.totalHariIni}\n📈 Total: ${stats.rekapanTotalHarian}\n🕒 Jam: ${stats.terakhirBlast}\n━━━━━━━━━━━━━`, { parse_mode: 'Markdown' });
    }
    if (text === "♻️ RESTART") {
        await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2);
        bot.sendMessage(chatId, "♻️ **SYSTEM REBOOTED**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }
    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS**\n";
        for (let i=1; i<=2; i++) st += `${engines[i].color} Engine ${i}: ${engines[i].sock ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        bot.sendMessage(chatId, st, menuUtama);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "🔥 **NINJA STORM ULTIMATE**", menuUtama));
