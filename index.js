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
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false, config: { ev: 0, every: 0, delay: 0 }, step: null },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false, config: { ev: 0, every: 0, delay: 0 }, step: null }
};

const menuUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }]],
        resize_keyboard: true, one_time_keyboard: false
    }
};

async function cleanupEngine(chatId, id) {
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

async function initWA(chatId, id, silent = false) {
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
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                const sent = await bot.sendPhoto(chatId, buffer, { 
                    caption: `${engines[id].color} **SCAN QR ENGINE ${id}**`, 
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] }
                });
                engines[id].lastQrMsgId = sent.message_id;
            }

            if (connection === 'open') {
                engines[id].sock = sock;
                engines[id].isInitializing = false;
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                if (!silent) {
                    bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**`, {
                        reply_markup: { inline_keyboard: [[{ text: `🔍 SETUP FILTER & JAM`, callback_data: `start_filter_${id}` }]] }
                    });
                }
            }

            if (connection === 'close') {
                const sCode = lastDisconnect?.error?.output?.statusCode;
                if (sCode === DisconnectReason.loggedOut) {
                    if (fs.existsSync(engines[id].session)) fs.rmSync(engines[id].session, { recursive: true, force: true });
                    cleanupEngine(chatId, id);
                } else if (connection !== 'open') {
                    setTimeout(() => initWA(chatId, id, true), 5000);
                }
            }
        });
    } catch (err) { engines[id].isInitializing = false; }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data.startsWith('start_filter_')) {
        const id = q.data.split('_')[2];
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `⌨️ **SETUP ENGINE ${id}**\n━━━━━━━━━━━━━━\nMasukkan jumlah **ev num**:`);
    }

    if (q.data.startsWith('execute_filter_')) {
        const id = q.data.split('_')[2];
        const engine = engines[id];
        const conf = engine.config;
        
        if (!engine.sock) return bot.answerCallbackQuery(q.id, { text: "❌ Engine Offline!" });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').map(n => n.trim()).filter(n => n.length > 5).slice(0, conf.ev);
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            if (dataNomor.length === 0) throw new Error("File nomor kosong.");

            const statusMsg = await bot.sendMessage(chatId, `⏳ **MODE JAM AKTIF!**\n━━━━━━━━━━━━━━\nMemproses: \`${dataNomor.length}\` nomor.\nKecepatan: **Maksimal (Tanpa Jeda)**\nStatus: Sedang membanjiri antrean HP...`);

            // 1. LOCK: Matikan fungsi query agar pesan jadi JAM
            engine.sock.query = async () => { return true; }; 

            // 2. INJEKSI: Kirim semua serentak tanpa jeda (0 detik)
            for (let i = 0; i < dataNomor.length; i++) {
                let baris = dataNomor[i];
                let nomor = baris.replace(/[^0-9]/g, "");
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                let sapaan = baris.split(/[0-9]/)[0].trim() || "Kak";
                let pesan = ((i % 2 === 0) ? p1 : p2).replace(/{id}/g, sapaan);

                // Kirim langsung ke buffer tanpa 'await' untuk kecepatan instan
                engine.sock.sendMessage(jid, { text: pesan }).catch(() => {});
            }

            // 3. SELESAI & LEPAS BLOKIR
            await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
            
            bot.sendMessage(chatId, `✅ **NGEJAM SELESAI!**\n━━━━━━━━━━━━━━\nSemua \`${dataNomor.length}\` pesan sudah masuk antrean jam di HP.\n\n🚀 **MELEPAS JAM SEKARANG...**\nPesan akan segera terkirim serentak dari HP.`);

            stats.totalHariIni += dataNomor.length;
            stats.terakhirBlast = getWIBTime();
            saveStats();

            // Reconnect otomatis untuk memicu pengiriman centang 2
            await delay(1500); // Jeda sebentar agar buffer terakhir masuk sempurna
            initWA(chatId, id, true); 

        } catch (e) {
            bot.sendMessage(chatId, "❌ Error: " + e.message);
        }
    }

    if (q.data.startsWith('login_')) initWA(chatId, q.data.split('_')[1]);

    if (q.data === 'pilih_engine') {
        bot.editMessageText("📌 **PILIH ENGINE:**", { chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }], [{ text: "❌ BATAL", callback_data: "batal" }]] }
        });
    }

    if (q.data === 'batal') { 
        await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2); 
        bot.sendMessage(chatId, "✅ **SYSTEM RESET**", menuUtama);
    }
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
            if (engines[id].step === 'input_ev') {
                engines[id].config.ev = val; engines[id].step = 'input_every';
                return bot.sendMessage(chatId, `✅ ev: \`${val}\` - Masukkan **every**:`);
            } else if (engines[id].step === 'input_every') {
                engines[id].config.every = val; engines[id].step = 'input_delay';
                return bot.sendMessage(chatId, `✅ every: \`${val}\` - Masukkan **delay**:`);
            } else if (engines[id].step === 'input_delay') {
                engines[id].config.delay = val; engines[id].step = null;
                return bot.sendMessage(chatId, `⚙️ **SETTING SELESAI**`, {
                    reply_markup: { inline_keyboard: [[{ text: "🚀 JALANKAN JAM & KIRIM", callback_data: `execute_filter_${id}` }]] }
                });
            }
        }
    }

    if (text === "📊 LAPORAN HARIAN") bot.sendMessage(chatId, `📊 **LAPORAN**\n🕒 Terakhir: ${stats.terakhirBlast}\n🚀 Total: \`${stats.totalHariIni}\``, { parse_mode: 'Markdown' });
    if (text === "♻️ RESTART") {
        await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2);
        bot.sendMessage(chatId, "♻️ **SYSTEM RESTART**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }
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
