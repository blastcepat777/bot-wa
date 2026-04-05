const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, jidNormalizedUser, DisconnectReason } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_DB_VALID = 'database_valid.json';
const JEDA_VALIDATOR = 3500; // Jeda aman agar tidak terbaca spam oleh WA

let sock;
let isProcessing = false;

// --- DATABASE SISTEM ---
function simpanKeDatabase(data) { fs.writeFileSync(FILE_DB_VALID, JSON.stringify(data, null, 2)); }
function muatDariDatabase() { return fs.existsSync(FILE_DB_VALID) ? JSON.parse(fs.readFileSync(FILE_DB_VALID, 'utf-8')) : []; }

function ambilDaftarNomor() {
    if (!fs.existsSync(FILE_NOMOR)) return [];
    return fs.readFileSync(FILE_NOMOR, 'utf-8').split('\n')
        .map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 2) return null;
            let num = parts[parts.length - 1].replace(/[^0-9]/g, '');
            if (num.startsWith('0')) num = '62' + num.slice(1);
            return { nama: parts[0], nomor: num };
        }).filter(item => item !== null && item.nomor.length >= 10);
}

// --- KONEKSI WA ---
async function startWA(chatId) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["MacOS", "Chrome", "110.0.0.0"],
        syncFullHistory: false
    });

    sock.ev.on('connection.update', async (u) => {
        if (u.qr && !isProcessing) {
            const buf = await QRCode.toBuffer(u.qr, { scale: 10 });
            bot.sendPhoto(chatId, buf, { caption: "📸 **SCAN QR SEKARANG**" });
        }
        if (u.connection === 'open') bot.sendMessage(chatId, "✅ **WA TERHUBUNG**\nKetik `/validator` untuk buka history.");
        if (u.connection === 'close') {
            if (u.lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) startWA(chatId);
        }
    });
    sock.ev.on('creds.update', saveCreds);
}

// --- FUNGSI VALIDATOR (MEMBUAT HISTORY NYATA) ---
async function prosesValidator(chatId) {
    if (!sock) return bot.sendMessage(chatId, "⚠️ Hubungkan WA dulu.");
    if (isProcessing) return;
    
    let daftar = ambilDaftarNomor();
    if (daftar.length === 0) return bot.sendMessage(chatId, "❌ File nomor.txt kosong.");

    isProcessing = true;
    let hasilValid = []; 
    simpanKeDatabase([]); 

    let statusMsg = await bot.sendMessage(chatId, `🔍 **MEMULAI OPEN CHAT HISTORY...**`);

    for (let i = 0; i < daftar.length; i++) {
        if (!isProcessing) break; 
        const target = daftar[i];
        const targetJid = target.nomor + "@s.whatsapp.net";
        
        try {
            // 1. Cek apakah nomor punya WhatsApp
            const [result] = await sock.onWhatsApp(targetJid);
            if (result && result.exists) {
                // 2. KIRIM KARAKTER KOSONG AGAR CHAT MUNCUL DI HP ANDA
                await sock.sendMessage(targetJid, { text: "\u200B" }); 
                
                hasilValid.push(target);
                simpanKeDatabase(hasilValid); 
            }
        } catch (e) {}

        // Update progres ke Telegram
        const persen = Math.round(((i + 1) / daftar.length) * 100);
        if (i % 2 === 0 || i === daftar.length - 1) {
            try {
                await bot.editMessageText(
                    `🔍 **VALIDATOR:** ${persen}%\n📱 **Membuka:** \`${target.nomor}\`\n✅ **History Terbuka:** ${hasilValid.length}`,
                    { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
                );
            } catch (e) {}
        }
        await new Promise(res => setTimeout(res, JEDA_VALIDATOR));
    }

    isProcessing = false;
    bot.sendMessage(chatId, `✅ **VALIDATOR SELESAI**\nHistory chat telah dibuat di WA Anda.\n\nKetik: \`/jalankan\``);
}

bot.onText(/\/qr/, (msg) => startWA(msg.chat.id));
bot.onText(/\/validator/, (msg) => prosesValidator(msg.chat.id));
bot.onText(/\/stop/, (msg) => { isProcessing = false; bot.sendMessage(msg.chat.id, "🛑 Berhenti."); });
