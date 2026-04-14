const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- WEB SERVER ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot Ninja Stealth Mode Online!'));
app.listen(PORT, '0.0.0.0', () => console.log(`Server port ${PORT}`));

// --- HELPERS ---
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function generateUniqueInvis() {
    const chars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
    let str = '';
    for (let i = 0; i < 3; i++) str += chars[Math.floor(Math.random() * chars.length)];
    return str;
}

function createProgressBar(current, total) {
    const size = 10;
    const progress = total > 0 ? Math.round((current / total) * size) : 0;
    const filled = "█".repeat(progress);
    const empty = "░".repeat(size - progress);
    return `${filled}${empty} ${Math.round((current / total) * 100)}%`;
}

let sock;
let isProcessing = false;
let userState = {};
let qrSent = false;
let speedMode = 'FAST'; 

// --- INITIALIZE WA (STEALTH CONFIG) ---
async function initWA(chatId, method, phoneNumber = null) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        // --- PENYAMARAN SISTEM (STEALTH) ---
        // Meniru macOS dengan Chrome versi terbaru agar tidak terbaca sebagai server Linux/Ubuntu
        browser: ["Mac OS", "Chrome", "122.0.6261.129"], 
        syncFullHistory: false, // Jangan sinkron history lama untuk kurangi beban data
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        // Hindari membaca pesan dari grup atau status untuk proteksi limit
        shouldIgnoreJid: jid => jid.includes('@g.us') || jid.includes('@broadcast'),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr && method === 'QR' && !qrSent) {
            qrSent = true; 
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR INI (NINJA STEALTH)**" });
        }
        if (connection === 'open') {
            qrSent = false;
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG (STEALTH MODE)!**\nSilahkan ketik `/filter`.");
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                initWA(chatId, method, phoneNumber);
            } else {
                bot.sendMessage(chatId, "❌ Logout. Silahkan /login lagi.");
                if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
            }
        }
    });

    if (method === 'CODE' && phoneNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                bot.sendMessage(chatId, `🔑 **KODE PAIRING:** \`${code}\``, { parse_mode: 'Markdown' });
            } catch (err) { bot.sendMessage(chatId, "❌ Gagal pairing."); }
        }, 5000);
    }
}

// --- TELEGRAM LOGIC ---
bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "Bot Ready! /login dulu."));

bot.onText(/\/login/, (msg) => {
    qrSent = false;
    const opts = { reply_markup: { inline_keyboard: [[{ text: "SCAN QR", callback_data: 'login_qr' }, { text: "CODE", callback_data: 'login_code' }]] } };
    bot.sendMessage(msg.chat.id, "Metode Login:", opts);
});

bot.onText(/\/stop/, (msg) => {
    if (isProcessing) {
        isProcessing = false;
        bot.sendMessage(msg.chat.id, "🛑 **BLAST DIHENTIKAN PAKSA!**");
    } else {
        bot.sendMessage(msg.chat.id, "⚠️ Tidak ada proses blast yang sedang berjalan.");
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    if (data === 'login_qr') initWA(chatId, 'QR');
    if (data === 'login_code') {
        userState[chatId] = 'WAITING_NUMBER';
        bot.sendMessage(chatId, "Masukkan nomor WA (Contoh: 62813...)");
    }
    if (data.startsWith('mode_')) {
        speedMode = data.replace('mode_', '').toUpperCase();
        await bot.answerCallbackQuery(query.id);
        bot.sendMessage(chatId, `🚀 Mode **${speedMode}** Terpilih!\n\nSilahkan /jalan\n🦏 **SEMOGA KETEMU BADAK NYA !**`);
    }
});

bot.on('message', (msg) => {
    if (userState[msg.chat.id] === 'WAITING_NUMBER' && msg.text && !msg.text.startsWith('/')) {
        let num = msg.text.replace(/[^0-9]/g, '');
        if (num.startsWith('0')) num = '62' + num.slice(1);
        initWA(msg.chat.id, 'CODE', num);
        delete userState[msg.chat.id];
    }
});

bot.onText(/\/filter/, async (msg) => {
    const chatId = msg.chat.id;
    if (!sock) return bot.sendMessage(chatId, "Hubungkan WA dulu!");
    try {
        const raw = fs.readFileSync('nomor.txt', 'utf-8');
        const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 5);
        let progressMsg = await bot.sendMessage(chatId, `🔍 **FILTERING...**`);
        for (let i = 0; i < lines.length; i++) {
            let num = lines[i].trim().split(/\s+/).pop().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            await sock.sendPresenceUpdate('available', num);
            await delay(500);
            if ((i + 1) % 5 === 0) {
                bot.editMessageText(`🔍 Filtering: ${createProgressBar(i+1, lines.length)}`, { chat_id: chatId, message_id: progressMsg.message_id }).catch(()=>{});
            }
        }
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "💥 SUPER FAST", callback_data: 'mode_super' }],
                    [{ text: "🔥 FAST", callback_data: 'mode_fast' }],
                    [{ text: "🐌 SLOW", callback_data: 'mode_slow' }]
                ]
            }
        };
        bot.sendMessage(chatId, "✅ **FILTER SELESAI!** Pilih mode:", opts);
    } catch (e) { bot.sendMessage(chatId, "❌ File nomor.txt bermasalah."); }
});

// --- JALAN ---
bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing) return bot.sendMessage(chatId, "⚠️ Blast sedang berjalan!");
    if (!sock) return bot.sendMessage(chatId, "Login dulu!");

    try {
        const lines = fs.readFileSync('nomor.txt', 'utf-8').split(/\r?\n/).filter(l => l.trim().length > 5);
        const s1 = fs.readFileSync('script1.txt', 'utf-8');
        const s2 = fs.readFileSync('script2.txt', 'utf-8');

        isProcessing = true;
        let success = 0;
        let progressMsg = await bot.sendMessage(chatId, `🚀 **START BLASTING...**\nKetik /stop untuk berhenti.`);
        
        for (let i = 0; i < lines.length; i++) {
            if (!isProcessing) break;
            
            let parts = lines[i].trim().split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let jid = nomor + "@s.whatsapp.net";
            let msgText = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, nama) + generateUniqueInvis();
            let currentIdx = i + 1;

            // --- LOGIKA DELAY NINJA SENDER ---
            if (speedMode === 'SUPER') {
                if (currentIdx <= 6) {
                    await delay(1000); // 1-6 Chat: 1 Detik
                } else if (currentIdx === 71) {
                    await bot.sendMessage(chatId, "⏳ **Jeda Aman 3 Detik...**").catch(()=>{});
                    await delay(3000); // Chat 71: Jeda 3 Detik
                } else {
                    // Chat 7-70 & Chat 72 ke atas: 0 Detik (Tanpa jeda)
                }
            } else if (speedMode === 'FAST') {
                await delay(1000);
            } else if (speedMode === 'SLOW') {
                await delay((currentIdx <= 30) ? 2000 : 1000);
            }

            try {
                // Presence update (Typing) membuat pengiriman lebih natural
                await sock.sendPresenceUpdate('composing', jid);
                await delay(200); 
                await sock.sendMessage(jid, { text: msgText });
                
                success++;
                if (success % 2 === 0 || i === lines.length - 1) {
                    bot.editMessageText(`🚀 Proses: ${createProgressBar(success, lines.length)}`, { chat_id: chatId, message_id: progressMsg.message_id }).catch(()=>{});
                }
            } catch (e) { console.log("Gagal: " + nomor); }
        }

        if (isProcessing) {
            bot.sendMessage(chatId, `🏁 **MISI SELESAI!**\n✅ Berhasil: ${success}\n🦏 TETAP SEMANGAT YA !!`);
        }
        isProcessing = false;
    } catch (e) { 
        bot.sendMessage(chatId, "❌ Script error."); 
        isProcessing = false; 
    }
});

bot.onText(/\/restart/, (msg) => {
    isProcessing = false;
    if (sock) sock.end();
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    bot.sendMessage(msg.chat.id, "♻️ Bot Reset. Silahkan /login.");
});
