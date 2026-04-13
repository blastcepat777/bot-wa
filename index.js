const { Client } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, {polling: true});

async function startBatch1() {
    try {
        // Mengambil alamat jembatan dari Chrome yang sedang terbuka
        const res = await axios.get('http://127.0.0.1:9222/json/version');
        const wsUrl = res.data.webSocketDebuggerUrl;

        const client = new Client({
            puppeteer: {
                browserWSEndpoint: wsUrl, // Menempel ke Chrome kamu
            }
        });

        console.log("✅ Berhasil menempel ke Chrome! Tunggu sampai 'Ready'...");

        client.on('ready', () => {
            console.log('✅ WhatsApp Ready! Silakan gunakan Telegram.');
        });

        bot.onText(/\/start/, (msg) => {
            bot.sendMessage(msg.chat.id, "🎯 **WSO288 BATCH 1 ACTIVE**\nStatus: Terhubung ke Chrome\n\nKetik `/blast` untuk mulai kirim.");
        });

        bot.onText(/\/blast/, async (msg) => {
            const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim());
            const template = fs.readFileSync('script.txt', 'utf-8');

            bot.sendMessage(msg.chat.id, `🚀 Memulai BATCH 1 ke ${data.length} nomor...`);

            for (let line of data) {
                let [nama, nomor] = line.split(/\s+/);
                let target = nomor.replace(/[^0-9]/g, '');
                if (target.startsWith('0')) target = '62' + target.slice(1);

                try {
                    const pesanFinal = template.replace(/{id}/g, nama);
                    await client.sendMessage(target + "@c.us", pesanFinal);
                    console.log(`✅ Terkirim: ${nama}`);
                } catch (e) {
                    console.log(`❌ Gagal ke: ${target}`);
                }
                // Jeda 2 detik agar aman
                await new Promise(r => setTimeout(r, 2000));
            }
            bot.sendMessage(msg.chat.id, "🏁 **BATCH 1 SELESAI!**");
        });

        client.initialize();
    } catch (e) {
        console.log("❌ Gagal connect. Pastikan Chrome localhost:9222 masih terbuka!");
    }
}

startBatch1();
