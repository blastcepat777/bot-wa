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

// --- FUNGSI MEMBERSIHKAN ENGINE (BERSIH TOTAL) ---
async function cleanupEngine(chatId, id) {
    // 1. Matikan Timeout QR agar tidak auto-refresh sendiri
    if (engines[id].qrTimeout) {
        clearTimeout(engines[id].qrTimeout);
        engines[id].qrTimeout = null;
    }
    
    // 2. Hapus Pesan QR lama di Telegram agar chat bersih
    if (engines[id].lastQrMsgId) {
        await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
        engines[id].lastQrMsgId = null;
    }

    // 3. Putus Koneksi Socket & Hapus Listeners
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

// --- CORE KONEKSI ---
async function initWA(chatId, id, msgIdToEdit) {
    // Jalankan pembersihan total sebelum mulai yang baru
    await cleanupEngine(chatId, id);
    engines[id].isInitializing = true;

    try {
        if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version, auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ninja Storm", "Chrome", "1.0.0"],
            printQRInTerminal: false,
            connectTimeoutMs: 60000
        });

        sock.ev.on('creds.update', saveCreds);

        // Tracker Real-Time dari HP
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

            // Logika QR: Update pesan yang sama, bukan kirim baru terus
            if (qr && engines[id].isInitializing) { 
                try {
                    const buffer = await QRCode.toBuffer(qr, { scale: 3, margin: 2 });
                    
                    // Jika ada pesan status (Sedang menyiapkan...), hapus dulu
                    if (msgIdToEdit) { 
                        await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); 
                        msgIdToEdit = null; 
                    }

                    // Hapus QR lama sebelum kirim yang baru (Double Check)
                    if (engines[id].lastQrMsgId) {
                        await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                    }
                    
                    const sent = await bot.sendPhoto(chatId, buffer, {
                        caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n🕒 ${getWIBTime()}\n⚠️ *Barcode akan refresh jika tidak di-scan.*`,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] }
                    });
                    engines[id].lastQrMsgId = sent.message_id;

                    // Timeout refresh QR
                    clearTimeout(engines[id].qrTimeout);
                    engines[id].qrTimeout = setTimeout(() => {
                        if (engines[id].isInitializing) initWA(chatId, id);
                    }, 45000); 
                } catch (e) {}
            }

            if (connection === 'open') {
                await cleanupEngine(chatId, id); // Bersihkan sisa QR
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
                    // Reconnect hanya jika memang sedang dalam proses login
                    setTimeout(() => initWA(chatId, id), 5000);
                }
            }
        });
    } catch (err) { engines[id].isInitializing = false; }
}

// --- BUTTON LOGIC ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data.startsWith('jalan_blast_')) {
        const id = q.data.split('_')[2];
        const sock = engines[id].sock;
        if (!sock) return bot.answerCallbackQuery(q.id, { text: "❌ Engine Offline!", show_alert: true });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "");
            const pesan1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const pesan2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            bot.sendMessage(chatId, `🚀 **FIRE MODE ACTIVATED!**\n🔄 Ganjil-Genap Spek Balap\n🎯 Target: ${dataNomor.length} nomor`, menuUtama);

            dataNomor.forEach((baris, index) => {
                let nomor = baris.replace(/[^0-9]/g, "");
                if (nomor.length < 9) return;
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                let sapaan = baris.split(/[0-9]/)[0].trim() || "";
                const textPesan = (index % 2 === 0) ? pesan1 : pesan2;
                // Fire and Forget
                sock.sendMessage(jid, { text: textPesan.replace(/{id}/g, sapaan) }).catch(() => {});
            });
        } catch (e) { bot.sendMessage(chatId, "❌ Cek file script/nomor."); }
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

    if (q.data.startsWith('start_filter_')) {
        const id = q.data.split('_')[2];
        const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "");
        bot.sendMessage(chatId, `🔍 **FILTER ENGINE ${id}...**\n🔢 Total: ${dataNomor.length} nomor`);
        setTimeout(() => {
            bot.sendMessage(chatId, `✅ **FILTER SELESAI**`, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN", callback_data: `jalan_blast_${id}` }], [{ text: "❌ BATAL", callback_data: "batal" }]] }
            });
        }, 1500);
    }

    if (q.data === 'batal' || q.data === 'kembali_laporan') {
        if (q.data === 'batal') await cleanupEngine(chatId, 1), await cleanupEngine(chatId, 2);
        await bot.deleteMessage(chatId, msgId).catch(() => {});
        bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**", menuUtama);
    }
    
    if (q.data === 'cek_bulanan') {
        bot.editMessageText(`📂 **REKAPAN BLAST BULANAN**\n━━━━━━━━━━━━━━━━━━━\n📈 Total Terkirim (HP): ${stats.rekapanTotalHarian}\n━━━━━━━━━━━━━━━━━━━`, {
            chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "⬅️ KEMBALI", callback_data: "batal" }]] }
        });
    }
    bot.answerCallbackQuery(q.id);
});

// --- KEYBOARD MENU ---
bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (text === "📊 LAPORAN HARIAN") {
        const lap = `📊 **LAPORAN BLAST NINJA**\n━━━━━━━━━━━━━━━━━━━\n🕒 **Terakhir Blast:**\n${stats.terakhirBlast}\n\n🚀 **Total Blast Hari Ini:** ${stats.totalHariIni}\n📈 **Rekapan Total Harian:** ${stats.rekapanTotalHarian}\n━━━━━━━━━━━━━━━━━━━`;
        bot.sendMessage(chatId, lap, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "cek_bulanan" }]] } });
    }
    if (text === "♻️ RESTART") {
        await cleanupEngine(chatId, 1);
        await cleanupEngine(chatId, 2);
        bot.sendMessage(chatId, "♻️ **SYSTEM RESTART**\nSemua antrian QR & koneksi telah dibersihkan.", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }
    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS ENGINE**\n";
        for (let i=1; i<=2; i++) {
            const isOnline = engines[i].sock && engines[i].sock.user;
            st += `${engines[i].color} Engine ${i}: ${isOnline ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        }
        bot.sendMessage(chatId, st, menuUtama);
    }
    if (text === "🚪 LOGOUT WA") {
        for (let i=1; i<=2; i++) {
            await cleanupEngine(chatId, i);
            if (fs.existsSync(engines[i].session)) fs.rmSync(engines[i].session, { recursive: true, force: true });
        }
        bot.sendMessage(chatId, "✅ **LOGOUT BERHASIL**", menuUtama);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
