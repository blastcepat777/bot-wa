const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_PESAN = './script.txt';
const FILE_TEMP_FILTER = 'database_valid.json';

// Inisialisasi Chrome dengan proteksi RAM
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    }
});

let isProcessing = false;
let targetChatId = null;

// --- PROTEKSI CRASH GLOBAL ---
process.on('uncaughtException', (err) => {
    console.error('💥 CRASH TERHINDARI (Uncaught Exception):', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 CRASH TERHINDARI (Unhandled Rejection):', reason);
});

// --- EVENT WHATSAPP ---
client.on('qr', async (qr) => {
    console.log("📸 QR Code muncul, silakan cek Telegram...");
    if (targetChatId) {
        try {
            const buffer = await QRCode.toBuffer(qr);
            await bot.sendPhoto(targetChatId, buffer, { caption: "📸 **SCAN QR DI CHROME KAMU**" });
        } catch (e) { console.log("Gagal kirim QR"); }
    }
});

client.on('ready', () => {
    console.log('✅ WhatsApp Ready & Terhubung!');
    if (targetChatId) bot.sendMessage(targetChatId, "✅ **WHATSAPP READY!**\nChrome sudah terbuka & login.");
});

client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp Terputus:', reason);
    isProcessing = false;
});

// --- KONTROL TELEGRAM ---
bot.onText(/\/qr/, async (msg) => {
    targetChatId = msg.chat.id;
    bot.sendMessage(targetChatId, "⏳ Membuka Chrome... Harap tunggu jendela Chrome muncul.");
    try {
        await client.initialize();
    } catch (e) {
        bot.sendMessage(targetChatId, "❌ Gagal Inisialisasi: " + e.message);
    }
});

bot.onText(/\/filter/, async (msg) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ Ada proses lain.");
    try {
        const rawData = fs.readFileSync(FILE_NOMOR, 'utf-8').split('\n').filter(l => l.trim() !== '');
        isProcessing = true;
        let valid = [];
        bot.sendMessage(msg.chat.id, `🔍 Memulai Filter ${rawData.length} nomor...`);

        for (let line of rawData) {
            if (!isProcessing) break;
            let num = line.split(/\s+/).pop().replace(/[^0-9]/g, '');
            if (!num.startsWith('62')) num = '62' + num.replace(/^0/, '');
            
            try {
                const isRegistered = await client.isRegisteredUser(num + "@c.us");
                if (isRegistered) valid.push({ nama: line.split(/\s+/)[0], nomor: num });
            } catch (e) { console.log("Skip nomor error"); }
            await new Promise(r => setTimeout(r, 500));
        }
        fs.writeFileSync(FILE_TEMP_FILTER, JSON.stringify(valid, null, 2));
        isProcessing = false;
        bot.sendMessage(msg.chat.id, `✅ Selesai! Valid: ${valid.length}`);
    } catch (err) {
        isProcessing = false;
        bot.sendMessage(msg.chat.id, "❌ Error Filter: " + err.message);
    }
});

bot.onText(/\/jalankan/, async (msg) => {
    if (isProcessing) return;
    try {
        let antrean = JSON.parse(fs.readFileSync(FILE_TEMP_FILTER, 'utf-8') || '[]');
        isProcessing = true;
        bot.sendMessage(msg.chat.id, "🚀 Blast dimulai...");

        for (let item of antrean) {
            if (!isProcessing) break;
            try {
                const pesan = fs.readFileSync(FILE_PESAN, 'utf-8').replace(/{id}/g, item.nama);
                await client.sendMessage(item.nomor + "@c.us", pesan);
            } catch (e) { console.log("Gagal kirim ke " + item.nomor); }
            await new Promise(r => setTimeout(r, 1000));
        }
        isProcessing = false;
        bot.sendMessage(msg.chat.id, "🏁 Blast Selesai!");
    } catch (err) {
        isProcessing = false;
        bot.sendMessage(msg.chat.id, "❌ Error Blast: " + err.message);
    }
});

bot.onText(/\/stop/, (msg) => {
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🛑 Berhenti.");
});

console.log("🤖 BOT WSO288 AKTIF - Gunakan /qr untuk memulai");
