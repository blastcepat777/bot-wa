const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_PESAN = './script.txt';
const FILE_TEMP_FILTER = 'database_valid.json';

// Inisialisasi WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false, // Memunculkan Chrome
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // UNTUK WINDOWS (Jika error, hapus baris ini)
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-extensions'
        ]
    }
});

let isProcessing = false;
let targetChatId = null;

// --- EVENT WHATSAPP ---
client.on('qr', async (qr) => {
    console.log("👉 QR DITERIMA, KIRIM KE TELEGRAM...");
    if (targetChatId) {
        const buffer = await QRCode.toBuffer(qr);
        bot.sendPhoto(targetChatId, buffer, { caption: "📸 **SCAN QR DI CHROME KAMU**" });
    }
});

client.on('ready', () => {
    console.log('✅ CHROME SIAP!');
    if (targetChatId) bot.sendMessage(targetChatId, "✅ **CHROME TERHUBUNG!**");
});

client.on('auth_failure', () => {
    console.error('❌ Gagal login, coba hapus folder .wwebjs_auth');
});

// --- KONTROL TELEGRAM ---
bot.onText(/\/qr/, (msg) => {
    targetChatId = msg.chat.id;
    bot.sendMessage(targetChatId, "⏳ Mencoba membuka Chrome... Cek taskbar kamu.");
    client.initialize().catch(e => {
        console.error(e);
        bot.sendMessage(targetChatId, "❌ Gagal buka Chrome. Pastikan Google Chrome sudah terinstal.");
    });
});

// Fungsi Filter & Jalankan tetap sama seperti sebelumnya...
// (Tambahkan kode filter & jalankan kamu di sini)

bot.onText(/\/stop/, (msg) => {
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🛑 Berhenti.");
});

console.log("🤖 Sistem Remote Aktif. Ketik /qr di Telegram.");
