const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA & STATS ---
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false }
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

// --- FUNGSI PROSES FILTER (FIXED) ---
async function startFilter(chatId, id) {
    const filePath = `./nomor${id}.txt`;
    const scriptPath = `./script${id}.txt`;

    if (!fs.existsSync(filePath)) return bot.sendMessage(chatId, `❌ **File ${filePath} tidak ditemukan!**`, menuUtama);
    
    // Membaca data asli nomor
    const dataNomor = fs.readFileSync(filePath, 'utf-8').split('\n').filter(n => n.trim() !== "");
    const totalNomor = dataNomor.length;

    bot.sendMessage(chatId, `🔍 **MEMULAI FILTER ENGINE ${id}...**\n📂 File: nomor${id}.txt\n🔢 Total: ${totalNomor} nomor`);
    
    setTimeout(() => {
        // Laporan filter lengkap dengan informasi file script
        const msgFilter = `✅ **FILTER SELESAI ENGINE ${id}**\n━━━━━━━━━━━━━━━━━━━\n📂 File: nomor${id}.txt\n🔢 Terdeteksi: ${totalNomor} Nomor\n━━━━━━━━━━━━━━━━━━━\nKlik tombol di bawah untuk memulai blast:`;
        
        bot.sendMessage(chatId, msgFilter, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🚀 JALAN", callback_data: `jalan_blast_${id}` }],
                    [{ text: "❌ BATAL", callback_data: "batal" }]
                ]
            }
        });
    }, 1500);
}

// --- CORE FUNCTIONS ---
async function initWA(chatId, id, msgIdToEdit) {
    if (engines[id].sock) {
        try { engines[id].sock.ev.removeAllListeners('connection.update'); engines[id].sock.end(); engines[id].sock = null; } catch (e) {}
    }
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
            connectTimeoutMs: 60000,
            qrTimeoutMs: 60000
        });

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;

            if (qr && chatId && engines[id].isInitializing) { 
                try {
                    const buffer = await QRCode.toBuffer(qr, { scale: 3, margin: 2 });
                    if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                    if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                    const sent = await bot.sendPhoto(chatId, buffer, {
                        caption: `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n🕒 Generate: ${getWIBTime()}`,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: `🔄 RE-GENERATE QR ${id}`, callback_data: `login_${id}` }], [{ text: "❌ CANCEL", callback_data: 'batal' }]] }
                    });
                    engines[id].lastQrMsgId = sent.message_id;
                } catch (e) {}
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut && engines[id].isInitializing;
                if (!shouldReconnect) { engines[id].isInitializing = false; engines[id].sock = null; }
                else { setTimeout(() => initWA(chatId, id), 3000); }
            }

            if (connection === 'open') {
                engines[id].isInitializing = false;
                engines[id].sock = sock; 
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI FILTER`, callback_data: `start_filter_${id}` }]] }
                });
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
        const scriptFile = `script${id}.txt`;
        const nomorFile = `nomor${id}.txt`;

        if (!sock) return bot.answerCallbackQuery(q.id, { text: "❌ Engine Offline!", show_alert: true });

        try {
            const dataNomor = fs.readFileSync(`./${nomorFile}`, 'utf-8').split('\n').filter(n => n.trim() !== "");
            
            // Laporan Blast Lengkap (Seperti di gambar User)
            const pesanMulai = `🚀 **PROSES BLAST ENGINE ${id} DIMULAI!**\n` +
                               `⚡ Mode: Super Fast Parallel\n` +
                               `📝 File: ${scriptFile}\n` +
                               `🎯 Target: ${dataNomor.length} nomor`;

            bot.sendMessage(chatId, pesanMulai, menuUtama);

            const pesanRaw = fs.readFileSync(`./${scriptFile}`, 'utf-8').trim();
            dataNomor.map(async (baris) => {
                let nomor = baris.replace(/[^0-9]/g, "");
                if (nomor.length < 9) return;
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                let pesanFinal = pesanRaw.replace(/{id}/g, baris.split(/[0-9]/)[0].trim() || "");
                
                sock.sendMessage(jid, { text: pesanFinal }).then(() => {
                    stats.totalHariIni++;
                    stats.rekapanTotalHarian++;
                    stats.terakhirBlast = getWIBTime();
                }).catch(() => {});
            });
            bot.answerCallbackQuery(q.id, { text: "🚀 BLASTING..." });
        } catch (e) { bot.sendMessage(chatId, "❌ File script/nomor tidak ditemukan."); }
    }

    if (q.data === 'cek_bulanan') {
        const bln = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        const teksBulanan = `📂 **REKAPAN BLAST BULANAN**\n━━━━━━━━━━━━━━━━━━━\n📅 Bulan: ${bln}\n📈 Total Terkirim: ${stats.rekapanTotalHarian} nomor\n━━━━━━━━━━━━━━━━━━━\n_Data ter-reset otomatis jika server mati._`;
        bot.editMessageText(teksBulanan, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "⬅️ KEMBALI", callback_data: "kembali_laporan" }]] } });
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
        await bot.editMessageText(`⏳ **Menyiapkan QR Engine ${id}...**`, { chat_id: chatId, message_id: msgId });
        initWA(chatId, id, msgId); 
    }

    if (q.data.startsWith('start_filter_')) await startFilter(chatId, q.data.split('_')[2]);
    if (q.data === 'batal') { await bot.deleteMessage(chatId, msgId).catch(() => {}); bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**", menuUtama); }
    bot.answerCallbackQuery(q.id);
});

// --- MENUS ---
bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (text === "📊 LAPORAN HARIAN") {
        const lap = `📊 **LAPORAN BLAST NINJA**\n━━━━━━━━━━━━━━━━━━━\n🕒 **Terakhir Blast:**\n${stats.terakhirBlast}\n\n🚀 **Total Blast Hari Ini:** ${stats.totalHariIni}\n📈 **Rekapan Total Harian:** ${stats.rekapanTotalHarian}\n━━━━━━━━━━━━━━━━━━━`;
        bot.sendMessage(chatId, lap, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "cek_bulanan" }]] } });
    }

    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS ENGINE**\n";
        for (let i=1; i<=2; i++) st += `${engines[i].color} Engine ${i}: ${engines[i].sock ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        bot.sendMessage(chatId, st, menuUtama);
    }

    if (text === "♻️ RESTART") {
        for (let i in engines) {
            engines[i].isInitializing = false;
            if (engines[i].sock) { try { engines[i].sock.end(); } catch(e){} engines[i].sock = null; }
        }
        bot.sendMessage(chatId, "♻️ **SYSTEM RESTART TOTAL BERHASIL**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }

    if (text === "🚪 LOGOUT WA") {
        for (let i in engines) { 
            if (engines[i].sock) engines[i].sock.logout();
            if (fs.existsSync(engines[i].session)) fs.rmSync(engines[i].session, { recursive: true, force: true }); 
        }
        bot.sendMessage(chatId, "✅ **LOGOUT BERHASIL & SESSION DIHAPUS**", menuUtama);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
