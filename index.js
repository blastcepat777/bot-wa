const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

// --- PENTING: SESUAIKAN PATH INI ---
// Ganti 'DEKSTOP-GS84EU2' dengan nama user PC kamu
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = 'C:\\Users\\Username\\AppData\\Local\\Google\\Chrome\\User Data';

const client = new Client({
    puppeteer: {
        headless: false, // Munculkan Chrome biar bisa kamu pantau
        executablePath: CHROME_PATH,
        // Ini kuncinya: Menghubungkan ke sesi Chrome kamu yang sudah ada
        args: [
            `--user-data-dir=${USER_DATA_DIR}`,
            '--profile-directory=Default', // Ganti jika kamu pakai Profile 1, Profile 2, dll
            '--no-sandbox'
        ]
    }
});

let isProcessing = false;

// --- LOGIKA BOT ---

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🤖 **WSO288 CHROME BRIDGE AKTIF**\n\nKetik `/connect` untuk membuka WA di Chrome kamu.");
});

bot.onText(/\/connect/, async (msg) => {
    bot.sendMessage(msg.chat.id, "⏳ Membuka Chrome... Pastikan Chrome asli kamu sudah ditutup semua (Close All Windows) agar tidak bentrok.");
    try {
        await client.initialize();
    } catch (e) {
        bot.sendMessage(msg.chat.id, "❌ Error: Pastikan semua jendela Chrome sudah ditutup sebelum klik /connect.");
    }
});

client.on('ready', () => {
    bot.sendMessage(msg.chat.id, "✅ **TERHUBUNG!** Chrome kamu sudah siap kirim pesan.");
});

bot.onText(/\/jalankan/, async (msg) => {
    if (isProcessing) return;
    
    // Membaca file nomor.txt
    const rawNumbers = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(n => n.length > 5);
    const template = fs.readFileSync('script.txt', 'utf-8');

    isProcessing = true;
    bot.sendMessage(msg.chat.id, `🚀 Blast dimulai ke ${rawNumbers.length} nomor...`);

    for (let line of rawNumbers) {
        if (!isProcessing) break;
        let [nama, nomor] = line.split(/\s+/);
        let num = nomor.replace(/[^0-9]/g, '');
        if (num.startsWith('0')) num = '62' + num.slice(1);

        try {
            const pesan = template.replace(/{id}/g, nama);
            await client.sendMessage(num + "@c.us", pesan);
            console.log(`Terkirim ke ${num}`);
        } catch (e) {
            console.log(`Gagal ke ${num}`);
        }
        // Jeda 1-2 detik (Turbo)
        await new Promise(r => setTimeout(r, 1000));
    }

    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 Blast Selesai!");
});

console.log("🤖 Script Aktif. Pastikan Chrome ditutup dulu, lalu ketik /connect di Telegram.");
