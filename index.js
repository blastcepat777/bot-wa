const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, {polling: true});

let client;
let isProcessing = false;
let successCount = 0;
let userState = {};

// Inisialisasi Client WA
function initClient(chatId) {
    client = new Client({
        authStrategy: new LocalAuth({ dataPath: './sessions' }),
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions']
        }
    });

    client.on('qr', (qr) => {
        if (userState[chatId] === 'WAITING_QR') {
            qrcode.toBuffer(qr, (err, buffer) => {
                bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR INI SEGERA**" });
            });
        }
    });

    client.on('ready', () => {
        bot.sendMessage(chatId, "✅ **WA SUDAH TERHUBUNG**, silahkan `/filter` untuk membuka history chat");
    });

    client.on('disconnected', (reason) => {
        isProcessing = false;
        bot.sendMessage(chatId, `❌ **WA TERBLOKIR / TERPUTUS**\n\n**REKAP TERKIRIM:** ${successCount}\nSilahkan klik `/restart` untuk membersihkan sesi.`);
    });

    client.initialize().catch(err => console.error("Init Error:", err));
}

// --- LOGIKA COMMAND TELEGRAM ---

bot.onText(/\/login/, (msg) => {
    const chatId = msg.chat.id;
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "QR", callback_data: 'qr_mode' }, { text: "Kode", callback_data: 'pair_mode' }]
            ]
        }
    };
    bot.sendMessage(chatId, "Mau login pakai apa?", opts);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'qr_mode') {
        userState[chatId] = 'WAITING_QR';
        bot.sendMessage(chatId, "⏳ Menyiapkan Barcode...");
        initClient(chatId);
    } else if (query.data === 'pair_mode') {
        userState[chatId] = 'WAITING_NUMBER';
        bot.sendMessage(chatId, "Masukkan nomor WhatsApp (contoh: 6281365598770):");
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (userState[chatId] === 'WAITING_NUMBER' && !text.startsWith('/')) {
        bot.sendMessage(chatId, "⏳ Meminta kode pairing...");
        initClient(chatId);
        
        // Tunggu internal client siap sebentar
        setTimeout(async () => {
            try {
                const pairingCode = await client.requestPairingCode(text.replace(/[^
