const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

let client;
let isProcessing = false;
let successCount = 0;
let userState = {};

// Fungsi Inisialisasi WhatsApp Client
function initClient(chatId) {
    client = new Client({
        authStrategy: new LocalAuth({ dataPath: './sessions' }),
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions']
        }
    });

    client.on('qr', (qr) => {
        if (userState[chatId] === 'WAITING_QR') {
            qrcode.toBuffer(qr, (err, buffer) => {
                bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR INI SEGERA**" });
            });
        }
    });

    client.on('ready', () => {
        bot.sendMessage(chatId, "✅ **WA SUDAH TERHUBUNG**, silahkan `/filter` untuk membuka history chat");
    });

    client.on('disconnected', (reason) => {
        isProcessing = false;
        bot.sendMessage(chatId, `❌ **WA TERPUTUS / TERBLOKIR**\n\n**REKAP TERKIRIM:** ${successCount}\n\nSilahkan klik /restart untuk mengulang.`);
    });

    client.initialize().catch(err => console.error("Gagal init:", err));
}

// --- STEP 1: LOGIN ---
bot.onText(/\/login/, (msg) => {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "QR", callback_data: 'qr' }, { text: "Kode", callback_data: 'kode' }]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, "Pilih metode login:", opts);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'qr') {
        userState[chatId] = 'WAITING_QR';
        bot.sendMessage(chatId, "⏳ Menyiapkan QR...");
        initClient(chatId);
    } else if (query.data === 'kode') {
        userState[chatId] = 'WAITING_NUMBER';
        bot.sendMessage(chatId, "Masukkan nomor WA (contoh: 6281365598770):");
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (userState[chatId] === 'WAITING_NUMBER' && !text.startsWith('/')) {
        bot.sendMessage(chatId, "⏳ Menghubungkan... Mohon tunggu kode pairing.");
        initClient(chatId);
        
        setTimeout(async () => {
            try {
                const pairingCode = await client.requestPairingCode(text.replace(/[^0-9]/g, ''));
                bot.sendMessage(chatId, `🔑 **KODE PAIRING ANDA:**\n\n\`${pairingCode}\``, { parse_mode: 'Markdown' });
                delete userState[chatId];
            } catch (err) {
                bot.sendMessage(chatId, "❌ Gagal mengambil kode. Pastikan nomor benar.");
            }
        }, 6000);
    }
});

// --- STEP 2: FILTER (HISTORY 0 DETIK) ---
bot.onText(/\/filter/, async (msg) => {
    const chatId = msg.chat.id;
    if (!client) return bot.sendMessage(chatId, "Lakukan /login dulu!");

    bot.sendMessage(chatId, "🔍 **MEMBUKA HISTORY CHAT (0 DETIK)...**");

    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        
        // Membuka history secara instan agar muncul di Chrome
        const tasks = data.map(line => {
            let num = line.split(/\s+/).pop().replace(/[^0-9]/g, '') + "@c.us";
            return client.getChatById(num).catch(() => {});
        });

        await Promise.all(tasks);

        bot.sendMessage(chatId, "✅ **FILTER SELESAI**\nHistory sudah nampak di Chrome.\n\nSilahkan ketik `/jalan` untuk mulai blast.");
    } catch (e) {
        bot.sendMessage(chatId, "❌ File nomor.txt tidak ditemukan.");
    }
});

// --- STEP 3: JALAN (FAST MODE 0 DETIK) ---
bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing) return;

    isProcessing = true;
    successCount = 0;

    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const script = fs.readFileSync('script.txt', 'utf-8');

        bot.sendMessage(chatId, "🚀 **BLAST JALAN (FAST MODE 0 DETIK)...**");

        for (let line of data) {
            if (!isProcessing) break;

            let parts = line.split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let target = nomor + "@c.us";

            try {
                // KIRIM INSTAN TANPA JEDA
                await client.sendMessage(target, script.replace(/{id}/g, nama));
                successCount++;
            } catch (err) {
                // Jika terkena blokir, loop berhenti dan rekap
                isProcessing = false;
                bot.sendMessage(chatId, `⚠️ **WA TERBLOKIR!**\n\n**REKAP TERKIRIM:** ${successCount}\n\nSilahkan klik /restart`);
                return;
            }
        }

        bot.sendMessage(chatId, `🏁 **BLAST SELESAI!**\nTotal Sukses: ${successCount}`);
        isProcessing = false;
    } catch (e) {
        bot.sendMessage(chatId, "❌ Periksa file nomor.txt dan script.txt.");
        isProcessing = false;
    }
});

// --- RESTART ---
bot.onText(/\/restart/, (msg) => {
    if (fs.existsSync('./sessions')) {
        fs.rmSync('./sessions', { recursive: true, force: true });
    }
    bot.sendMessage(msg.chat.id, "♻️ **SESI DIBERSIHKAN.**\nSilahkan `/login` ulang.");
    setTimeout(() => process.exit(0), 1000); // Railway akan otomatis menyalakan ulang bot
});
