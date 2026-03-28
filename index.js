const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const TelegramBot = require('node-telegram-bot-api');

// ambil token dari Railway
const token = process.env.BOT_TOKEN;

if (!token) {
    console.error("BOT TOKEN TIDAK ADA!");
    process.exit(1);
}

// aktifkan bot telegram
const bot = new TelegramBot(token, { polling: true });

// anti crash
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, '⏳ Menghubungkan WhatsApp...');

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: String(chatId) }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        }
    });

    client.on('qr', async (qr) => {
        console.log('QR TERGENERATE');
        const qrImage = await qrcode.toBuffer(qr);
        bot.sendPhoto(chatId, qrImage, { caption: '📲 Scan QR WhatsApp kamu' });
    });

    client.on('ready', () => {
        bot.sendMessage(chatId, '✅ WhatsApp Connected!');
    });

    client.on('auth_failure', () => {
        bot.sendMessage(chatId, '❌ Gagal autentikasi WhatsApp');
    });

    client.on('disconnected', () => {
        bot.sendMessage(chatId, '⚠️ WhatsApp terputus');
    });

    client.initialize();
});
