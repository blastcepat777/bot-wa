const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_PESAN = './script.txt';
const FILE_TEMP_FILTER = 'database_valid.json';

// Inisialisasi WhatsApp Client (Chrome)
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false, // TIDAK TERSEMBUNYI agar kamu bisa lihat prosesnya di Chrome
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isProcessing = false;
let targetChatId = null;

// --- EVENT WHATSAPP ---

// Kirim QR ke Telegram hanya jika diminta
client.on('qr', async (qr) => {
    if (targetChatId) {
        const buffer = await QRCode.toBuffer(qr);
        bot.sendPhoto(targetChatId, buffer, { caption: "📸 **SCAN QR DI CHROME KAMU**" });
    }
});

client.on('ready', () => {
    console.log('✅ Chrome Ready & WhatsApp Connected!');
    if (targetChatId) bot.sendMessage(targetChatId, "✅ **CHROME TERHUBUNG!**\nSiap jalankan /filter atau /jalankan.");
});

// --- KONTROL TELEGRAM ---

bot.onText(/\/qr/, (msg) => {
    targetChatId = msg.chat.id;
    bot.sendMessage(targetChatId, "⏳ Membuka Chrome...");
    client.initialize().catch(e => bot.sendMessage(targetChatId, "❌ Error: " + e.message));
});

// Otomatis Filter (Bisa Dilihat di Chrome)
bot.onText(/\/filter/, async (msg) => {
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ Proses sedang berjalan.");
    
    const rawData = fs.readFileSync(FILE_NOMOR, 'utf-8').split('\n').filter(l => l.trim() !== '');
    if (rawData.length === 0) return bot.sendMessage(msg.chat.id, "❌ nomor.txt kosong!");

    isProcessing = true;
    let valid = [];
    bot.sendMessage(msg.chat.id, `🔍 **FILTERING DI CHROME...**\nTarget: ${rawData.length} nomor.`);

    for (let line of rawData) {
        if (!isProcessing) break;
        let num = line.split(/\s+/).pop().replace(/[^0-9]/g, '');
        if (num.startsWith('0')) num = '62' + num.slice(1);

        try {
            // Proses cek nomor (Chrome akan bekerja di latar belakang)
            const isRegistered = await client.isRegisteredUser(num + "@c.us");
            if (isRegistered) {
                valid.push({ nama: line.split(/\s+/)[0], nomor: num });
            }
        } catch (e) {}
        
        // Jeda agar tidak dianggap robot agresif
        await new Promise(r => setTimeout(r, 1000));
    }

    fs.writeFileSync(FILE_TEMP_FILTER, JSON.stringify(valid, null, 2));
    isProcessing = false;
    bot.sendMessage(msg.chat.id, `✅ **FILTER SELESAI!**\nValid: ${valid.length}\nKetik /jalankan.`);
});

// Otomatis Jalankan Blast (Lihat Chrome Mengetik)
bot.onText(/\/jalankan/, async (msg) => {
    if (isProcessing) return;
    let antrean = JSON.parse(fs.readFileSync(FILE_TEMP_FILTER, 'utf-8') || '[]');
    
    isProcessing = true;
    bot.sendMessage(msg.chat.id, `🚀 **BLASTING START...**\nLihat Chrome kamu sekarang.`);

    for (let item of antrean) {
        if (!isProcessing) break;
        try {
            const pesan = fs.readFileSync(FILE_PESAN, 'utf-8').replace(/{id}/g, item.nama);
            
            // Chrome akan otomatis buka chat dan kirim pesan
            await client.sendMessage(item.nomor + "@c.us", pesan);
        } catch (e) {}

        // TURBO 0-1 DETIK
        await new Promise(r => setTimeout(r, Math.random() * 1000));
    }

    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 **BLAST SELESAI!**");
});

bot.onText(/\/stop/, (msg) => {
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🛑 **PROSES DIHENTIKAN.**");
});

console.log("🤖 Sistem Remote Chrome Aktif...");
