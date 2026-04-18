const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, delay } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA & STATS ---
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false, qrTimeout: null },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false, qrTimeout: null }
};

let stats = {
    totalHariIni: 0,
    rekapanTotalHarian: 0, 
    terakhirBlast: "-"
};

const getWIBTime = () => {
    return new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";
};

const menuUtama = {
    reply_markup: {
        keyboard: [
            [{ text: "♻️ RESTART" }], 
            [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }] 
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

// --- FUNGSI MEMBERSIHKAN ENGINE (FOR LOGOUT/RESTART) ---
async function clearEngine(id) {
    if (engines[id].qrTimeout) clearTimeout(engines[id].qrTimeout);
    if (engines[id].sock) {
        try {
            engines[id].sock.ev.removeAllListeners('connection.update');
            engines[id].sock.ev.removeAllListeners('creds.update');
            engines[id].sock.end();
            engines[id].sock = null;
        } catch (e) {}
    }
    engines[id].isInitializing = false;
}

// --- CORE KONEKSI ---
async function initWA(chatId, id, msgIdToEdit) {
    await clearEngine(id); // Pastikan engine bersih sebelum mulai

    try {
        if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version, auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ninja Storm", "Chrome", "1.0.0"],
            printQRInTerminal: false,
            connectTimeoutMs: 60000,
            // Menghindari socket gantung
            keepAliveIntervalMs: 30000 
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;

            // QR LOGIC
            if (qr && !engines[id].sock) { 
                try {
                    const buffer = await QRCode.toBuffer(qr, { scale: 3, margin: 2 });
                    if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                    if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                    
                    const sent = await bot.sendPhoto(chatId, buffer, {
                        caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n\n🕒 ${getWIBTime()}`,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: "❌ CANCEL", callback_data: 'batal' }]] }
                    });
                    engines[id].lastQrMsgId = sent.message_id;

                    clearTimeout(engines[id].qrTimeout);
                    engines[id].qrTimeout = setTimeout(() => initWA(chatId, id), 55000);
                } catch (e) {}
            }

            if (connection === 'open') {
                clearTimeout(engines[id].qrTimeout);
                engines[id].sock = sock; 
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} BERHASIL TERHUBUNG!**`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI FILTER`, callback_data: `start_filter_${id}` }]] }
                });
            }

            if (connection === 'close') {
                const sCode = lastDisconnect?.error?.output?.statusCode;
                // Jika logout dari HP, hapus session permanen
                if (sCode === DisconnectReason.loggedOut) {
                    await clearEngine(id);
                    if (fs.existsSync(engines[id].session)) fs.rmSync(engines[id].session, { recursive: true, force: true });
                    bot.sendMessage(chatId, `⚠️ **ENGINE ${id} TERPUTUS (LOGOUT DARI HP)**`);
                } else {
                    // Reconnect otomatis jika bukan logout
                    setTimeout(() => initWA(chatId, id), 5000);
                }
            }
        });
    } catch (err) { console.log(err); }
}

// --- BUTTON & MESSAGE LOGIC ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data.startsWith('jalan_blast_')) {
        const id = q.data.split('_')[2];
        const sock = engines[id].sock;
        if (!sock || !sock.user) return bot.answerCallbackQuery(q.id, { text: "❌ WA Belum Login!", show_alert: true });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "");
            const pesan1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const pesan2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            bot.sendMessage(chatId, `🚀 **BLAST ENGINE ${id} JALAN...**`, menuUtama);

            for (let baris of dataNomor) {
                let nomor = baris.replace(/[^0-9]/g, "");
                if (nomor.length < 9) continue;
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                let sapaan = baris.split(/[0-9]/)[0].trim() || "";

                await sock.sendMessage(jid, { text: pesan1.replace(/{id}/g, sapaan) }).catch(() => {});
                await delay(800);
                await sock.sendMessage(jid, { text: pesan2.replace(/{id}/g, sapaan) }).then(() => {
                    stats.totalHariIni++;
                    stats.rekapanTotalHarian++;
                    stats.terakhirBlast = getWIBTime();
                }).catch(() => {});
                await delay(1500);
            }
        } catch (e) { bot.sendMessage(chatId, "❌ File Error."); }
    }

    if (q.data === 'cek_bulanan') {
        const bln = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        bot.editMessageText(`📂 **REKAPAN BLAST BULANAN**\n━━━━━━━━━━━━━━━━━━━\n📅 Bulan: ${bln}\n📈 Total Terkirim: ${stats.rekapanTotalHarian} nomor\n━━━━━━━━━━━━━━━━━━━`, {
            chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "⬅️ KEMBALI", callback_data: "kembali_laporan" }]] }
        });
    }

    if (q.data === 'kembali_laporan') {
        const lap = `📊 **LAPORAN BLAST NINJA**\n━━━━━━━━━━━━━━━━━━━\n🕒 **Terakhir Blast:**\n${stats.terakhirBlast}\n\n🚀 **Total Blast Hari Ini:** ${stats.totalHariIni}\n📈 **Rekapan Total Harian:** ${stats.rekapanTotalHarian}\n━━━━━━━━━━━━━━━━━━━`;
        bot.editMessageText(lap, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "cek_bulanan" }]] } });
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
        bot.sendMessage(chatId, `✅ **FILTER SELESAI ENGINE ${id}**\n🔢 Terdeteksi: ${dataNomor.length} Nomor`, {
            reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN", callback_data: `jalan_blast_${id}` }], [{ text: "❌ BATAL", callback_data: "batal" }]] }
        });
    }

    if (q.data === 'batal') { await bot.deleteMessage(chatId, msgId).catch(() => {}); bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**", menuUtama); }
    bot.answerCallbackQuery(q.id);
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS ENGINE**\n━━━━━━━━━━━━━━━━━━━\n";
        for (let i = 1; i <= 2; i++) {
            // Cek apakah socket aktif DAN user-nya terdaftar (Akurat)
            const isOnline = engines[i].sock && engines[i].sock.user;
            st += `${engines[i].color} Engine ${i}: ${isOnline ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        }
        bot.sendMessage(chatId, st, menuUtama);
    }

    if (text === "🚪 LOGOUT WA") {
        for (let i in engines) {
            await clearEngine(i); // Matikan socket
            if (fs.existsSync(engines[i].session)) fs.rmSync(engines[i].session, { recursive: true, force: true });
        }
        bot.sendMessage(chatId, "✅ **LOGOUT TOTAL BERHASIL!**\nSemua session telah dihapus.", menuUtama);
    }

    if (text === "📊 LAPORAN HARIAN") {
        const lap = `📊 **LAPORAN BLAST NINJA**\n━━━━━━━━━━━━━━━━━━━\n🕒 **Terakhir Blast:**\n${stats.terakhirBlast}\n\n🚀 **Total Blast Hari Ini:** ${stats.totalHariIni}\n📈 **Rekapan Total Harian:** ${stats.rekapanTotalHarian}\n━━━━━━━━━━━━━━━━━━━`;
        bot.sendMessage(chatId, lap, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "cek_bulanan" }]] } });
    }

    if (text === "♻️ RESTART") {
        bot.sendMessage(chatId, "♻️ **SYSTEM RESTART**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
