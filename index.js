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

// --- FUNGSI PROSES FILTER ---
async function startFilter(chatId, id) {
    const filePath = `./nomor${id}.txt`;
    if (!fs.existsSync(filePath)) return bot.sendMessage(chatId, `❌ **File ${filePath} tidak ditemukan!**`, menuUtama);

    const dataNomor = fs.readFileSync(filePath, 'utf-8').split('\n').filter(n => n.trim() !== "");
    if (dataNomor.length === 0) return bot.sendMessage(chatId, `❌ **File ${filePath} kosong!**`, menuUtama);

    bot.sendMessage(chatId, `🔍 **MEMULAI FILTER ENGINE ${id}...**\n📂 File: nomor${id}.txt\n🔢 Total: ${dataNomor.length} nomor`, menuUtama);
    
    setTimeout(() => {
        bot.sendMessage(chatId, `✅ **FILTER SELESAI ENGINE ${id}**\n━━━━━━━━━━━━━━━━━━━\n📂 File: nomor${id}.txt\n🔢 Terdeteksi: ${dataNomor.length} Nomor\n━━━━━━━━━━━━━━━━━━━\nKlik tombol di bawah untuk memulai blast:`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🚀 JALAN", callback_data: `jalan_blast_${id}` }],
                    [{ text: "❌ BATAL", callback_data: "batal" }]
                ]
            }
        });
    }, 2000);
}

// --- CORE FUNCTIONS ---
async function initWA(chatId, id, msgIdToEdit) {
    if (engines[id].isInitializing) return;
    engines[id].isInitializing = true;

    try {
        if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ninja Storm", "Chrome", "1.0.0"],
            printQRInTerminal: false,
            syncFullHistory: false, 
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000
        });

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;

            // Proteksi: Hanya kirim QR jika isInitializing masih TRUE
            if (qr && chatId && engines[id].isInitializing) { 
                try {
                    const buffer = await QRCode.toBuffer(qr, { scale: 5 });
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
                // Jangan reconnect jika status isInitializing sudah FALSE (akibat Restart)
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut && engines[id].isInitializing;
                if (!shouldReconnect) {
                    engines[id].isInitializing = false;
                    engines[id].sock = null;
                } else {
                    setTimeout(() => initWA(chatId, id), 3000);
                }
            }

            if (connection === 'open') {
                engines[id].isInitializing = false;
                engines[id].sock = sock; 
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} BERHASIL TERHUBUNG!**`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI FILTER (nomor${id}.txt)`, callback_data: `start_filter_${id}` }]] }
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
        const scriptFile = `./script${id}.txt`;
        const nomorFile = `./nomor${id}.txt`;

        if (!sock) return bot.answerCallbackQuery(q.id, { text: "❌ Engine Offline! Login ulang.", show_alert: true });

        try {
            if (!fs.existsSync(scriptFile)) return bot.sendMessage(chatId, `❌ File ${scriptFile} tidak ada!`);
            const pesanRaw = fs.readFileSync(scriptFile, 'utf-8').trim();
            const dataBaris = fs.readFileSync(nomorFile, 'utf-8').split('\n').filter(n => n.trim() !== "");

            bot.answerCallbackQuery(q.id, { text: "🚀 FIRE!!! PARALEL MODE 🔥" });
            bot.sendMessage(chatId, `🚀 **PROSES BLAST ENGINE ${id} DIMULAI!**\n⚡ Mode: Super Fast Parallel\n📝 File: script${id}.txt\n🎯 Target: ${dataBaris.length} nomor`, menuUtama);

            dataBaris.map(async (baris) => {
                let nomorHanyaAngka = baris.replace(/[^0-9]/g, ""); 
                if (nomorHanyaAngka.length < 9) return; 

                let jid = nomorHanyaAngka;
                if (jid.startsWith('0')) jid = '62' + jid.slice(1);
                if (!jid.startsWith('62')) jid = '62' + jid;
                jid += '@s.whatsapp.net';

                let pesanFinal = pesanRaw;
                let namaUser = baris.split(/[0-9]/)[0].trim(); 
                if (namaUser) pesanFinal = pesanRaw.replace(/{id}/g, namaUser);

                sock.sendMessage(jid, { text: pesanFinal }).then(() => {
                    stats.totalHariIni++;
                    stats.rekapanTotalHarian++;
                    stats.terakhirBlast = getWIBTime();
                }).catch(() => {});
            });
        } catch (e) { bot.sendMessage(chatId, "❌ Error teknis saat membaca file."); }
    }

    // HANDLER REKAPAN BULANAN (Agar tombol berfungsi)
    if (q.data === 'cek_bulanan') {
        const bln = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        bot.sendMessage(chatId, `📂 **REKAPAN BLAST BULANAN**\n━━━━━━━━━━━━━━━━━━━\n📅 Bulan: ${bln}\n📈 Total Terkirim: ${stats.rekapanTotalHarian} nomor\n━━━━━━━━━━━━━━━━━━━\n_Data ter-reset otomatis jika server mati._`, { parse_mode: 'Markdown' });
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
    if (q.data.startsWith('start_filter_')) {
        bot.answerCallbackQuery(q.id, { text: "Memulai Filter..." });
        await startFilter(chatId, q.data.split('_')[2]);
    }
    if (q.data === 'batal') { await bot.deleteMessage(chatId, msgId).catch(() => {}); bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**", menuUtama); }
    bot.answerCallbackQuery(q.id);
});

// --- MENUS ---
bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (text === "♻️ RESTART") {
        for (let i in engines) { 
            engines[i].isInitializing = false; // KUNCI UTAMA: Stop inisialisasi
            if (engines[i].sock) { 
                try { 
                    engines[i].sock.ev.removeAllListeners('connection.update'); // Hapus listener agar tidak reconnect otomatis
                    engines[i].sock.end(); 
                } catch(e){} 
                engines[i].sock = null; 
            } 
            if (engines[i].lastQrMsgId) {
                bot.deleteMessage(chatId, engines[i].lastQrMsgId).catch(() => {});
                engines[i].lastQrMsgId = null;
            }
        }
        bot.sendMessage(chatId, "♻️ **SYSTEM RESTART TOTAL BERHASIL**\nSemua koneksi diputus & status dibersihkan.\nKlik login jika ingin mulai ulang.", { 
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } 
        });
    }

    if (text === "📊 LAPORAN HARIAN") {
        const laporanTeks = `📊 **LAPORAN BLAST NINJA**\n━━━━━━━━━━━━━━━━━━━\n` +
                            `🕒 **Terakhir Blast:**\n${stats.terakhirBlast}\n\n` +
                            `🚀 **Total Blast Hari Ini:** ${stats.totalHariIni}\n` +
                            `📈 **Rekapan Total Harian:** ${stats.rekapanTotalHarian}\n` +
                            `━━━━━━━━━━━━━━━━━━━`;
        
        bot.sendMessage(chatId, laporanTeks, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: "📂 LIHAT REKAPAN BULANAN", callback_data: "cek_bulanan" }]]
            }
        });
    }

    if (text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **STATUS ENGINE**\n";
        for (let i=1; i<=2; i++) status += `${engines[i].color} Engine ${i}: ${engines[i].sock ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        bot.sendMessage(chatId, status, menuUtama);
    }
    if (text === "🚪 LOGOUT WA") {
        for (let i in engines) { 
            engines[i].isInitializing = false;
            if (engines[i].sock) engines[i].sock.logout();
            if (fs.existsSync(engines[i].session)) fs.rmSync(engines[i].session, { recursive: true, force: true }); 
        }
        bot.sendMessage(chatId, "✅ **LOGOUT BERHASIL & SESSION DIHAPUS**", menuUtama);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
