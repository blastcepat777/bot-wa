const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, {polling: true});

let client;
let isProcessing = false;
let successCount = 0;
let userState = {};

// Inisialisasi Client WhatsApp
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
                bot.sendPhoto(chatId, buffer, { caption: "📸 **SILAHKAN SCAN BARCODE INI**" });
            });
        }
    });

    client.on('ready', () => {
        bot.sendMessage(chatId, "✅ **WA SUDAH TERHUBUNG**, silahkan `/filter` untuk membuka history chat");
    });

    client.on('disconnected', (reason) => {
        isProcessing = false;
        bot.sendMessage(chatId, `❌ **WA TERBLOKIR / TERPUTUS**\n\n**REKAP TERKIRIM:** ${successCount}\n\nSilahkan ketik `/restart` untuk membersihkan sesi.`);
    });

    client.initialize().catch(err => console.error("Init Error:", err));
}

// --- STEP 1: LOGIN ---

bot.onText(/\/login/, (msg) => {
    const chatId = msg.chat.id;
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "QR", callback_data: 'qr_mode' }, { text: "Kode", callback_data: 'pair_mode' }]
            ]
        }
    };
    bot.sendMessage(chatId, "Pilih metode login:", opts);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'qr_mode') {
        userState[chatId] = 'WAITING_QR';
        bot.sendMessage(chatId, "⏳ Menghasilkan Barcode...");
        initClient(chatId);
    } else if (query.data === 'pair_mode') {
        userState[chatId] = 'WAITING_NUMBER';
        bot.sendMessage(chatId, "Masukkan nomor WhatsApp (contoh: 6281365598770):");
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (userState[chatId] === 'WAITING_NUMBER' && !text.startsWith('/')) {
        bot.sendMessage(chatId, "⏳ Menghubungkan dan meminta kode pairing...");
        initClient(chatId);
        
        // Jeda agar client siap meminta kode
        setTimeout(async () => {
            try {
                const pairingCode = await client.requestPairingCode(text.replace(/[^0-9]/g, ''));
                bot.sendMessage(chatId, `🔑 **KODE PAIRING ANDA:**\n\n\`${pairingCode}\``, { parse_mode: 'Markdown' });
                delete userState[chatId];
            } catch (err) {
                bot.sendMessage(chatId, "❌ Gagal mengambil kode pairing. Coba lagi.");
            }
        }, 6000);
    }
});

// --- STEP 2: FILTER (0 DETIK) ---

bot.onText(/\/filter/, async (msg) => {
    const chatId = msg.chat.id;
    if (!client) return bot.sendMessage(chatId, "Gunakan `/login` terlebih dahulu!");

    bot.sendMessage(chatId, "🔍 **PROSES FILTER MEMBUKA CHAT (0 DETIK)...**");
    
    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        
        // Membuka chat secara instan agar muncul di history Chrome (tanpa jeda)
        const filterPromises = data.map(line => {
            let num = line.split(/\s+/).pop().replace(/[^0-9]/g, '') + "@c.us";
            return client.getChatById(num).catch(() => {}); 
        });

        await Promise.all(filterPromises);
        
        bot.sendMessage(chatId, "✅ **PROSES FILTER SELESAI**\nHistory sudah nampak di Chrome.\n\nSilahkan ketik `/jalan` untuk mulai blast.");
    } catch (e) {
        bot.sendMessage(chatId, "❌ File `nomor.txt` tidak ditemukan atau kosong.");
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
        const scriptTemplate = fs.readFileSync('script.txt', 'utf-8');

        bot.sendMessage(chatId, "🚀 **BLAST JALAN (MODE FAST 0 DETIK)...**");

        for (let line of data) {
            if (!isProcessing) break;
            
            let parts = line.split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let target = nomor + "@c.us";

            try {
                const pesan = scriptTemplate.replace(/{id}/g, nama);
                // MODE FAST: Kirim tanpa jeda sama sekali
                await client.sendMessage(target, pesan);
                successCount++;
            } catch (err) {
                // Jika error (Block), langsung berhenti dan kirim rekap
                isProcessing = false;
                bot.sendMessage(chatId, `⚠️ **WA TERBLOKIR!**\n\n**REKAP TERKIRIM:** ${successCount}\n\nSilahkan ketik `/restart``);
                return;
            }
        }

        bot.sendMessage(chatId, `🏁 **BLAST SELESAI!**\n\nTotal Terkirim: ${successCount}\nKontak di nomor.txt & history sudah terkena chat semua.`);
        isProcessing = false;
    } catch (e) {
        bot.sendMessage(chatId, "❌ Terjadi kesalahan file `nomor.txt` atau `script.txt`.");
        isProcessing = false;
    }
});

// --- RESTART (BERSIHKAN SEMUA) ---

bot.onText(/\/restart/, (msg) => {
    const chatId = msg.chat.id;
    if (fs.existsSync('./sessions')) {
        fs.rmSync('./sessions', { recursive: true, force: true });
    }
    bot.sendMessage(chatId, "♻️ **SEMUA HISTORY DIBERSIHKAN.**\nSilahkan `/login` untuk mulai kembali.");
    
    // Memberikan waktu kirim pesan sebelum mematikan proses (Railway akan restart otomatis)
    setTimeout(() => process.exit(0), 1000);
});
