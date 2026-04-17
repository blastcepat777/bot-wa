const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- FIX: Tangkap error global supaya script gak mati total ---
process.on('uncaughtException', (err) => console.error('CRASH TERDETEKSI:', err));
process.on('unhandledRejection', (err) => console.error('REJECTION TERDETEKSI:', err));

// --- DATABASE REPORT ---
const REPORT_FILE = './daily_report.json';
function getReport() {
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
    if (!fs.existsSync(REPORT_FILE)) return { date: today, total: 0 };
    try {
        let data = JSON.parse(fs.readFileSync(REPORT_FILE));
        if (data.date === today) return data;
        return { date: today, total: 0 };
    } catch (e) { return { date: today, total: 0 }; }
}
function updateReport(count) {
    let data = getReport();
    data.total += count;
    fs.writeFileSync(REPORT_FILE, JSON.stringify(data));
}

// --- SERVER ---
const app = express();
app.get('/', (req, res) => res.send('NINJA STORM ENGINE ACTIVE'));
app.listen(process.env.PORT || 3000);

let engines = {
    1: { sock: null, lastQrMsgId: null, isProcessing: false, session: './session_1', file: 'nomor1.txt', color: '🔵' },
    2: { sock: null, lastQrMsgId: null, isProcessing: false, session: './session_2', file: 'nomor2.txt', color: '🟢' }
};

async function initWA(chatId, id) {
    try {
        if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();

        engines[id].sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: [`Ninja Engine ${id}`, "Chrome", "20.0.04"],
            defaultQueryTimeoutMs: 0,
            printQRInTerminal: false,
            // Tambahan sinkronisasi agar lebih ringan
            syncFullHistory: false,
            markOnlineOnConnect: true
        });

        const sock = engines[id].sock;

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (u) => {
            const { connection, qr, lastDisconnect } = u;

            if (qr) {
                const buffer = await QRCode.toBuffer(qr, { scale: 12, margin: 3 });
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                const sent = await bot.sendPhoto(chatId, buffer, { 
                    caption: `${engines[id].color} **SCAN QR ENGINE ${id}**`,
                    parse_mode: 'Markdown'
                });
                engines[id].lastQrMsgId = sent.message_id;
            }

            if (connection === 'open') {
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                engines[id].lastQrMsgId = null;
                bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE (${engines[id].color})**`);
            }
            
            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason !== DisconnectReason.loggedOut) {
                    initWA(chatId, id); // Auto reconnect jika bukan logout
                }
            }
        });
    } catch (err) {
        console.error(`Gagal init Engine ${id}:`, err);
    }
}

// --- COMMANDS ---
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `🌪️ **DUAL ENGINE READY**\n/login - Pilih Barcode\n/report - Cek Hasil\n/restart - Reset All`);
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "Pilih Engine:", {
        reply_markup: {
            inline_keyboard: [[
                { text: "🔵 BARCODE 1", callback_data: 'login_1' },
                { text: "🟢 BARCODE 2", callback_id: 'login_2', callback_data: 'login_2' }
            ]]
        }
    });
});

bot.on('callback_query', (q) => {
    const id = q.data === 'login_1' ? 1 : 2;
    initWA(q.message.chat.id, id);
    bot.answerCallbackQuery(q.id);
});

// --- FILTER & JALAN (BRUTAL 0s) ---
[1, 2].forEach(id => {
    bot.onText(new RegExp(`\\/filter${id}`), async (msg) => {
        if (!engines[id].sock) return bot.sendMessage(msg.chat.id, `Hubungkan Engine ${id} dulu!`);
        bot.sendMessage(msg.chat.id, `${engines[id].color} **FILTERING...**`);
        try {
            const data = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const tasks = data.map(async (line) => {
                const cleanNum = line.trim().replace(/[^0-9]/g, '');
                const [result] = await engines[id].sock.onWhatsApp(cleanNum).catch(() => [null]);
                if (result?.exists) {
                    await engines[id].sock.sendPresenceUpdate('composing', cleanNum + "@s.whatsapp.net").catch(() => {});
                    return line.trim();
                }
                return null;
            });
            const results = await Promise.all(results); // Fix typo dari script sebelumnya
            const aktif = results.filter(r => r !== null);
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            bot.sendMessage(msg.chat.id, `✅ Engine ${id} Aktif: ${aktif.length}`);
        } catch (e) { bot.sendMessage(msg.chat.id, "Error Filter."); }
    });

    bot.onText(new RegExp(`\\/jalan${id}`), async (msg) => {
        if (engines[id].isProcessing || !engines[id].sock) return bot.sendMessage(msg.chat.id, `Engine ${id} Sibuk/Offline!`);
        engines[id].isProcessing = true;
        try {
            const target = fs.existsSync(`aktif_${id}.txt`) ? `aktif_${id}.txt` : engines[id].file;
            const data = fs.readFileSync(target, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const s1 = fs.readFileSync('script1.txt', 'utf-8');
            const s2 = fs.readFileSync('script2.txt', 'utf-8');

            bot.sendMessage(msg.chat.id, `🌪️ **ENGINE ${id} BLASTING!**`);

            const blastTasks = data.map((line, i) => {
                const parts = line.trim().split(/\s+/);
                const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                const pesan = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, parts[0]);
                return engines[id].sock.sendMessage(jid, { text: pesan })
                    .then(() => { updateReport(1); return true; })
                    .catch(() => false);
            });

            await Promise.all(blastTasks);
            bot.sendMessage(msg.chat.id, `✅ **ENGINE ${id} SELESAI!**`);
        } catch (e) { bot.sendMessage(msg.chat.id, "Error Jalan."); }
        engines[id].isProcessing = false;
    });
});

bot.onText(/\/restart/, async (msg) => {
    bot.sendMessage(msg.chat.id, "♻️ **RESETTING...
