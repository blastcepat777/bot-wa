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

// --- FUNGSI FILTER ---
async function startFilter(chatId, id) {
    const nomorFile = `nomor${id}.txt`;
    if (!fs.existsSync(`./${nomorFile}`)) return bot.sendMessage(chatId, `❌ **File ${nomorFile} tidak ditemukan!**`, menuUtama);
    
    const dataNomor = fs.readFileSync(`./${nomorFile}`, 'utf-8').split('\n').filter(n => n.trim() !== "");
    const total = dataNomor.length;

    bot.sendMessage(chatId, `🔍 **MEMULAI FILTER ENGINE ${id}...**\n📂 File: ${nomorFile}\n🔢 Total: ${total} nomor`);
    
    setTimeout(() => {
        const msgFilter = `✅ **FILTER SELESAI ENGINE ${id}**\n━━━━━━━━━━━━━━━━━━━\n📂 File: ${nomorFile}\n🔢 Terdeteksi: ${total} Nomor\n━━━━━━━━━━━━━━━━━━━\n**MODE: Random Script (Pesan 1 / 2)**`;
        
        bot.sendMessage(chatId, msgFilter, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🚀 JALAN (Random Script)", callback_data: `jalan_random_${id}` }],
                    [{ text: "❌ BATAL", callback_data: "batal" }]
                ]
            }
        });
    }, 1500);
}

// --- CORE KONEKSI ---
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
            printQRInTerminal: false
        });

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (u) => {
            const { connection, qr } = u;
            if (qr && chatId && engines[id].isInitializing) { 
                try {
                    const buffer = await QRCode.toBuffer(qr, { scale: 3, margin: 2 });
                    if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                    if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                    const sent = await bot.sendPhoto(chatId, buffer, {
                        caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n\n🕒 ${getWIBTime()}`,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: `🔄 RE-GENERATE QR ${id}`, callback_data: `login_${id}` }], [{ text: "❌ CANCEL", callback_data: 'batal' }]] }
                    });
                    engines[id].lastQrMsgId = sent.message_id;
                } catch (e) {}
            }
            if (connection === 'open') {
                engines[id].sock = sock; engines[id].isInitializing = false;
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**`, {
                    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI FILTER`, callback_data: `start_filter_${id}` }]] }
                });
            }
        });
    } catch (err) { engines[id].isInitializing = false; }
}

// --- LOGIKA TOMBOL ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data.startsWith('jalan_random_')) {
        const id = q.data.split('_')[2];
        const sock = engines[id].sock;
        const nomorFile = `nomor${id}.txt`;

        if (!sock) return bot.answerCallbackQuery(q.id, { text: "❌ Engine Offline!", show_alert: true });

        try {
            const dataNomor = fs.readFileSync(`./${nomorFile}`, 'utf-8').split('\n').filter(n => n.trim() !== "");
            const pesan1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const pesan2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();
            const poolPesan = [pesan1, pesan2]; // Daftar pesan yang akan diacak

            const pesanMulai = `🚀 **PROSES BLAST ENGINE ${id} DIMULAI!**\n` +
                               `⚡ Mode: Random Script (Anti-Banned)\n` +
                               `📝 Pool: script1.txt & script2.txt\n` +
                               `🎯 Target: ${dataNomor.length} nomor (File: ${nomorFile})`;

            bot.sendMessage(chatId, pesanMulai, menuUtama);

            dataNomor.map(async (baris) => {
                let nomor = baris.replace(/[^0-9]/g, "");
                if (nomor.length < 9) return;
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                
                // Ambil sapaan {id}
                let sapaan = baris.split(/[0-9]/)[0].trim() || "";
                
                // LOGIKA RANDOM: Pilih salah satu dari poolPesan
                let pesanDipilih = poolPesan[Math.floor(Math.random() * poolPesan.length)];
                let pesanFinal = pesanDipilih.replace(/{id}/g, sapaan);

                sock.sendMessage(jid, { text: pesanFinal }).then(() => {
                    stats.totalHariIni++;
                    stats.rekapanTotalHarian++;
                    stats.terakhirBlast = getWIBTime();
                }).catch(() => {});
            });
            bot.answerCallbackQuery(q.id, { text: `🚀 BLASTING WITH RANDOM SCRIPT!` });
        } catch (e) { bot.sendMessage(chatId, `❌ Gagal memuat file script atau ${nomorFile}.`); }
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

// --- MENU PESAN ---
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
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
