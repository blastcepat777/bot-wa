const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_PESAN = './script.txt';
const FILE_TEMP_FILTER = 'database_valid.json';

// Inisialisasi Chrome
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false, 
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isProcessing = false;
let targetChatId = null;

// --- KONEKSI WA ---
client.on('qr', async (qr) => {
    if (targetChatId) {
        const buffer = await QRCode.toBuffer(qr);
        bot.sendPhoto(targetChatId, buffer, { caption: "📸 **SCAN QR DI CHROME**" });
    }
});

client.on('ready', () => {
    console.log('✅ Chrome Ready!');
    if (targetChatId) bot.sendMessage(targetChatId, "✅ **CHROME TERHUBUNG!**");
});

// --- PERINTAH TELEGRAM ---
bot.onText(/\/qr/, (msg) => {
    targetChatId = msg.chat.id;
    bot.sendMessage(targetChatId, "⏳ Membuka Chrome...");
    client.initialize().catch(e => console.log("Error Init: " + e.message));
});

bot.onText(/\/filter/, async (msg) => {
    if (isProcessing) return;
    const rawData = fs.readFileSync(FILE_NOMOR, 'utf-8').split('\n').filter(l => l.trim() !== '');
    isProcessing = true;
    let valid = [];
    bot.sendMessage(msg.chat.id, "🔍 Memulai Filter...");

    for (let line of rawData) {
        if (!isProcessing) break;
        let num = line.split(/\s+/).pop().replace(/[^0-9]/g, '');
        if (num.startsWith('0')) num = '62' + num.slice(1);
        try {
            const isRegistered = await client.isRegisteredUser(num + "@c.us");
            if (isRegistered) valid.push({ nama: line.split(/\s+/)[0], nomor: num });
        } catch (e) {}
    }
    fs.writeFileSync(FILE_TEMP_FILTER, JSON.stringify(valid, null, 2));
    isProcessing = false;
    bot.sendMessage(msg.chat.id, `✅ Selesai! Valid: ${valid.length}`);
});

bot.onText(/\/jalankan/, async (msg) => {
    if (isProcessing) return;
    let antrean = JSON.parse(fs.readFileSync(FILE_TEMP_FILTER, 'utf-8') || '[]');
    isProcessing = true;
    bot.sendMessage(msg.chat.id, "🚀 Blast dimulai...");

    for (let item of antrean) {
        if (!isProcessing) break;
        try {
            const pesan = fs.readFileSync(FILE_PESAN, 'utf-8').replace(/{id}/g, item.nama);
            await client.sendMessage(item.nomor + "@c.us", pesan);
        } catch (e) {}
        await new Promise(r => setTimeout(r, 1000));
    }
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 Selesai!");
});

bot.onText(/\/stop/, (msg) => {
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🛑 Berhenti.");
});

console.log("🤖 Sistem Aktif...");
