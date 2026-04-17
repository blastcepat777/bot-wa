const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Mencegah Crash Global
process.on('uncaughtException', (err) => console.log('Sistem Aman dari Crash:', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection Aman:', reason));

// Data Statistik untuk Laporan Harian
let stats = { totalBlast: 0, hariIni: 0, terahirUpdate: new Date().toLocaleDateString() };

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', script: 'script1.txt', color: '🌪', isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', script: 'script2.txt', color: '🌊', isInitializing: false }
};

// --- MENU KEYBOARD 3 BARIS (SESUAI INSTRUKSI) ---
const menuBawah = {
    reply_markup: {
        keyboard: [
            [{ text: "📊 LAPORAN HARIAN" }],   // Baris 1
            [{ text: "♻️ RESTART" }],          // Baris 2 (Tengah)
            [{ text: "🛡️ CEK STATUS WA" }]      // Baris 3
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

// Fungsi Hapus Pesan Aman (Anti-Crash)
const safeDelete = async (chatId, msgId) => {
    if (msgId) {
        try { await bot.deleteMessage(chatId, msgId); } catch (e) {}
    }
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
        browser: ["Ninja Storm", "Chrome", "1.0.0"]
    });

    const sock = engines[id].sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 4 });
                const otherId = id == 1 ? 2 : 1;
                const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**`;
                
                const markup = {
                    inline_keyboard: [
                        [{ text: `(ON)${engines[otherId].color} QR${otherId}`, callback_data: `login_${otherId}` }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                };

                await safeDelete(chatId, engines[id].lastQrMsgId);
                const sent = await bot.sendPhoto(chatId, buffer, { caption, parse_mode: 'Markdown', reply_markup: markup });
                engines[id].lastQrMsgId = sent.message_id;
            } catch (e) {}
        }

        if (connection === 'open') {
            engines[id].isInitializing = false;
            await safeDelete(chatId, engines[id].lastQrMsgId);
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE**\nStatus: AMAN ✅`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `🔍 FILTER NOMOR ${id}`, callback_data: `filter_${id}` }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                }
            });
        }
        
        if (connection === 'close') {
            engines[id].isInitializing = false;
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                initWA(chatId, id);
            } else {
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} LOGOUT/BLOCKED!** ❌`);
            }
        }
    });
}

// --- HANDLER PESAN TEKS (KEYBOARD) ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (msg.text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ **BERHASIL RESTART...**", {
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]] }
        });
        setTimeout(() => process.exit(0), 1000);
    }

    if (msg.text === "📊 LAPORAN HARIAN") {
        let laporan = `📊 **LAPORAN BLAST NINJA STORM**\n\n`;
        laporan += `📅 Tanggal: ${stats.terahirUpdate}\n`;
        laporan += `🚀 Blast Hari Ini: ${stats.hariIni}\n`;
        laporan += `📈 Total Keseluruhan: ${stats.totalBlast}\n\n`;
        laporan += `_Status: Data akan direset jika sistem mati total._`;
        bot.sendMessage(chatId, laporan, menuBawah);
    }

    if (msg.text === "🛡️ CEK STATUS WA") {
        let status = "🛡️ **PENGECEKAN KEAMANAN WA**\n\n";
        for (let i = 1; i <= 2; i++) {
            const isLive = engines[i].sock?.user ? "✅ AMAN (Terhubung)" : "❌ OFFLINE / BLOCKED / LIMIT";
            status += `${engines[i].color} Engine ${i}: ${isLive}\n`;
        }
        bot.sendMessage(chatId, status, menuBawah);
    }
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    const data = q.data;

    if (data === 'cmd_login') {
        bot.editMessageText("🚀 Pilih Engine:", {
            chat_id: chatId, message_id: msgId,
            reply_markup: {
                inline_keyboard: [[{ text: "🌪 QR1", callback_data: 'login_1' }, { text: "🌊 QR2", callback_data: 'login_2' }]]
            }
        });
    }

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        bot.sendMessage(chatId, `⏳ **Menyiapkan QR Engine ${id}...**`);
        initWA(chatId, id);
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Engine ${id} belum login!`);
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
            bot.sendMessage(chatId, `✅ **FILTER ${id} SELESAI**\nAktif: ${aktif.length}`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `🚀 JALAN BLAST ${id}`, callback_data: `jalan_${id}` }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                }
            });
        } catch (e) { bot.sendMessage(chatId, `❌ File ${engines[id].file} tidak ditemukan.`); }
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        try {
            const numbers = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const pesanBlast = fs.readFileSync(engines[id].script, 'utf-8'); 
            bot.sendMessage(chatId, `🚀 **MELEDAKKAN ${numbers.length} PESAN...**`);
            
            for (let line of numbers) {
                const num = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                await engines[id].sock.sendMessage(num, { text: pesanBlast }).catch(() => {});
                stats.totalBlast++;
                stats.hariIni++;
            }
            bot.sendMessage(chatId, `✅ **BLAST ${id} SELESAI!**`, {
                reply_markup: { inline_keyboard: [[{ text: "❌ CANCEL", callback_data: 'batal' }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ Gagal Blast: Cek file aktif atau script."); }
    }

    if (data === 'batal') {
        await safeDelete(chatId, msgId);
        bot.sendMessage(chatId, "❌ Aksi dibatalkan.", menuBawah);
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `🌪️ **NINJA STORM ENGINE READY**`, menuBawah);
});
