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

process.on('uncaughtException', (err) => console.log('Critical Error: ', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection: ', reason));

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪', isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊', isInitializing: false }
};

const loginKeyboard = [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]];

// Tombol Engine biar tidak hilang
const getEngineMarkup = (id) => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
            [{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }],
            [{ text: "♻️ RESTART", callback_data: 'restart_bot' }],
            [{ text: "❌ KELUAR", callback_data: 'batal' }]
        ]
    }
});

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
                const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**`;
                const sent = await bot.sendPhoto(chatId, buffer, { 
                    caption, 
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ CANCEL", callback_data: 'batal' }]] }
                });
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                engines[id].lastQrMsgId = sent.message_id;
            } catch (e) {}
        }

        if (connection === 'open') {
            engines[id].isInitializing = false;
            if (chatId) {
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE**`, getEngineMarkup(id));
            }
        }
        
        if (connection === 'close') {
            engines[id].isInitializing = false;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) initWA(chatId, id);
        }
    });
}

// AUTO-CONNECT RAILWAY
Object.keys(engines).forEach(id => {
    if (fs.existsSync(engines[id].session)) initWA(null, id); 
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    const data = q.data;

    if (data === 'restart_bot') {
        await bot.sendMessage(chatId, "♻️ **REBOOTING SYSTEM...**");
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
        initWA(chatId, id);
        bot.answerCallbackQuery(q.id, { text: "Menyiapkan QR..." });
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Engine ${id} belum login!`);
        
        bot.sendMessage(chatId, `${engines[id].color} **FILTERING START...**`);
        try {
            const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            let aktif = [];
            for (const line of lines) {
                const num = line.replace(/[^0-9]/g, '');
                const [res] = await engines[id].sock.onWhatsApp(num).catch(() => [null]);
                if (res?.exists) aktif.push(line.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            bot.sendMessage(chatId, `✅ **FILTER ${id} SELESAI**\nAktif: ${aktif.length} Nomor`, getEngineMarkup(id));
        } catch (e) { bot.sendMessage(chatId, `❌ File ${engines[id].file} tidak ada.`); }
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        const engine = engines[id];
        if (!engine.sock) return bot.sendMessage(chatId, `❌ Engine ${id} mati!`);
        
        try {
            const fileName = `aktif_${id}.txt`;
            if (!fs.existsSync(fileName)) return bot.sendMessage(chatId, `❌ Filter dulu Bos!`);
            
            const numbers = fs.readFileSync(fileName, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const pesanBlast = fs.readFileSync(engine.script, 'utf-8');
            
            bot.sendMessage(chatId, `🚀 **NINJA STORM: MELEDAKKAN ${numbers.length} PESAN...**`);

            // --- TRUE FIRE & FORGET (BUFFERED) ---
            numbers.forEach((line) => {
                const jid = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                // Kirim tanpa await agar lari secepat kilat
                engine.sock.sendMessage(jid, { text: pesanBlast }).catch(() => {});
            });

            // Tombol dimunculkan kembali SEGERA setelah peluru dilepaskan
            setTimeout(() => {
