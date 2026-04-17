const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Mencegah mati total saat ada error global
process.on('uncaughtException', (err) => console.log('Sistem mendeteksi error: ', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection terdeteksi:', reason));

let engines = {
    1: { sock: null, lastQrMsgId: null, isProcessing: false, session: './session_1', file: 'nomor1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, isProcessing: false, session: './session_2', file: 'nomor2.txt', color: '🌊' }
};

async function initWA(chatId, id) {
    try {
        if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();

        // Logger silent total untuk hemat RAM
        const silentLogger = pino({ level: 'silent' });

        engines[id].sock = makeWASocket({
            version,
            auth: state,
            logger: silentLogger,
            browser: [`Ninja Engine ${id}`, "Chrome", "20.0.04"],
            printQRInTerminal: false,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false, // WAJIB FALSE agar tidak crash saat load chat
            maxMsgRetryCount: 1,
            connectTimeoutMs: 30000, // Tambah timeout koneksi
            shouldIgnoreJid: (jid) => jid.includes('@g.us'), 
        });

        const sock = engines[id].sock;

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (u) => {
            const { connection, qr, lastDisconnect } = u;

            if (qr) {
                // Skala QR kecil agar buffer tidak membebani memori
                const buffer = await QRCode.toBuffer(qr, { scale: 5 }); 
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                const sent = await bot.sendPhoto(chatId, buffer, { 
                    caption: `${engines[id].color} **SCAN QR SEKARANG !! ${id}**\n\n🕒 Update: ${new Date().toLocaleTimeString('id-ID')}`,
                    parse_mode: 'Markdown'
                });
                engines[id].lastQrMsgId = sent.message_id;
            }

            if (connection === 'open') {
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE (${engines[id].color})**`);
            }
            
            if (connection === 'close') {
                const code = lastDisconnect?.error?.output?.statusCode;
                if (code !== DisconnectReason.loggedOut) {
                    console.log(`Engine ${id} reconnecting...`);
                    setTimeout(() => initWA(chatId, id), 5000); // Jeda reconnect 5 detik
                }
            }
        });
    } catch (e) {
        console.log(`Gagal inisialisasi Engine ${id}:`, e.message);
    }
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `🌪️ **NINJA STORM ENGINE**\n\n/login - Ambil Barcode\n/report - Cek Hasil\n/restart - Reset All`);
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 Silahkan Dipilih Barcode Dibawah Ini :", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "(ON) 🌪 QR1", callback_data: 'login_1' }],
                [{ text: "(ON) 🌊 QR2", callback_data: 'login_2' }]
            ]
        }
    });
});

bot.on('callback_query', (q) => {
    const id = q.data === 'login_1' ? 1 : 2;
    initWA(q.message.chat.id, id);
    bot.answerCallbackQuery(q.id);
});

// FILTER & JALAN
[1, 2].forEach(id => {
    bot.onText(new RegExp(`\\/filter${id}`), async (msg) => {
        if (!engines[id].sock) return bot.sendMessage(msg.chat.id, `Login Engine ${id} dulu!`);
        bot.sendMessage(msg.chat.id, `${engines[id].color} **FILTERING...**`);
        try {
            const data = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const results = [];
            // Proses sekuensial (satu-satu) agar tidak spike RAM
            for (const line of data) {
                const cleanNum = line.trim().replace(/[^0-9]/g, '');
                try {
                    const [result] = await engines[id].sock.onWhatsApp(cleanNum);
                    if (result?.exists) {
                        await engines[id].sock.sendPresenceUpdate('composing', cleanNum + "@s.whatsapp.net").catch(() => {});
                        results.push(line.trim());
                    }
                } catch (e) {}
            }
            fs.writeFileSync(`aktif_${id}.txt`, results.join('\n'));
            bot.sendMessage(msg.chat.id, `✅ Engine ${id} Selesai. Aktif: ${results.length}`);
        } catch (e) { bot.sendMessage(msg.chat.id, "Error Filter."); }
    });

    bot.onText(new RegExp(`\\/jalan${id}`), async (msg) => {
        if (engines[id].isProcessing || !engines[id].sock) return bot.sendMessage(msg.chat.id, `Engine ${id} Belum Siap!`);
        engines[id].isProcessing = true;
        try {
            const target = fs.existsSync(`aktif_${id}.txt`) ? `aktif_${id}.txt` : engines[id].file;
            const data = fs.readFileSync(target, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const s1 = fs.readFileSync('script1.txt', 'utf-8');
            const s2 = fs.readFileSync('script2.txt', 'utf-8');

            bot.sendMessage(msg.chat.id, `🌪️ **ENGINE ${id} BLASTING!**`);

            for (let i = 0; i < data.length; i++) {
                const line = data[i];
                const parts = line.trim().split(/\s+/);
                const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                const pesan = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, parts[0]);
                await engines[id].sock.sendMessage(jid, { text: pesan }).catch(() => false);
                // Jeda 100ms antar pesan agar tidak dianggap spammer/flood
                await new Promise(r => setTimeout(r, 100)); 
            }

            bot.sendMessage(msg.chat.id, `✅ **ENGINE ${id} SELESAI!**`);
        } catch (e) { bot.sendMessage(msg.chat.id, "Error Jalan."); }
        engines[id].isProcessing = false;
    });
});

bot.onText(/\/restart/, (msg) => {
    bot.sendMessage(msg.chat.id, "♻️ **SYSTEM RESTART... /login untuk blast**");
    setTimeout(() => { process.exit(); }, 1000);
});
