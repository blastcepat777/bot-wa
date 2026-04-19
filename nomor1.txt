const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, delay } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- STORAGE ---
const STATS_FILE = './stats.json';
const REKAP_DIR = './rekap_bulanan';
if (!fs.existsSync(REKAP_DIR)) fs.mkdirSync(REKAP_DIR, { recursive: true });

let stats = { totalHariIni: 0, terakhirBlast: "-" };
if (fs.existsSync(STATS_FILE)) {
    try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch (e) {}
}

const saveStats = (count) => {
    const sekarang = new Date();
    const tgl = sekarang.toISOString().split('T')[0]; 
    const bln = tgl.slice(0, 7); 
    stats.totalHariIni += count;
    stats.terakhirBlast = sekarang.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    const pBln = path.join(REKAP_DIR, `rekap-${bln}.json`);
    let dBln = fs.existsSync(pBln) ? JSON.parse(fs.readFileSync(pBln, 'utf-8')) : {};
    dBln[tgl] = (dBln[tgl] || 0) + count;
    fs.writeFileSync(pBln, JSON.stringify(dBln, null, 2));
};

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', config: { ev: 0 }, isOnline: false, isJammed: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', config: { ev: 0 }, isOnline: false, isJammed: false }
};

async function initWA(chatId, id, silent = false) {
    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "122.0.6261.112"],
        printQRInTerminal: false,
        // Memaksa socket tetap terbuka meski kita tahan traffic-nya
        keepAliveIntervalMs: 30000 
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
        const { connection, lastDisconnect, qr } = u;

        if (qr && !silent && !engines[id].isOnline) { 
            const buffer = await QRCode.toBuffer(qr, { scale: 3 });
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            const sent = await bot.sendPhoto(chatId, buffer, { caption: `📸 **SCAN QR ENGINE ${id}**` });
            engines[id].lastQrMsgId = sent.message_id;
        }

        if (connection === 'open') {
            engines[id].sock = sock;
            engines[id].isOnline = true;
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE**`, {
                reply_markup: { inline_keyboard: [[{ text: `🔍 SETUP JAM`, callback_data: `start_filter_${id}` }]] }
            });
        }

        if (connection === 'close') {
            engines[id].isOnline = false;
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                setTimeout(() => initWA(chatId, id, true), 5000);
            }
        }
    });
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;
    const id = data.split('_')[2] || data.split('_')[1];

    if (data.startsWith('login_')) initWA(chatId, id);

    if (data.startsWith('start_filter_')) {
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `🔢 **ENGINE ${id}**\nMasukkan jumlah **ev num**:`);
    }

    if (data.startsWith('execute_filter_')) {
        const engine = engines[id];
        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim().length > 5).slice(0, engine.config.ev);
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            bot.sendMessage(chatId, `🌑 **MATIKAN JARINGAN...**\nMenahan \`${dataNomor.length}\` pesan di memori.`);

            // LOGIKA MATI JARINGAN (TOTAL JAM)
            engine.isJammed = true;
            engine.sock.ws.close = () => {}; // Mencegah socket disconnect saat kita "siksa"
            engine.sock.query = async () => { 
                return new Promise(() => {}); // Membuat setiap request "ngambang" (tidak pernah selesai)
            };

            for (let i = 0; i < dataNomor.length; i++) {
                let num = dataNomor[i].replace(/[^0-9]/g, "");
                let jid = (num.startsWith('0') ? '62' + num.slice(1) : num) + '@s.whatsapp.net';
                let sapa = dataNomor[i].split(/[0-9]/)[0].trim() || "Kak";
                let msg = (i % 2 === 0 ? p1 : p2).replace(/{id}/g, sapa);
                
                // Pesan masuk ke antrean tapi "tertahan" karena query di atas
                engine.sock.sendMessage(jid, { text: msg }).catch(() => {});
                
                if (i % 50 === 0) await delay(10); 
            }

            saveStats(dataNomor.length);
            bot.sendMessage(chatId, `✅ **ANTREAN MATANG!**\nSiap diledakkan secara serentak.`, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 HIDUPKAN JARINGAN (BOOM)", callback_data: `lepas_jam_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ File Error!"); }
    }

    if (data.startsWith('lepas_jam_')) {
        bot.editMessageText(`🔥 **BOOM! MENYALAKAN JARINGAN...**`, { chat_id: chatId, message_id: q.message.message_id });
        
        // LOGIKA HIDUPKAN JARINGAN (LEPAS SEMUA)
        // Kita paksa re-init tanpa hapus session, socket akan langsung flush semua antrean tadi
        initWA(chatId, id, true); 
    }
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const cid = msg.chat.id;

    for (let id in engines) {
        if (engines[id].step === 'input_ev') {
            engines[id].config.ev = parseInt(text);
            engines[id].step = null;
            return bot.sendMessage(cid, `⚙️ **SET: ${text} NOMOR**`, { 
                reply_markup: { inline_keyboard: [[{ text: "🔍 JALANKAN", callback_data: `execute_filter_${id}` }]] } 
            });
        }
    }

    if (text === "📊 LAPORAN") bot.sendMessage(cid, `📊 **REKAP HARI INI**\n🚀 Total: \`${stats.totalHariIni}\` chat`);
    if (text === "♻️ RESTART") bot.sendMessage(cid, "📌 **PILIH ENGINE:**", {
        reply_markup: { inline_keyboard: [[{ text: "1", callback_data: "login_1" }, { text: "2", callback_data: "login_2" }]] }
    });
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✨ **SYSTEM READY**", {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN" }]],
        resize_keyboard: true
    }
}));
