const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, delay } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊' }
};

let stats = { totalHariIni: 0, rekapanTotalHarian: 0, terakhirBlast: "-" };
const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

const menuUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }]],
        resize_keyboard: true
    }
};

async function initWA(chatId, id, msgIdToEdit) {
    // 1. Matikan socket lama secara bersih sebelum mulai baru
    if (engines[id].sock) {
        engines[id].sock.ev.removeAllListeners();
        engines[id].sock.end();
        engines[id].sock = null;
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version, auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ninja Storm", "Chrome", "1.0.0"],
            printQRInTerminal: false
        });

        // Simpan instance ke objek utama
        engines[id].sock = sock;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                const buffer = await QRCode.toBuffer(qr, { scale: 3 });
                if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                
                const sent = await bot.sendPhoto(chatId, buffer, {
                    caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n🕒 ${getWIBTime()}`,
                    parse_mode: 'Markdown'
                });
                engines[id].lastQrMsgId = sent.message_id;
            }

            if (connection === 'open') {
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**`, {
                    reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI FILTER`, callback_data: `start_filter_${id}` }]] }
                });
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (!shouldReconnect) {
                    // Jika Logout: Hapus data & socket
                    engines[id].sock = null;
                    if (fs.existsSync(engines[id].session)) fs.rmSync(engines[id].session, { recursive: true, force: true });
                    bot.sendMessage(chatId, `❌ **ENGINE ${id} LOGOUT.** Session dihapus.`);
                } else {
                    setTimeout(() => initWA(chatId, id), 5000);
                }
            }
        });
    } catch (e) { console.error(e); }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    if (q.data.startsWith('login_')) initWA(chatId, q.data.split('_')[1], q.message.message_id);
    
    if (q.data.startsWith('jalan_blast_')) {
        const id = q.data.split('_')[2];
        const sock = engines[id].sock;
        if (!sock || !sock.user) return bot.answerCallbackQuery(q.id, { text: "❌ WA OFFLINE!", show_alert: true });

        const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "");
        const s1 = fs.readFileSync(`./script1.txt`, 'utf-8');
        const s2 = fs.readFileSync(`./script2.txt`, 'utf-8');

        bot.sendMessage(chatId, `🚀 **BLASTING ENGINE ${id}...**`);
        for (let b of dataNomor) {
            let n = b.replace(/[^0-9]/g, "");
            let jid = (n.startsWith('0') ? '62'+n.slice(1) : (n.startsWith('62') ? n : '62'+n)) + '@s.whatsapp.net';
            let sap = b.split(/[0-9]/)[0].trim() || "";
            
            await sock.sendMessage(jid, { text: s1.replace(/{id}/g, sap) }).catch(() => {});
            await delay(1000);
            await sock.sendMessage(jid, { text: s2.replace(/{id}/g, sap) }).then(() => {
                stats.totalHariIni++; stats.rekapanTotalHarian++;
            }).catch(() => {});
            await delay(2000);
        }
    }

    if (q.data.startsWith('start_filter_')) {
        bot.sendMessage(chatId, `✅ **FILTER SELESAI ENGINE ${q.data.split('_')[2]}**`, {
            reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN", callback_data: `jalan_blast_${q.data.split('_')[2]}` }]] }
        });
    }

    if (q.data === 'pilih_engine') {
        bot.editMessageText("📌 **PILIH ENGINE:**", { chat_id: chatId, message_id: q.message.message_id,
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }]] }
        });
    }
});

bot.on('message', async (msg) => {
    if (msg.text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS ENGINE**\n";
        for (let i=1; i<=2; i++) {
            // Validasi status berdasarkan keberadaan instance socket DAN user
            const active = engines[i].sock && engines[i].sock.user;
            st += `${engines[i].color} Engine ${i}: ${active ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        }
        bot.sendMessage(msg.chat.id, st, menuUtama);
    }

    if (msg.text === "🚪 LOGOUT WA") {
        for (let i in engines) {
            if (engines[i].sock) {
                await engines[i].sock.logout().catch(() => {}); // Logout resmi ke WA
                engines[i].sock = null;
            }
            if (fs.existsSync(engines[i].session)) fs.rmSync(engines[i].session, { recursive: true, force: true });
        }
        bot.sendMessage(msg.chat.id, "✅ **LOGOUT SELESAI.**", menuUtama);
    }

    if (msg.text === "♻️ RESTART") {
        bot.sendMessage(msg.chat.id, "♻️ **RESTART**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }
});
