const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

let sock;
let isProcessing = false;

async function startWA(chatId, phoneNumber) {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    // JIKA BELUM LOGIN, MINTA KODE PAIRING
    if (!sock.authState.creds.registered) {
        if (!phoneNumber) {
            return bot.sendMessage(chatId, "❌ Gagal. Gunakan format: `/login 628xxx` untuk dpt kode.");
        }
        
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                bot.sendMessage(chatId, `🔑 **KODE PAIRING KAMU:**\n\n#️⃣   \`${code}\`   #️⃣\n\n**Cara Masukkan:**\n1. Buka WA HP > Titik 3 > Perangkat Tertaut.\n2. Pilih Tautkan Perangkat.\n3. Pilih **Tautkan dengan nomor telepon saja** di bagian bawah.\n4. Masukkan kode di atas.`);
            } catch (e) {
                bot.sendMessage(chatId, "❌ Error saat minta kode: " + e.message);
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **LOGIN BERHASIL!** WA kamu sudah tertaut.");
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== 401;
            if (shouldReconnect) startWA(chatId, phoneNumber);
        }
    });
}

// --- COMMANDS TELEGRAM ---

bot.onText(/\/login (.+)/, (msg, match) => {
    const phoneNumber = match[1].replace(/[^0-9]/g, '');
    bot.sendMessage(msg.chat.id, "⏳ Menghubungkan ke server WA...");
    startWA(msg.chat.id, phoneNumber);
});

bot.onText(/\/filter/, async (msg) => {
    if (!sock) return bot.sendMessage(msg.chat.id, "⚠️ Login dulu dengan `/login nomor`.");
    
    const rawData = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.length > 5);
    isProcessing = true;
    let valid = [];
    
    bot.sendMessage(msg.chat.id, `🔍 Memproses ${rawData.length} nomor...`);

    for (let line of rawData) {
        if (!isProcessing) break;
        let num = line.split(/\s+/).pop().replace(/[^0-9]/g, '');
        if (!num.startsWith('62')) num = '62' + num.replace(/^0/, '');

        try {
            const [result] = await sock.onWhatsApp(num);
            if (result?.exists) valid.push({ nama: line.split(/\s+/)[0], nomor: num });
        } catch (e) {}
        await delay(1000);
    }

    fs.writeFileSync('database_valid.json', JSON.stringify(valid));
    isProcessing = false;
    bot.sendMessage(msg.chat.id, `✅ Selesai! Valid: ${valid.length}. Ketik /jalankan`);
});

bot.onText(/\/jalankan/, async (msg) => {
    const antrean = JSON.parse(fs.readFileSync('database_valid.json', 'utf-8') || '[]');
    isProcessing = true;
    bot.sendMessage(msg.chat.id, "🚀 Memulai Blast...");

    for (let item of antrean) {
        if (!isProcessing) break;
        try {
            const template = fs.readFileSync('./script.txt', 'utf-8');
            const pesan = template.replace(/{id}/g, item.nama);
            await sock.sendMessage(item.nomor + "@s.whatsapp.net", { text: pesan });
        } catch (e) {}
        await delay(1000);
    }
    isProcessing = false;
    bot.sendMessage(msg.chat.id, "🏁 Blast Selesai!");
});

bot.onText(/\/stop/, (msg) => { isProcessing = false; bot.sendMessage(msg.chat.id, "🛑 Berhenti."); });

console.log("🤖 Bot Berjalan. Ketik /login [nomor] di Telegram.");
