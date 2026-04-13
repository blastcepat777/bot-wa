const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_PESAN = './script.txt';
const FILE_TEMP_FILTER = 'database_valid.json'; 

let sock = null;
let isProcessing = false;
let isLogged = false; 
let showQR = false;

// Cek file saat start
if (!fs.existsSync(FILE_NOMOR)) fs.writeFileSync(FILE_NOMOR, '');
if (!fs.existsSync(FILE_PESAN)) fs.writeFileSync(FILE_PESAN, 'Halo {id}');

async function startWA(chatId = null) {
    console.log("🟡 Memulai koneksi WhatsApp...");
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["WSO288 Turbo", "Chrome", "1.0.0"],
        printQRInTerminal: true // Munculkan juga di terminal untuk jaga-jaga
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && showQR && chatId) {
            console.log("📸 QR Code dihasilkan, mengirim ke Telegram...");
            const buffer = await QRCode.toBuffer(qr);
            bot.sendPhoto(chatId, buffer, { caption: "📸 SCAN QR SEKARANG" }).catch(e => console.log("Gagal kirim foto ke tele"));
            showQR = false;
        }

        if (connection === 'open') {
            isLogged = true;
            console.log("✅ WhatsApp Connected!");
            if (chatId) bot.sendMessage(chatId, "✅ WA TERHUBUNG!");
        }

        if (connection === 'close') {
            isLogged = false;
            const code = lastDisconnect.error?.output?.statusCode;
            console.log("❌ Koneksi Terputus, mencoba hubungkan kembali...");
            if (code !== DisconnectReason.loggedOut) startWA(chatId);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Handler Filter
bot.onText(/\/filter/, async (msg) => {
    if (!isLogged) return bot.sendMessage(msg.chat.id, "⚠️ WA Belum Connect. Ketik /qr");
    if (isProcessing) return bot.sendMessage(msg.chat.id, "⚠️ Masih ada proses berjalan.");
    
    const data = fs.readFileSync(FILE_NOMOR, 'utf-8').split('\n').filter(n => n.length > 5);
    if (data.length === 0) return bot.sendMessage(msg.chat.id, "❌ File nomor.txt kosong!");

    isProcessing = true;
    let valid = [];
    bot.sendMessage(msg.chat.id, `🔍 Memulai Filter ${data.length} nomor...`);

    for (let line of data) {
        if (!isProcessing) break;
        let num = line.split(/\s+/).pop().replace(/[^0-9]/g, '');
        if (num.startsWith('0')) num = '62' + num.slice(1);
        
        try {
            const [result] = await sock.onWhatsApp(num);
            if (result?.exists) valid.push({ nama: line.split(/\s+/)[0], nomor: num });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 1000));
    }
    
    fs.writeFileSync(FILE_TEMP_FILTER, JSON.stringify(valid));
    isProcessing = false;
    bot.sendMessage(msg.chat.id, `✅ Selesai! Valid: ${valid.length}. Ketik /jalankan`);
});

// Handler Jalankan (Turbo 0-1s)
bot.onText(/\/jalankan/, async (msg) => {
    if (!is
