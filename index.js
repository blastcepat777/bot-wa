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
const JEDA_FILTER = 1000; 
const JEDA_BLAST_MIN = 0; 
const JEDA_BLAST_MAX = 1000; 

let sock;
let isProcessing = false;
let isLogged = false; 
let lastQrMsgId = null; 
let showQR = false; 

// --- DATABASE SISTEM ---
function simpanProgress(data) { fs.writeFileSync(FILE_TEMP_FILTER, JSON.stringify(data, null, 2)); }
function muatProgress() { 
    if (fs.existsSync(FILE_TEMP_FILTER)) {
        try { return JSON.parse(fs.readFileSync(FILE_TEMP_FILTER, 'utf-8')); } catch (e) { return []; }
    }
    return [];
}
function buatBar(p) {
    const filled = Math.round(p / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled); 
}

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

// --- KONEKSI ---
async function startWA(chatId = null) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["WSO288 Turbo", "Chrome", "110.0.0.0"], 
        printQRInTerminal: false,
        syncFullHistory: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Kirim QR hanya jika flag showQR aktif (dari perintah /qr)
        if (qr && showQR && chatId) {
            const buffer = await QRCode.toBuffer(qr, { scale: 15, margin: 2 });
            if (lastQrMsgId) {
                bot.deleteMessage(chatId, lastQrMsgId).catch(() => {});
            }
            const sentPhoto = await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR WHATSAPP**" });
            lastQrMsgId = sentPhoto.message_id;
            showQR = false; 
        }

        if (connection === 'open') {
            isLogged = true;
            if (chatId) bot.sendMessage(chatId, `✅ **WA TERHUBUNG**\nKetik \`/filter\`.`);
        }

        if (connection === 'close') {
            const code = lastDisconnect.error?.output?.statusCode;
            isLogged = false;
            if (code === DisconnectReason.loggedOut) {
                if (chatId) bot.sendMessage(chatId, "⚠️ Sesi Logout. Ketik `/qr` ulang.");
            } else {
                startWA(chatId); // Reconnect otomatis
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// --- TURBO VALIDATOR (1s) ---
async function prosesFilter(chatId) {
    if (!sock || !isLogged) return bot.sendMessage(chatId, "⚠️ Belum terhubung. Ketik `/qr` dulu.");
    if (isProcessing) return;
    
    let daftar = ambilDaftarNomor();
    if (daftar.length === 0) return bot.sendMessage(chatId, "❌ File nomor.txt kosong.");

    isProcessing = true;
    let nomorValid = [];
    let statusMsg = await bot.sendMessage(chatId, `🔍 **TURBO FILTER RUNNING...**`);

    for (let i = 0; i < daftar.length; i++) {
        if (!isProcessing) break;
        const target = daftar[i];
        const jid = target.nomor + "@s.whatsapp.net";
        
        try {
            const [result] = await sock.onWhatsApp(jid);
            if (result && result.exists) {
                await sock.sendPresenceUpdate('composing', jid);
                nomorValid.push(target);
                simpanProgress(nomorValid);
            }
        } catch (e) {}

        if (i % 5 === 0 || i === daftar.length - 1) {
            const persen = Math.round(((i + 1) / daftar.length) * 100);
            try {
                await bot.editMessageText(
                    `🔍 **PROGRESS VALIDATOR:**\n${buatBar(persen)} ${persen}%\n✅ **Valid:** ${nomorValid.length}`,
                    { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
                );
            } catch (e) {}
        }
        await new Promise(res => setTimeout(res, JEDA_FILTER));
    }

    isProcessing = false;
    bot.sendMessage(chatId, `✅ **FILTER SELESAI.**`);
}

// --- BLAST SISTEM ---
async function prosesJalankan(chatId) {
    if (!sock || !isLogged || isProcessing) return;
    let antrean = muatProgress();
    if (antrean.length === 0) return bot.sendMessage(chatId, "❌ Filter dulu.");

    isProcessing = true;
    let sukses = 0;
    let statusMsg = await bot.sendMessage(chatId, `🚀 **START BLASTING...**`);

    for (let i = 0; i < antrean.length; i++) {
        if (!isProcessing) break;
        const target = antrean[i];
        const jid = target.nomor + "@s.whatsapp.net";

        try {
            const pesanTxt = fs.readFileSync(FILE_PESAN, 'utf-8').replace(/{id}/g, target.nama);
            await sock.sendMessage(jid, { text: pesanTxt });
            sukses++;
        } catch (err) {}

        if (i % 5 === 0 || i === antrean.length - 1) {
            const persen = Math.round(((i + 1) / antrean.length) * 100);
            try {
                await bot.editMessageText(`🚀 **PROGRESS BLAST:**\n${buatBar(persen)} ${persen}%\n✅ Terkirim: ${sukses}`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' });
            } catch (e) {}
        }

        const jedaRandom = Math.floor(Math.random() * (JEDA_BLAST_MAX - JEDA_BLAST_MIN + 1) + JEDA_BLAST_MIN);
        await new Promise(res => setTimeout(res, jedaRandom));
    }

    isProcessing = false;
    bot.sendMessage(chatId, `🏁 **SELESAI.**`);
}

// --- AUTO START ---
startWA(); // Menjalankan di background saat script dinyalakan

// --- COMMANDS ---
bot.onText(/\/qr/, (msg) => {
