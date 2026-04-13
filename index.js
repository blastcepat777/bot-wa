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

let sock = null;
let isProcessing = false;
let isLogged = false; 
let lastQrMsgId = null; 
let showQR = false; 

// --- UTILS & DATABASE ---
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

// --- CORE CONNECTION ---
async function startWA(chatId = null) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    
    try {
        sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["WSO288 Turbo", "Chrome", "110.0.0.0"], 
            printQRInTerminal: false,
            syncFullHistory: false,
            defaultQueryTimeoutMs: undefined,
            connectTimeoutMs: 60000,
            retryRequestDelayMs: 2000
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && showQR && chatId) {
                const buffer = await QRCode.toBuffer(qr, { scale: 15, margin: 2 });
                if (lastQrMsgId) bot.deleteMessage(chatId, lastQrMsgId).catch(() => {});
                const sentPhoto = await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR WHATSAPP**" });
                lastQrMsgId = sentPhoto.message_id;
                showQR = false; 
            }

            if (connection === 'open') {
                isLogged = true;
                console.log("WhatsApp Terhubung!");
                if (chatId) bot.sendMessage(chatId, `✅ **WA TERHUBUNG**`);
            }

            if (connection === 'close') {
                isLogged = false;
                const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log("Koneksi terputus. Reconnect:", shouldReconnect);
                if (shouldReconnect) startWA(chatId);
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (err) {
        console.error("Critical Error in startWA:", err);
    }
}

// --- VALID
