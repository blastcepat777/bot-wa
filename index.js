const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

// KONFIGURASI
const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});
const FILE_NOMOR = 'nomor.txt';
const FILE_PESAN = './script.txt';
const FILE_TEMP_FILTER = 'database_valid.json';

let sock = null;
let isProcessing = false;
let isLogged = false;
let showQR = false;

// INISIALISASI FILE
if (!fs.existsSync(FILE_NOMOR)) fs.writeFileSync(FILE_NOMOR, '');
if (!fs.existsSync(FILE_PESAN)) fs.writeFileSync(FILE_PESAN, 'Halo {id}');

// FUNGSI KONEKSI WHATSAPP
async function konekWA(chatId = null) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["WSO288 Turbo", "Chrome", "1.0.0"],
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && showQR && chatId) {
            try {
                const buffer = await QRCode.toBuffer(qr);
                await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR WHATSAPP**" });
                showQR = false; 
            } catch (e) { console.error("Gagal kirim QR ke Telegram"); }
        }

        if (connection === 'open') {
            isLogged = true;
            console.log("✅ WhatsApp Terhubung!");
            if (chatId) bot.sendMessage(chatId, "✅ **WHATSAPP TERHUBUNG!**\nSiap digunakan.");
        }

        if (connection === 'close') {
            isLogged = false;
            const status = lastDisconnect?.error?.output?.statusCode;
            console.log("❌ Koneksi Terputus. Status:", status);
            if (status !== DisconnectReason.loggedOut) {
                konekWA(chatId);
            }
        }
    });
}

// HANDLER PERINTAH TELEGRAM
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '/qr') {
        showQR = true;
        bot.sendMessage(chatId, "⏳ Menyiapkan QR Code...");
        konekWA(chatId);
    }

    else if (text === '/filter') {
        if (!isLogged) return bot.sendMessage(chatId, "⚠️ Hubungkan WA dulu via /qr");
        if (isProcessing) return bot.sendMessage(chatId, "⚠️ Proses lain sedang berjalan.");

        const rawData = fs.readFileSync(FILE_NOMOR, 'utf-8').split('\n').filter(l => l.trim() !== '');
        if (rawData.length === 0) return bot.sendMessage(chatId, "❌ Isi nomor.txt dulu!");

        isProcessing = true;
        let valid = [];
        bot.sendMessage(chatId, `🔍 Memulai Filter ${rawData.length} nomor...`);

        for (let line of rawData) {
            if (!isProcessing) break;
