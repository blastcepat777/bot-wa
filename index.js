const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

process.on('uncaughtException', (err) => console.log('Error: ', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection: ', reason));

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪', menuSent: false, isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊', menuSent: false, isInitializing: false }
};

const loginKeyboard = [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]];

const sendMenuUtama = (chatId) => {
    bot.sendMessage(chatId, `🌪️ **NINJA STORM ENGINE**\n\n/login - Ambil Barcode\n/restart - Reset All`);
};

const sendMenuEngine = (chatId, id) => {
    bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE**\n\nSilahkan Pilih Aksi:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
                [{ text: "♻️ RESTART", callback_data: 'restart_bot' }],
                [{ text: "❌ KELUAR", callback_data: 'batal' }]
            ]
        }
    });
};

async function initWA(chatId, id) {
    if (engines[id].isInitializing) return;
    engines[id].isInitializing = true;

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ninja Storm", "Chrome", "1.0.0"],
        syncFullHistory: false, 
        printQRInTerminal: false,
        connectTimeoutMs: 60000 
    });

    const sock = engines[id].sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 4 }); 
                const otherId = id == 1 ? 2 : 1;
                const markup = {
                    inline_keyboard: [
                        [{ text: `(ON)${engines[otherId].color} QR${otherId}`, callback_data: `login_${otherId}` }],
                        [{ text: "♻️ RESTART", callback_data: 'restart_bot' }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                };

                const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n🕒 Update: ${new Date().toLocaleTimeString('id-ID')}`;

                const sent = await bot.sendPhoto(chatId, buffer, { caption, parse_mode: 'Markdown', reply_markup: markup });
                
                if (engines[id].lastQrMsgId) {
                    await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                }
                engines[id].lastQrMsgId = sent.message_id;
            } catch (e) { console.log("QR Error"); }
        }

        if (connection === 'open') {
            engines[id].isInitializing = false;
            if (engines[id].lastQrMsgId) {
                await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                engines[id].lastQrMsgId = null;
            }
            if (!engines[id].menuSent) {
                sendMenuEngine(chatId, id);
                engines[id].menuSent = true;
            }
        }
        
        if (connection === 'close') {
            engines[id].isInitializing = false;
            engines[id].menuSent = false;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) initWA(chatId, id);
        }
    });
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    const data = q.data;

    if (data === 'restart_bot') {
        await bot.sendMessage(chatId, "♻️ **SUDAH BERHASIL DI RESTART...**", {
            reply_markup: { inline_keyboard: loginKeyboard }
        });
        setTimeout(() => process.exit(), 1000);
        return bot.answerCallbackQuery(q.id);
    }

    if (data === 'cmd_login') {
        return bot.editMessageText("🚀 Pilih Engine:", {
            chat_id: chatId, message_id: msgId,
            reply_markup: {
                inline_keyboard: [[{ text: "🌪 QR1", callback_data: 'login_1' }, { text: "🌊 QR2", callback_data: 'login_2' }]]
            }
        });
    }

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        if (engines[id].isInitializing) return bot.answerCallbackQuery(q.id, { text: "Sabar Bos, lagi disiapkan..." });
        
        const prepMsg = await bot.sendMessage(chatId, `⏳ **Menyiapkan QR Engine ${id}...**`);
        engines[id].lastQrMsgId = prepMsg.message_id;
        initWA(chatId, id);
    }

    if (data === 'filter_') {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Engine ${id} Belum Login!`);
        bot.sendMessage(chatId, `${engines[id].color} **FILTER ENGINE ${id} MULAI...**`);
        try {
            const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            let aktif = [];
            for (const line of lines) {
                const num = line.replace(/[^0-9]/g, '');
                const [res] = await engines[id].sock.onWhatsApp(num).catch(() => [null]);
                if (res?.exists) aktif.push(line.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            
            // Tombol JALAN BLAST ditaruh di sini (Kotak Merah)
            bot.sendMessage(chatId, `✅ **FILTER ${id} SELESAI**\nAktif: ${aktif.length}\n\nSilahkan Pilih:`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }],
                        [{ text: "♻️ RESTART", callback_data: 'restart_bot' }],
                        [{ text: "❌ KELUAR", callback_data: 'batal' }]
                    ]
                }
            });
        } catch (e) { bot.sendMessage(chatId, `❌ File ${engines[id].file} tidak ditemukan.`); }
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Engine ${id} Belum Login!`);
        
        try {
            const fileName = `aktif_${id}.txt`;
            const scriptFile = engines[id].script; // Mengambil script1.txt atau script2.txt
            
            if (!fs.existsSync(fileName)) return bot.sendMessage(chatId, `❌ Belum ada data filter!`);
            if (!fs.existsSync(scriptFile)) return bot.sendMessage(chatId, `❌ File ${scriptFile} tidak ditemukan!`);
            
            const numbers = fs.readFileSync(fileName, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const pesanBlast = fs.readFileSync(scriptFile, 'utf-8'); // Mengambil isi pesan dari script.txt
            
            bot.sendMessage(chatId, `🚀 **BLAST ENGINE ${id} JALAN...**`);

            // NINJA STORM PARALLEL BLAST (0 DETIK JEDA)
            Promise.all(numbers.map(line => {
                const num = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                return engines[id].sock.sendMessage(num, { text: pesanBlast }).catch(() => {});
            })).then(() => {
                bot.sendMessage(chatId, `✅ **BLAST ${id} SELESAI!**`, {
                    reply_markup: { inline_keyboard: [[{ text: "♻️ RESTART", callback_data: 'restart_bot' }]] }
                });
            });
        } catch (e) { console.log(e); }
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => sendMenuUtama(msg.chat.id));
bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 Pilih Engine:", {
        reply_markup: {
            inline_keyboard: [[{ text: "🌪 QR1", callback_data: 'login_1' }, { text: "🌊 QR2", callback_data: 'login_2' }]]
        }
    });
});
bot.onText(/\/restart/, (msg) => {
    bot.sendMessage(msg.chat.id, "♻️ **SUDAH BERHASIL DI RESTART...**", {
        reply_markup: { inline_keyboard: loginKeyboard }
    });
    setTimeout(() => process.exit(), 1000);
});
