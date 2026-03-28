const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.8657782534:AAF_1CDS_6tdqw8bIKwKEticsAdz9xxxL-w, { polling: true });

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: String(chatId) })
    });

    client.on('qr', async (qr) => {
        const qrImage = await qrcode.toBuffer(qr);
        bot.sendPhoto(chatId, qrImage, { caption: 'Scan QR WhatsApp' });
    });

    client.on('ready', () => {
        bot.sendMessage(chatId, '✅ WhatsApp Connected!');
    });

    client.initialize();
});
