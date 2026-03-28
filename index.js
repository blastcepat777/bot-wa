const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

// ISI DATA YUPRA ANDA (Wajib)
const API_KEY_YUPRA = 'ISI_API_KEY_YUPRA_ANDA';
const DEVICE_ID = 'ISI_DEVICE_ID_ANDA';

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "⏳ Sedang mengambil barcode pairing dari Yupra...");

  try {
    // Memanggil API Yupra secara langsung (Tanpa perlu buka browser)
    const response = await axios.get(`https://cp.yupra.me/api/v1/qr/${DEVICE_ID}?api_key=${API_KEY_YUPRA}`);
    
    // Sesuaikan 'qr_link' dengan struktur respon API Yupra Anda
    const qrUrl = response.data.results.qr_link; 

    bot.sendPhoto(chatId, qrUrl, {
      caption: "✅ Scan barcode ini segera di WhatsApp Anda!"
    });
  } catch (error) {
    console.error("Error API:", error.message);
    bot.sendMessage(chatId, "❌ Gagal mengambil barcode. Pastikan API Key & Device ID sudah benar.");
  }
});

console.log("Bot berjalan tanpa Puppeteer - Jauh lebih ringan!");
