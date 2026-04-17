const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi Anti-Crash Global
process.on('uncaughtException', (err) => console.log('Sistem Aman dari Crash:', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection Aman:', reason));

let stats = { totalBlast: 0, hariIni: 0, terahirUpdate: new Date().toLocaleDateString('id-ID') };
let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪' },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊' }
};

// --- KEYBOARD SEJAJAR 3 TOMBOL ---
const menuBawah = {
    reply_markup: {
        keyboard: [[
            { text: "📊 LAPORAN HARIAN" }, 
            { text: "♻️ RESTART" }, 
            { text: "🛡️ CEK STATUS WA" }
        ]],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

const safeDelete = async (chatId, msgId) => {
    if (msgId) { try { await bot.deleteMessage(chatId, msgId); } catch (e) {} }
};

// --- FUNGSI UPDATE QR DENGAN JAM & TANGGAL ---
async function sendOrUpdateQR(chatId, id, buffer) {
    const sekarang = new Date();
    const tanggal = sekarang.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const jam = sekarang.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const otherId = id == 1 ? 2 : 1;
    const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n` +
                    `📅 **Tanggal:** ${tanggal}\n` +
                    `⌚ **Update Jam:** ${jam}\n\n` +
                    `_Segera scan sebelum barcode kadaluarsa!_`;

    const markup = {
        inline_keyboard: [
            [{ text: `(ON)${engines[otherId].color} QR${otherId}`, callback_data: `login_${otherId}` }],
            [{ text: "❌ CANCEL", callback_data: 'batal' }]
        ]
    };

    await safeDelete(chatId, engines[id].lastQrMsgId);
    const sent = await bot.sendPhoto(chatId, buffer, { caption, reply_markup: markup, parse_mode: 'Markdown' });
    engines[id].lastQrMsgId = sent.message_id;
}

async function initWA(chatId, id) {
    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ninja Storm", "Chrome", "1.0.0"]
    });

    engines[id].sock.ev.on('creds.update', saveCreds);
    engines[id].sock.ev.on('connection.update', async (u) => {
        const { connection, qr } = u;
        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 4 });
            await sendOrUpdateQR(chatId, id, buffer);
        }
        if (connection === 'open') {
            await safeDelete(chatId, engines[id].lastQrMsgId);
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE** ✅`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                }
            });
        }
    });
}

// --- HANDLER PESAN ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (msg.text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ **BERHASIL RESTART...**", {
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]] }
        });
        setTimeout(() => process.exit(0), 1000);
    }
    if (msg.text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **REKAPAN BLAST**\n\nHari Ini: ${stats.hariIni}\nTotal: ${stats.totalBlast}`, menuBawah);
    }
    if (msg.text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **CEK KEAMANAN WA**\n\n";
        for (let i = 1; i <= 2; i++) {
            status += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ AMAN" : "❌ LIMIT/OFF"}\n`;
        }
        bot.sendMessage(chatId, status, menuBawah);
    }
});

// --- HANDLER CALLBACK ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    const data = q.data;

    if (data === 'cmd_login') {
        bot.editMessageText("🚀 Pilih Engine:", {
            chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "🌪 QR1", callback_data: 'login_1' }, { text: "🌊 QR2", callback_data: 'login_2' }]] }
        });
    }

    if (data.startsWith('login_')) {
        initWA(chatId, data.split('_')[1]);
    }

    // --- LOGIKA FILTER NOMOR ---
    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Engine ${id} belum login!`);
        
        bot.sendMessage(chatId, `${engines[id].color} **FILTER ENGINE ${id} BERJALAN...**`);
        try {
            const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            let aktif = [];
            for (const line of lines) {
                const num = line.replace(/[^0-9]/g, '');
                const [res] = await engines[id].sock.onWhatsApp(num).catch(() => [null]);
                if (res?.exists) aktif.push(line.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            
            bot.sendMessage(chatId, `✅ **FILTER ${id} SELESAI**\nAktif: ${aktif.length}\n\nLanjut Blast?`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                }
            });
        } catch (e) { bot.sendMessage(chatId, `❌ File ${engines[id].file} tidak ditemukan.`); }
    }

    // --- LOGIKA JALAN BLAST ---
    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        try {
            const numbers = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const pesanBlast = fs.readFileSync(engines[id].script, 'utf-8'); 
            bot.sendMessage(chatId, `🚀 **BLAST ENGINE ${id} MULAI...**`);
            
            for (let line of numbers) {
                const num = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                await engines[id].sock.sendMessage(num, { text: pesanBlast }).catch(() => {});
                stats.totalBlast++;
                stats.hariIni++;
            }
            bot.sendMessage(chatId, `✅ **ENGINE ${id} SELESAI BLAST!**`, {
                reply_markup: { inline_keyboard: [[{ text: "❌ CANCEL", callback_data: 'batal' }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ Gagal Blast. Periksa file aktif."); }
    }

    if (data === 'batal') {
        await safeDelete(chatId, msgId);
        bot.sendMessage(chatId, "❌ Aksi dibatalkan.", menuBawah);
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, `🌪️ **NINJA STORM ENGINE READY**`, menuBawah));
