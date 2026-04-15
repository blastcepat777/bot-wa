const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATABASE REPORT ---
const REPORT_FILE = './daily_report.json';
function getReport() {
    const today = new Date().toLocaleDateString('id-ID');
    if (!fs.existsSync(REPORT_FILE)) return { date: today, total: 0 };
    let data = JSON.parse(fs.readFileSync(REPORT_FILE));
    if (data.date !== today) return { date: today, total: 0 };
    return data;
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

let sock;
let isProcessing = false;
let userState = {};
let qrMsgId = null; // KUNCI UTAMA: Melacak ID pesan Barcode

async function initWA(chatId, method, phoneNumber = null, msgToEdit = null) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Windows", "Chrome", "122.0.0.0"],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        defaultQueryTimeoutMs: 0,
        connectTimeoutMs: 60000,
        retryRequestDelayMs: 0,
        maxMsgRetryCount: 0,
        shouldSyncHistoryMessage: () => false,
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
        const { connection, qr } = u;

        // --- LOGIKA UPDATE QR DI TEMPAT YANG SAMA ---
        if (qr && method === 'QR') {
            const buffer = await QRCode.toBuffer(qr, { scale: 8 });
            
            // 1. Hapus barcode lama jika ada
            if (qrMsgId) {
                await bot.deleteMessage(chatId, qrMsgId).catch(() => {});
            }
            
            // 2. Hapus menu pilihan (tombol) saat pertama kali diklik
            if (msgToEdit && !qrMsgId) {
                await bot.deleteMessage(chatId, msgToEdit).catch(() => {});
            }

            // 3. Kirim barcode baru & simpan ID-nya
            const sentPhoto = await bot.sendPhoto(chatId, buffer, { 
                caption: `📸 **SCAN QR SEKARANG**\nUpdate: ${new Date().toLocaleTimeString()}\n(Otomatis berganti di sini)` 
            });
            qrMsgId = sentPhoto.message_id;
        }

        if (connection === 'open') {
            if (qrMsgId) await bot.deleteMessage(chatId, qrMsgId).catch(() => {});
            qrMsgId = null;
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG**\nMode Ninja Stealth Aktif.");
        }
        
        if (connection === 'close') {
            const shouldReconnect = u.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) initWA(chatId, method, phoneNumber);
        }
    });

    // --- LOGIKA UPDATE KODE PAIRING DI TEMPAT YANG SAMA ---
    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        try {
            let code = await sock.requestPairingCode(phoneNumber);
            const text = `🔑 **KODE PAIRING ANDA:**\n\n\`${code}\`\n\nMasukkan di notifikasi WA HP Anda.`;
            if (msgToEdit) {
                bot.editMessageText(text, { chat_id: chatId, message_id: msgToEdit, parse_mode: 'Markdown' });
            } else {
                bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
            }
        } catch (err) {
            bot.sendMessage(chatId, "❌ Gagal generate kode.");
        }
    }
}

// --- COMMANDS ---
bot.onText(/\/start/, (msg) => {
    const rep = getReport();
    const welcome = `Selamat datang di **NINJA BLAST ENGINE**\n\n` +
                    `📊 **REPORT HARI INI:** ${rep.total} Chat Terkirim\n` +
                    `Status: ${sock ? "🟢 Online" : "🔴 Offline"}\n\n` +
                    `/login - Hubungkan WA\n/jalan - Ledakkan Blast\n/restart - Reset & Info`;
    bot.sendMessage(msg.chat.id, welcome, { parse_mode: 'Markdown' });
});

bot.onText(/\/login/, (msg) => {
    qrMsgId = null; // Reset tracker QR saat login ulang
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📸 Pakai QR Scan", callback_data: 'l_qr' }],
                [{ text: "🔑 Pakai Kode Pairing", callback_data: 'l_cd' }]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, "Pilih metode login:", opts);
});

bot.on('callback_query', (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    if (q.data === 'l_qr') initWA(chatId, 'QR', null, msgId);
    if (q.data === 'l_cd') {
        userState[chatId] = { step: 'WAIT_NUM', msgId: msgId };
        bot.editMessageText("📞 **Masukkan Nomor WA Anda:**", { chat_id: chatId, message_id: msgId });
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (userState[chatId]?.step === 'WAIT_NUM' && msg.text && !msg.text.startsWith('/')) {
        const num = msg.text.replace(/[^0-9]/g, '');
        const targetMsgId = userState[chatId].msgId;
        bot.deleteMessage(chatId, msg.message_id).catch(() => {}); 
        bot.editMessageText("⏳ **Menggenerate kode...**", { chat_id: chatId, message_id: targetMsgId });
        initWA(chatId, 'CODE', num, targetMsgId);
        delete userState[chatId];
    }
});

// --- ENGINE BLAST: 0 DETIK MELEDAK ---
bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing || !sock) return bot.sendMessage(chatId, "🔴 Belum login!");

    isProcessing = true;
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const s1 = fs.readFileSync('script1.txt', 'utf-8');
        const s2 = fs.readFileSync('script2.txt', 'utf-8');
        
        bot.sendMessage(chatId, `🌪️ **STORM STARTED!**\nMeledakkan ${data.length} chat...`);

        data.forEach((line, i) => {
            process.nextTick(async () => {
                const parts = line.trim().split(/\s+/);
                const jid = parts[parts.length - 1].replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                const pesan = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, parts[0]);

                try {
                    await sock.sendPresenceUpdate('composing', jid);
                    setTimeout(async () => {
                        await sock.sendMessage(jid, { text: pesan });
                        await sock.sendPresenceUpdate('paused', jid);
                    }, Math.random() * 1000); 
                } catch (e) {}
            });
        });

        updateReport(data.length);
        const rep = getReport();

        bot.sendMessage(chatId, `🚀 **BOOM! MELEDAK.**\n\n✅ Berhasil: ${data.length}\n📊 Total Hari Ini: ${rep.total}`);
        setTimeout(() => { isProcessing = false; }, 5000);

    } catch (e) {
        bot.sendMessage(chatId, "❌ File error.");
        isProcessing = false;
    }
});

bot.onText(/\/restart/, async (msg) => {
    const rep = getReport();
    const info = `♻️ **SYSTEM RESTARTING...**\n\n` +
                 `📈 Hari Ini: ${rep.date}\n` +
                 `🏆 Total Blast: ${rep.total}\n\n` +
                 `Sesi dibersihkan. Silahkan /login kembali.`;
    
    await bot.sendMessage(msg.chat.id, info, { parse_mode: 'Markdown' });
    
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    setTimeout(() => { process.exit(); }, 2000);
});
