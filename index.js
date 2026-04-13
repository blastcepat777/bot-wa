const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// --- KONFIGURASI ---
const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, {polling: true});

// Mengambil jalur User Data Chrome secara otomatis
const CHROME_DATA = `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Google\\Chrome\\User Data`;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false, // Munculkan Chrome agar kamu bisa lihat prosesnya
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            `--user-data-dir=${CHROME_DATA}`,
            '--profile-directory=Default', // Ganti 'Profile 1' jika kamu pakai profil lain
            '--no-sandbox'
        ]
    }
});

let isProcessing = false;

// --- MENU UTAMA TELEGRAM ---
const menuUtama = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "🔌 Connect Chrome", callback_data: 'connect' }],
            [{ text: "🔍 Filter Nomor", callback_data: 'filter' }, { text: "🚀 Start Blast", callback_data: 'blast' }],
            [{ text: "🛑 Stop", callback_data: 'stop' }]
        ]
    }
};

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 **WSO288 TURBO PANEL**\nStatus: Ready. Silakan pilih menu:", menuUtama);
});

// --- LOGIKA TOMBOL ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    if (action === 'connect') {
        bot.sendMessage(chatId, "⏳ Membuka Chrome... (Tutup semua jendela Chrome asli dulu!)");
        client.initialize().catch
