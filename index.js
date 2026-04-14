const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- WEB SERVER ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot Ninja Stealth Active!'));
app.listen(PORT, '0.0.0.0', () => console.log(`Server port ${PORT}`));

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

async function initWA(chatId, method, phoneNumber = null) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    if (!userState[chatId]) userState[chatId] = {};
    userState[chatId].isConnected = false;

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Mac OS", "Chrome", "122.0.6261.129"], 
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && method === 'QR' && !qrSent) {
            qrSent = true; 
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR INI**" });
        }

        if (connection === 'open') {
            qrSent = false;
            if (!userState[chatId].isConnected) {
                bot.sendMessage(chatId, "✅ **WA TERHUBUNG!**\nKetik `/filter` untuk cek nomor.");
                userState[chatId].isConnected = true; 
            }
        }

        if (connection === 'close') {
            userState[chatId].isConnected = false;
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                initWA(chatId, method, phoneNumber);
            } else {
                bot.sendMessage(chatId, "❌ **LOGOUT!** Silahkan ketik /login lagi.");
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

// --- TELEGRAM COMMANDS ---
bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "Bot Ninja Ready! Silahkan /login."));

bot.onText(/\/login/, (msg) => {
    qrSent = false;
    const opts = { reply_markup: { inline_keyboard: [[{ text: "SCAN QR", callback_data: 'login_qr' }, { text: "CODE", callback_data: 'login_code' }]] } };
    bot.sendMessage(msg.chat.id, "Metode Login:", opts);
});

bot.onText(/\/stop/, (msg) => {
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🛑 **STOPPED.**");
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'login_qr') initWA(chatId, 'QR');
    if (query.data === 'login_code') {
        userState[chatId] = { ...userState[chatId], step: 'WAITING_NUMBER' };
        bot.sendMessage(chatId, "Masukkan nomor WA (Contoh: 62813...)");
    }
    if (query.data.startsWith('mode_')) {
        speedMode = query.data.replace('mode_', '').toUpperCase();
        await bot.answerCallbackQuery(query.id);
        bot.sendMessage(chatId, `🚀 Mode **${speedMode}** Terpilih!\nKetik /jalan`);
    }
});

bot.on('message', (msg) => {
    if (userState[msg.chat.id]?.step === 'WAITING_NUMBER' && msg.text && !msg.text.startsWith('/')) {
        let num = msg.text.replace(/[^0-9]/g, '');
        if (num.startsWith('0')) num = '62' + num.slice(1);
        initWA(msg.chat.id, 'CODE', num);
        delete userState[msg.chat.id].step;
    }
});

bot.onText(/\/filter/, async (msg) => {
    const chatId = msg.chat.id;
    if (!sock) return bot.sendMessage(chatId, "Hubungkan WA dulu!");
    const filePath = path.join(__dirname, 'nomor.txt');

    try {
        if (!fs.existsSync(filePath)) return bot.sendMessage(chatId, "❌ File `nomor.txt` tidak ditemukan!");
        const raw = fs.readFileSync(filePath, 'utf-8').replace(/\r/g, '');
        const lines = raw.split('\n').filter(l => l.trim().length > 5);
        if (lines.length === 0) return bot.sendMessage(chatId, "❌ File `nomor.txt` kosong!");

        let progressMsg = await bot.sendMessage(chatId, `🔍 **FILTERING...**`);
        for (let i = 0; i < lines.length; i++) {
            let num = lines[i].trim().split(/\s+/).pop().replace(/[^0-9]/g, '') + "@s.whatsapp.net";
            await sock.sendPresenceUpdate('available', num);
            await delay(300); 
            if ((i + 1) % 10 === 0 || (i + 1) === lines.length) {
                bot.editMessageText(`🔍 Filter: ${createProgressBar(i+1, lines.length)}`, { chat_id: chatId, message_id: progressMsg.message_id }).catch(()=>{});
            }
        }

        const opts = {
            reply_markup: {
                inline_keyboard: [[{ text: "💥 SUPER FAST", callback_data: 'mode_super' }], [{ text: "🔥 FAST", callback_data: 'mode_fast' }]]
            }
        };
        bot.sendMessage(chatId, "✅ **FILTER SELESAI!** Pilih mode:", opts);
    } catch (e) { bot.sendMessage(chatId, "❌ Gagal baca nomor.txt"); }
});

bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing) return;
    if (!sock) return bot.sendMessage(chatId, "Login dulu!");

    const filePath = path.join(__dirname, 'nomor.txt');

    try {
        const rawNomor = fs.readFileSync(filePath, 'utf-8').replace(/\r/g, '');
        const lines = rawNomor.split('\n').filter(l => l.trim().length > 5);
        const s1 = fs.readFileSync(path.join(__dirname, 'script1.txt'), 'utf-8');
        const s2 = fs.readFileSync(path.join(__dirname, 'script2.txt'), 'utf-8');

        isProcessing = true;
        let success = 0;
        let progressMsg = await bot.sendMessage(chatId, `🚀 **BLASTING START...**`);
        
        for (let i = 0; i < lines.length; i++) {
            if (!isProcessing) break;
            
            let parts = lines[i].trim().split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let jid = nomor + "@s.whatsapp.net";
            let msgText = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, nama) + generateUniqueInvis();
            
            // --- LOGIKA NINJA SENDER SUPER FAST ---
            if (speedMode === 'SUPER') {
                const chatNumber = i + 1;
                if (chatNumber <= 4) {
                    await delay(1000); // 1-4: Pemanasan 1 detik
                } else if (chatNumber >= 5 && chatNumber <= 70) {
                    // 5-70: MELEDAK 0 DETIK (Tanpa await delay)
                } else if (chatNumber === 71) {
                    await delay(3000); // 71: Istirahat 3 detik
                } else {
                    // 72 ke atas: MELEDAK 0 DETIK (Tanpa await delay)
                }
            } else {
                await delay(1000); // Mode FAST biasa tetap 1 detik
            }

            try {
                await sock.sendMessage(jid, { text: msgText });
                success++;
                if (success % 10 === 0 || i === lines.length - 1) {
                    bot.editMessageText(`🚀 Proses: ${createProgressBar(success, lines.length)}`, { chat_id: chatId, message_id: progressMsg.message_id }).catch(()=>{});
                }
            } catch (e) { console.log("Gagal: " + nomor); }
        }
        bot.sendMessage(chatId, `🏁 **SELESAI!** ✅ Berhasil: ${success}`);
        isProcessing = false;
    } catch (e) { 
        bot.sendMessage(chatId, "❌ Error membaca file."); 
        isProcessing = false; 
    }
});

bot.onText(/\/restart/, (msg) => {
    isProcessing = false;
    if (sock) sock.end();
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    bot.sendMessage(msg.chat.id, "♻️ Bot Reset. Silahkan /login.");
});
