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

// Fungsi Spintax: Mengubah {Halo|Hai} menjadi salah satu secara acak
function decodeSpintax(text) {
    return text.replace(/{([^{}]+)}/g, (match, options) => {
        const choices = options.split('|');
        return choices[Math.floor(Math.random() * choices.length)];
    });
}

const menuUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }]],
        resize_keyboard: true, one_time_keyboard: false
    }
};

// --- CLEANUP & INIT ---
async function cleanupEngine(chatId, id) {
    if (engines[id].qrTimeout) { clearTimeout(engines[id].qrTimeout); engines[id].qrTimeout = null; }
    if (engines[id].lastQrMsgId) { await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {}); engines[id].lastQrMsgId = null; }
    if (engines[id].sock) {
        try {
            engines[id].sock.ev.removeAllListeners('connection.update');
            engines[id].sock.end();
            engines[id].sock = null;
        } catch (e) {}
    }
    engines[id].isInitializing = false;
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
            browser: ["Ninja Storm", "Chrome", "122.0.6261.112"], // Versi terbaru agar lebih human
            printQRInTerminal: false
        });

        sock.ev.on('creds.update', saveCreds);

        // Tracker Real Terkirim dari HP
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
            const { connection, qr } = u;
            if (qr && engines[id].isInitializing) {
                const buffer = await QRCode.toBuffer(qr, { scale: 3 });
                if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                const sent = await bot.sendPhoto(chatId, buffer, { caption: `🌪 ENGINE ${id} READY TO SCAN` });
                engines[id].lastQrMsgId = sent.message_id;
            }
            if (connection === 'open') {
                await cleanupEngine(chatId, id);
                engines[id].sock = sock;
                bot.sendMessage(chatId, `✅ ENGINE ${id} ONLINE!`, { reply_markup: { inline_keyboard: [[{ text: "🔍 FILTER", callback_data: `start_filter_${id}` }]] } });
            }
        });
    } catch (e) { engines[id].isInitializing = false; }
}

// --- LOGIKA BLAST MELEDAK ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data.startsWith('jalan_blast_')) {
        const id = q.data.split('_')[2];
        const sock = engines[id].sock;
        if (!sock) return bot.answerCallbackQuery(q.id, { text: "Offline!" });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "");
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            bot.sendMessage(chatId, `🔥 **ADAPTIVE BURST MODE**\nEngine: ${id}\nTarget: ${dataNomor.length} nomor`);

            // Strategi: Batch 10 nomor secepat kilat, jeda 100ms
            const batchSize = 10;
            for (let i = 0; i < dataNomor.length; i += batchSize) {
                const batch = dataNomor.slice(i, i + batchSize);
                
                batch.forEach((baris, index) => {
                    const globalIndex = i + index;
                    let nomor = baris.replace(/[^0-9]/g, "");
                    if (nomor.length < 9) return;
                    let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                    let sapaan = baris.split(/[0-9]/)[0].trim() || "";
                    
                    // Script Ganjil Genap + Spintax
                    let rawText = (globalIndex % 2 === 0) ? p1 : p2;
                    let finalPesan = decodeSpintax(rawText.replace(/{id}/g, sapaan));

                    sock.sendMessage(jid, { text: finalPesan }).catch(() => {});
                });

                // Jeda mikro agar antrian HP tidak hang (Hanya 0.1 detik)
                await delay(100);
            }
            bot.sendMessage(chatId, `🚀 BLAST SELESAI! Cek laporan harian.`);
        } catch (e) { bot.sendMessage(chatId, "File Error!"); }
    }

    if (q.data.startsWith('login_')) {
        const id = q.data.split('_')[1];
        await bot.editMessageText(`⏳ Menyiapkan Engine ${id}...`, { chat_id: chatId, message_id: msgId });
        initWA(chatId, id, msgId);
    }

    if (q.data === 'pilih_engine') {
        bot.editMessageText("📌 PILIH ENGINE:", { chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }], [{ text: "❌ BATAL", callback_data: "batal" }]] }
        });
    }

    if (q.data.startsWith('start_filter_')) {
        const id = q.data.split('_')[2];
        const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "");
        bot.sendMessage(chatId, `🔍 FILTER ENGINE ${id}: ${dataNomor.length} Nomor`, {
            reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN", callback_data: `jalan_blast_${id}` }]] }
        });
    }
});

// --- KEYBOARD MENU ---
bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **REKAPAN HP**\n━━━━━━━━━━━━\n🔥 Hari Ini: ${stats.totalHariIni}\n📈 Total: ${stats.rekapanTotalHarian}\n🕒 Terakhir: ${stats.terakhirBlast}\n━━━━━━━━━━━━`);
    }
    if (text === "♻️ RESTART") {
        await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2);
        bot.sendMessage(chatId, "♻️ SYSTEM RESET", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }
    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS**\n";
        for (let i=1; i<=2; i++) st += `Engine ${i}: ${engines[i].sock ? "✅" : "❌"}\n`;
        bot.sendMessage(chatId, st, menuUtama);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ ONLINE!", menuUtama));
