const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, delay } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false, qrTimeout: null },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false, qrTimeout: null }
};

let stats = { totalHariIni: 0, rekapanTotalHarian: 0, terakhirBlast: "-" };

const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

const menuUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }]],
        resize_keyboard: true
    }
};

// --- FUNGSI RESET TOTAL (Kunci Biar Barcode Muncul) ---
async function killEngine(id) {
    if (engines[id].qrTimeout) clearTimeout(engines[id].qrTimeout);
    if (engines[id].sock) {
        try {
            engines[id].sock.ev.removeAllListeners();
            engines[id].sock.terminate(); 
            engines[id].sock = null;
        } catch (e) {}
    }
    engines[id].isInitializing = false;
}

async function initWA(chatId, id, msgIdToEdit) {
    await killEngine(id); // Matikan semua proses lama sebelum mulai

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
            defaultQueryTimeoutMs: 0,
            syncFullHistory: false
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;

            // HANDLE QR (Jika Belum Login)
            if (qr) {
                try {
                    const buffer = await QRCode.toBuffer(qr, { scale: 4, margin: 2 });
                    if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                    if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});

                    const sent = await bot.sendPhoto(chatId, buffer, {
                        caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n\n🕒 ${getWIBTime()}\n💡 *Scan sebelum expired dalam 50 detik!*`,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: "❌ CANCEL", callback_data: 'batal' }]] }
                    });
                    engines[id].lastQrMsgId = sent.message_id;

                    // Auto-refresh barcode jika tidak di-scan
                    clearTimeout(engines[id].qrTimeout);
                    engines[id].qrTimeout = setTimeout(() => {
                        if (!engines[id].sock?.user) initWA(chatId, id);
                    }, 50000);
                } catch (e) {}
            }

            if (connection === 'open') {
                clearTimeout(engines[id].qrTimeout);
                engines[id].sock = sock;
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**`, {
                    reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI FILTER`, callback_data: `start_filter_${id}` }]] }
                });
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason === DisconnectReason.loggedOut) {
                    if (fs.existsSync(engines[id].session)) fs.rmSync(engines[id].session, { recursive: true, force: true });
                    await killEngine(id);
                    bot.sendMessage(chatId, `❌ **ENGINE ${id} LOGOUT!** Silakan login ulang.`);
                } else {
                    // Reconnect otomatis untuk error jaringan biasa
                    setTimeout(() => initWA(chatId, id), 5000);
                }
            }
        });
    } catch (err) { console.error(err); }
}

// --- LOGIC TOMBOL & PESAN ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data.startsWith('login_')) {
        const id = q.data.split('_')[1];
        await bot.editMessageText(`⏳ **Menghubungkan Engine ${id}...**`, { chat_id: chatId, message_id: msgId });
        initWA(chatId, id, msgId);
    }

    if (q.data.startsWith('jalan_blast_')) {
        const id = q.data.split('_')[2];
        const sock = engines[id].sock;
        if (!sock || !sock.user) return bot.answerCallbackQuery(q.id, { text: "❌ Belum Login!", show_alert: true });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "");
            const script1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const script2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            bot.sendMessage(chatId, `🚀 **START BLAST ENGINE ${id}**`, menuUtama);

            for (let baris of dataNomor) {
                let nomor = baris.replace(/[^0-9]/g, "");
                if (nomor.length < 9) continue;
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                let sapaan = baris.split(/[0-9]/)[0].trim() || "";

                await sock.sendMessage(jid, { text: script1.replace(/{id}/g, sapaan) }).catch(() => {});
                await delay(1000);
                await sock.sendMessage(jid, { text: script2.replace(/{id}/g, sapaan) }).then(() => {
                    stats.totalHariIni++;
                    stats.rekapanTotalHarian++;
                    stats.terakhirBlast = getWIBTime();
                }).catch(() => {});
                await delay(2000);
            }
        } catch (e) { bot.sendMessage(chatId, "❌ File script/nomor hilang!"); }
    }

    if (q.data.startsWith('start_filter_')) {
        const id = q.data.split('_')[2];
        bot.sendMessage(chatId, `✅ **FILTER SELESAI ENGINE ${id}**`, {
            reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN", callback_data: `jalan_blast_${id}` }], [{ text: "❌ BATAL", callback_data: "batal" }]] }
        });
    }

    if (q.data === 'pilih_engine') {
        bot.editMessageText("📌 **PILIH ENGINE:**", { chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }]] }
        });
    }
    
    if (q.data === 'batal') { await bot.deleteMessage(chatId, msgId).catch(() => {}); }
    bot.answerCallbackQuery(q.id);
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS ENGINE**\n\n";
        for (let i = 1; i <= 2; i++) {
            const isOnline = engines[i].sock && engines[i].sock.user;
            st += `${engines[i].color} Engine ${i}: ${isOnline ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        }
        bot.sendMessage(chatId, st, menuUtama);
    }

    if (text === "🚪 LOGOUT WA") {
        for (let i in engines) {
            await killEngine(i);
            if (fs.existsSync(engines[i].session)) fs.rmSync(engines[i].session, { recursive: true, force: true });
        }
        bot.sendMessage(chatId, "✅ **SEMUA SESSION DIHAPUS TOTAL**", menuUtama);
    }

    if (text === "📊 LAPORAN HARIAN") {
        const lap = `📊 **LAPORAN HARIAN**\n🚀 Hari Ini: ${stats.totalHariIni}\n📈 Total: ${stats.rekapanTotalHarian}\n🕒 Terakhir: ${stats.terakhirBlast}`;
        bot.sendMessage(chatId, lap, menuUtama);
    }

    if (text === "♻️ RESTART") {
        bot.sendMessage(chatId, "♻️ **RESTART SYSTEM**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }
});
