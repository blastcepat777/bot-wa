const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

// --- RAILWAY 24/7 KEEP-ALIVE ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('NINJA STORM ENGINE ACTIVE 🚀'));
app.listen(PORT, '0.0.0.0', () => console.log(`Server listen on port ${PORT}`));

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
        qrTimeout: 30000,
        connectTimeoutMs: 60000 
    });

    const sock = engines[id].sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr && chatId) {
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
            if (engines[id].lastQrMsgId && chatId) {
                await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                engines[id].lastQrMsgId = null;
            }
            if (!engines[id].menuSent && chatId) {
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

// AUTO-RUN RAILWAY
Object.keys(engines).forEach(id => {
    if (fs.existsSync(engines[id].session)) {
        initWA(null, id); 
    }
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    const data = q.data;

    if (data === 'restart_bot') {
        await bot.sendMessage(chatId, "♻️ **ENGINE REBOOTING...**");
        setTimeout(() => process.exit(), 500);
        return;
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
        if (engines[id].isInitializing) return bot.answerCallbackQuery(q.id, { text: "Sabar Bos..." });
        const prepMsg = await bot.sendMessage(chatId, `⏳ **Menyiapkan QR Engine ${id}...**`);
        engines[id].lastQrMsgId = prepMsg.message_id;
        initWA(chatId, id);
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Engine ${id} Belum Login!`);
        bot.sendMessage(chatId, `${engines[id].color} **FILTER ENGINE ${id} RUNNING...**`);
        try {
            const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            let aktif = [];
            for (const line of lines) {
                const num = line.replace(/[^0-9]/g, '');
                const [res] = await engines[id].sock.onWhatsApp(num).catch(() => [null]);
                if (res?.exists) aktif.push(line.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            bot.sendMessage(chatId, `✅ **FILTER SELESAI**\nAktif: ${aktif.length}`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }],
                        [{ text: "♻️ RESTART", callback_data: 'restart_bot' }]
                    ]
                }
            });
        } catch (e) { bot.sendMessage(chatId, `❌ File Error.`); }
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        const engine = engines[id];
        if (!engine.sock) return;
        
        try {
            const numbers = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const pesanBlast = fs.readFileSync(engine.script, 'utf-8');
            
            bot.sendMessage(chatId, `🚀 **NINJA STORM: BOMBARDIR ${numbers.length} NOMOR...**`);

            // --- TRUE FIRE & FORGET BLASTING (SUPER KENCANG) ---
            for (let line of numbers) {
                const jid = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                // Langsung kirim tanpa await, biarkan socket engine yang mengurus antrean internal
                engine.sock.sendMessage(jid, { text: pesanBlast }).catch(() => {});
            }

            bot.sendMessage(chatId, `✅ **BOM SELESAI DILEPASKAN!**`);
        } catch (e) { bot.sendMessage(chatId, `❌ Blast Gagal.`); }
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
    bot.sendMessage(msg.chat.id, "♻️ **RESTARTING...**");
    setTimeout(() => process.exit(), 500);
});
