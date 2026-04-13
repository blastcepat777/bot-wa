const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_PESAN = './script.txt';
const FILE_TEMP_FILTER = 'database_valid.json';

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // WAJIB TRUE untuk Railway/Server
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

let isProcessing = false;
let targetChatId = null;

client.on('qr', async (qr) => {
    if (targetChatId) {
        const buffer = await QRCode.toBuffer(qr);
        bot.sendPhoto(targetChatId, buffer, { caption: "📸 **SCAN QR SEKARANG**" });
    }
});

client.on('ready', () => {
    if (targetChatId) bot.sendMessage(targetChatId, "✅ **WA TERHUBUNG DI CLOUD!**");
});

bot.onText(/\/qr/, (msg) => {
    targetChatId = msg.chat.id;
    bot.sendMessage(targetChatId, "⏳ Menjalankan mesin di server...");
    client.initialize().catch(e => bot.sendMessage(targetChatId, "❌ Error: " + e.message));
});

// --- BAGIAN FILTER & JALANKAN (Sama Seperti Sebelumnya) ---
bot.onText(/\/filter/, async (msg) => {
    if (isProcessing) return;
    const rawData = fs.readFileSync(FILE_NOMOR, 'utf-8').split('\n').filter(l => l.trim() !== '');
    isProcessing = true;
    let valid = [];
    bot.sendMessage(msg.chat.id, `🔍 Memproses ${rawData.length} nomor...`);
    for (let line of rawData) {
        if (!isProcessing) break;
        let num = line.split(/\s+/).pop().replace(/[^0-9]/g, '');
        if (num.startsWith('0')) num = '62' + num.slice(1);
        try {
            const isRegistered = await client.isRegisteredUser(num + "@c.us");
            if (isRegistered) valid.push({ nama: line.split(/\s+/)[0], nomor: num });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 1000));
    }
    fs.writeFileSync(FILE_TEMP_FILTER, JSON.stringify(valid));
    isProcessing = false;
    bot.sendMessage(msg.chat.id, `✅ Selesai! Valid: ${valid.length}. Ketik /jalankan`);
});

bot.onText(/\/jalankan/, async (msg) => {
    if (isProcessing) return;
    const antrean = JSON.parse(fs.readFileSync(FILE_TEMP_FILTER, 'utf-8') || '[]');
    isProcessing = true;
    for (let item of antrean) {
        if (!isProcessing) break;
        try {
            const pesan = fs.readFileSync(FILE_PESAN, 'utf-8').replace(/{id}/g, item.nama);
            await client.sendMessage(item.nomor + "@c.us", pesan);
        } catch (e) {}
        await new Promise(r => setTimeout(r, 1000));
    }
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 Blast Selesai!");
});

console.log("🤖 Cloud Bot Aktif...");
