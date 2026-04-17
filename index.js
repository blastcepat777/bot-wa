const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

process.on('uncaughtException', (err) => console.log('Caught exception: ', err));
process.on('unhandledRejection', (reason, promise) => console.log('Unhandled Rejection at:', promise, 'reason:', reason));

let engines = {
    1: { sock: null, lastQrMsgId: null, isProcessing: false, session: './session_1', file: 'nomor1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, isProcessing: false, session: './session_2', file: 'nomor2.txt', color: '🌊' }
};

async function initWA(chatId, id, messageId = null) {
    if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }), // Silent logger untuk hemat RAM
        browser: [`Ninja Engine ${id}`, "Chrome", "20.0.04"],
        printQRInTerminal: false,
        syncFullHistory: false, // Penting agar tidak crash
        shouldIgnoreJid: (jid) => jid.includes('@g.us'),
    });

    const sock = engines[id].sock;

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr) {
            try {
                // Skala 5 lebih ringan daripada 8 untuk RAM terbatas
                const buffer = await QRCode.toBuffer(qr, { scale: 5 }); 
                const otherId = id === 1 ? 2 : 1;
                const otherEmoji = engines[otherId].color;
                
                const caption = `${engines[id].color} **SCAN QR SEKARANG !! ${id}**\n\n🕒 Update: ${new Date().toLocaleTimeString('id-ID')}`;
                const reply_markup = {
                    inline_keyboard: [[{ text: `(ON)${otherEmoji} QR${otherId}`, callback_data: `login_${otherId}` }]]
                };

                const targetMsgId = messageId || engines[id].lastQrMsgId;

                // Cek apakah pesan sebelumnya berupa foto atau teks
                // Jika teks (loading), kita harus kirim foto baru dan hapus teksnya
                if (targetMsgId && messageId) {
                    await bot.deleteMessage(chatId, targetMsgId).catch(() => {});
                    const sent = await bot.sendPhoto(chatId, buffer, { caption, parse_mode: 'Markdown', reply_markup });
                    engines[id].lastQrMsgId = sent.message_id;
                } else if (engines[id].lastQrMsgId) {
                    // Jika sudah foto, baru kita edit medianya (Update QR)
                    await bot.editMessageMedia({
                        type: 'photo',
                        media: buffer,
                        caption: caption,
                        parse_mode: 'Markdown'
                    }, {
                        chat_id: chatId,
                        message_id: engines[id].lastQrMsgId,
                        reply_markup: reply_markup
                    }).catch(() => {});
                } else {
                    const sent = await bot.sendPhoto(chatId, buffer, { caption, parse_mode: 'Markdown', reply_markup });
                    engines[id].lastQrMsgId = sent.message_id;
                }
            } catch (err) {
                console.log("QR Buffer Error:", err);
            }
        }

        if (connection === 'open') {
            if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
            bot.sendMessage(chatId, `✅ **ENGINE ${id} ONLINE (${engines[id].color})**`);
            engines[id].lastQrMsgId = null;
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) initWA(chatId, id);
        }
    });
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `🌪️ **NINJA STORM ENGINE**\n\n/login - Ambil Barcode\n/report - Cek Hasil\n/restart - Reset All`);
});

bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 Silahkan Dipilih Barcode Dibawah Ini :", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "(ON)🌪 QR1", callback_data: 'login_1' }],
                [{ text: "(ON)🌊 QR2", callback_data: 'login_2' }]
            ]
        }
    });
});

bot.on('callback_query', async (q) => {
    const id = q.data === 'login_1' ? 1 : 2;
    const chatId = q.message.chat.id;
    const messageId = q.message.message_id;

    // Ubah pesan menjadi loading
    await bot.editMessageText(`⏳ **Menyiapkan QR Engine ${id}...**`, {
        chat_id: chatId,
        message_id: messageId
    }).catch(() => {});

    initWA(chatId, id, messageId);
    bot.answerCallbackQuery(q.id);
});

// Logic Filter & Jalan tetap sama untuk menjaga fungsi
[1, 2].forEach(id => {
    bot.onText(new RegExp(`\\/filter${id}`), async (msg) => {
        if (!engines[id].sock) return bot.sendMessage(msg.chat.id, `Login Engine ${id} dulu!`);
        bot.sendMessage(msg.chat.id, `${engines[id].color} **FILTERING...**`);
        try {
            const data = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            let aktif = [];
            for (const line of data) {
                const cleanNum = line.trim().replace(/[^0-9]/g, '');
                const [result] = await engines[id].sock.onWhatsApp(cleanNum).catch(() => [null]);
                if (result?.exists) aktif.push(line.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            bot.sendMessage(msg.chat.id, `✅ Engine ${id} Selesai. Aktif: ${aktif.length}`);
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
            for (let i = 0; i < data.length; i++) {
                const parts = data[i].trim().split(/\s+/);
                const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                const pesan = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, parts[0]);
                await engines[id].sock.sendMessage(jid, { text: pesan }).catch(() => {});
            }
            bot.sendMessage(msg.chat.id, `✅ **ENGINE ${id} SELESAI!**`);
        } catch (e) { bot.sendMessage(msg.chat.id, "Error Jalan."); }
        engines[id].isProcessing = false;
    });
});

bot.onText(/\/restart/, (msg) => {
    bot.sendMessage(msg.chat.id, "♻️ **SYSTEM RESTART...**");
    setTimeout(() => { process.exit(); }, 1000);
});
