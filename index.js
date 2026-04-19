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

const saveGlobalLog = (count) => {
    const tgl = new Date().toISOString().split('T')[0];
    stats.totalHariIni += count;
    stats.terakhirBlast = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

    const pathBln = path.join(REKAP_DIR, `rekap-${tgl.slice(0, 7)}.json`);
    let dataBln = fs.existsSync(pathBln) ? JSON.parse(fs.readFileSync(pathBln, 'utf-8')) : {};
    dataBln[tgl] = (dataBln[tgl] || 0) + count;
    fs.writeFileSync(pathBln, JSON.stringify(dataBln, null, 2));
};

// --- ENGINE STATE ---
let engines = {
    1: { sock: null, session: './session_1', color: '🌪', isConnecting: false, lastQrId: null, ev: 0, step: null },
    2: { sock: null, session: './session_2', color: '🌊', isConnecting: false, lastQrId: null, ev: 0, step: null }
};

const keyboardUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN" }, { text: "🛡️ STATUS" }, { text: "🚪 LOGOUT" }]],
        resize_keyboard: true
    }
};

async function konekWA(chatId, id, silent = false) {
    if (engines[id].isConnecting) return;
    engines[id].isConnecting = true;

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "122.0.6261.112"],
        printQRInTerminal: false,
        connectTimeoutMs: 30000
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (up) => {
        const { connection, lastDisconnect, qr } = up;

        if (qr && !silent) {
            if (engines[id].lastQrId) await bot.deleteMessage(chatId, engines[id].lastQrId).catch(() => {});
            const buf = await QRCode.toBuffer(qr, { scale: 3 });
            const msg = await bot.sendPhoto(chatId, buf, { caption: `📸 **SCAN QR ENGINE ${id}**` });
            engines[id].lastQrId = msg.message_id;
        }

        if (connection === 'open') {
            engines[id].sock = sock;
            engines[id].isConnecting = false;
            if (engines[id].lastQrId) await bot.deleteMessage(chatId, engines[id].lastQrId).catch(() => {});
            engines[id].lastQrId = null;
            bot.sendMessage(chatId, `✅ **ENGINE ${id} READY**`, {
                reply_markup: { inline_keyboard: [[{ text: "⚙️ SETUP & JAM", callback_data: `set_${id}` }]] }
            });
        }

        if (connection === 'close') {
            engines[id].isConnecting = false;
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                setTimeout(() => konekWA(chatId, id, true), 5000);
            }
        }
    });
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const [act, id] = q.data.split('_');

    if (act === 'set') {
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `📊 **ENGINE ${id}**\nMasukkan jumlah target nomor:`);
    }

    if (act === 'gas') {
        const eng = engines[id];
        try {
            const lines = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const data = lines.slice(0, eng.ev);
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            if (data.length === 0) throw new Error("Target 0. Cek file nomor!");

            bot.sendMessage(chatId, `⏳ **NGEJAM ${data.length} PESAN...**`);

            // FORCE JAM PROTOCOL
            eng.sock.query = async () => { return true; };

            for (let i = 0; i < data.length; i++) {
                let clean = data[i].replace(/[^0-9]/g, "");
                let jid = (clean.startsWith('0') ? '62' + clean.slice(1) : clean) + '@s.whatsapp.net';
                let sapa = data[i].split(/[0-9]/)[0].trim() || "Kak";
                let msg = (i % 2 === 0 ? p1 : p2).replace(/{id}/g, sapa);

                eng.sock.sendMessage(jid, { text: msg }).catch(() => {});
                if (i % 20 === 0) await delay(50);
            }

            saveGlobalLog(data.length);
            bot.sendMessage(chatId, `✅ **DONE!**\nPesan sudah nyangkut (ikon jam).`, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 LEPAS SEKARANG", callback_data: `out_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, `❌ Error: ${e.message}`); }
    }

    if (act === 'out') {
        bot.editMessageText(`🚀 **MELEPAS...**`, { chat_id: chatId, message_id: q.message.message_id });
        engines[id].sock.end();
        setTimeout(() => konekWA(chatId, id, true), 2000);
    }
    bot.answerCallbackQuery(q.id);
});

bot.on('message', (m) => {
    const txt = m.text;
    const cid = m.chat.id;

    for (let id in engines) {
        if (engines[id].step === 'input_ev') {
            engines[id].ev = parseInt(txt);
            engines[id].step = null;
            return bot.sendMessage(cid, `✅ Target dikunci: ${txt}`, {
                reply_markup: { inline_keyboard: [[{ text: "🔥 GAS SEKARANG", callback_data: `gas_${id}` }]] }
            });
        }
    }

    if (txt === "/start") bot.sendMessage(cid, "✨ **SYSTEM READY**", keyboardUtama);
    if (txt === "📊 LAPORAN") bot.sendMessage(cid, `📊 **REKAP HARI INI**\nTotal: \`${stats.totalHariIni}\` chat\nUpdate: ${stats.terakhirBlast}`);
    if (txt === "🛡️ STATUS") {
        let res = "🛡️ **KONEKSI**\n";
        for (let i in engines) res += `Engine ${i}: ${engines[i].sock ? "✅ ON" : "❌ OFF"}\n`;
        bot.sendMessage(cid, res);
    }
    if (txt === "♻️ RESTART") { konekWA(cid, 1); konekWA(cid, 2); }
});
