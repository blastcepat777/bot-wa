const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, delay } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- STORAGE STATS ---
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
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', config: { ev: 0 }, step: null, isOnline: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', config: { ev: 0 }, step: null, isOnline: false }
};

async function initWA(chatId, id, isSilent = false) {
    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "122.0.6261.112"],
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
        const { connection, lastDisconnect, qr } = u;

        // PERBAIKAN: Stop Barcode jika sudah online atau isSilent
        if (qr && !isSilent && !engines[id].isOnline) { 
            const buffer = await QRCode.toBuffer(qr, { scale: 3 });
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            const sent = await bot.sendPhoto(chatId, buffer, { caption: `📸 **SCAN QR ENGINE ${id}**` });
            engines[id].lastQrMsgId = sent.message_id;
        }

        if (connection === 'open') {
            engines[id].sock = sock;
            engines[id].isOnline = true;
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            bot.sendMessage(chatId, `✅ **ENGINE ${id} READY!**`, {
                reply_markup: { inline_keyboard: [[{ text: `🔍 SETUP JAM`, callback_data: `start_filter_${id}` }]] }
            });
        }

        if (connection === 'close') {
            engines[id].isOnline = false;
            const sCode = lastDisconnect?.error?.output?.statusCode;
            if (sCode !== DisconnectReason.loggedOut) {
                setTimeout(() => initWA(chatId, id, true), 5000);
            }
        }
    });
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data.startsWith('login_')) initWA(chatId, data.split('_')[1]);

    if (data.startsWith('start_filter_')) {
        const id = data.split('_')[2];
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `🔢 **ENGINE ${id}**\nMasukkan jumlah **ev num**:`);
    }

    if (data.startsWith('execute_filter_')) {
        const id = data.split('_')[2];
        const engine = engines[id];
        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim().length > 5).slice(0, engine.config.ev);
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            const statusMsg = await bot.sendMessage(chatId, `⏳ **MENGISI ANTREAN JAM (${dataNomor.length} CHAT)...**`);
            
            // LOGIKA NGEJAM: Block jalur kirim dulu
            engine.sock.query = async () => { return true; }; 

            for (let i = 0; i < dataNomor.length; i++) {
                let num = dataNomor[i].replace(/[^0-9]/g, "");
                let jid = (num.startsWith('0') ? '62' + num.slice(1) : num) + '@s.whatsapp.net';
                let sapa = dataNomor[i].split(/[0-9]/)[0].trim() || "Kak";
                let msg = (i % 2 === 0 ? p1 : p2).replace(/{id}/g, sapa);
                
                // Masukkan ke antrean HP
                engine.sock.sendMessage(jid, { text: msg }).catch(() => {});
                
                if (i % 20 === 0) await delay(100); 
            }

            bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
            saveStats(dataNomor.length);
            
            bot.sendMessage(chatId, `✅ **ANTREAN PENUH!**\nSilahkan klik tombol di bawah untuk melepas semua pesan secara serentak.`, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 LEPAS JAM SEKARANG", callback_data: `lepas_jam_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ File nomor/script tidak ditemukan!"); }
    }

    if (data.startsWith('lepas_jam_')) {
        const id = data.split('_')[2];
        bot.editMessageText(`🚀 **MELEPAS ANTREAN...**\nPesan akan terkirim serentak dari HP Anda.`, { chat_id: chatId, message_id: q.message.message_id });
        
        // RE-INIT UNTUK MELEPAS SUMBATAN
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
                reply_markup: { inline_keyboard: [[{ text: "🔍 JALANKAN JAM", callback_data: `execute_filter_${id}` }]] } 
            });
        }
    }

    if (text === "📊 LAPORAN") bot.sendMessage(cid, `📊 **REKAP HARI INI**\n🚀 Total: \`${stats.totalHariIni}\` chat`);
    if (text === "♻️ RESTART") bot.sendMessage(cid, "📌 **PILIH ENGINE:**", {
        reply_markup: { inline_keyboard: [[{ text: "1", callback_data: "login_1" }, { text: "2", callback_data: "login_2" }]] }
    });
    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS ENGINE**\n";
        for (let i=1; i<=2; i++) st += `Engine ${i}: ${engines[i].isOnline ? "✅ ON" : "❌ OFF"}\n`;
        bot.sendMessage(cid, st);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✨ **SYSTEM READY**", {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN" }, { text: "🛡️ CEK STATUS WA" }]],
        resize_keyboard: true
    }
}));
