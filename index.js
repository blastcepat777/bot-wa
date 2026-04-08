const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_GAMBAR = './poster.jpg';
const FILE_PESAN = './script.txt';
const FILE_TEMP_FILTER = 'database_valid.json'; 
const JEDA_FILTER = 5000; // Dinaikkan sedikit agar "suntikan" stabil
const JEDA_BLAST_MIN = 8000;
const JEDA_BLAST_MAX = 15000;

let sock;
let isProcessing = false;

// --- UTILS ---
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
async function startWA(chatId) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Chrome (Windows)", "Chrome", "110.0.0.0"], 
        printQRInTerminal: false,
        syncFullHistory: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 15, margin: 2 });
            await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR WHATSAPP**\nSegera scan sebelum expired." });
        }
        if (connection === 'open') {
            bot.sendMessage(chatId, `✅ **WA TERHUBUNG**\n\nKetik \`/filter\` untuk pancing history.`);
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startWA(chatId);
        }
    });
    sock.ev.on('creds.update', saveCreds);
}

// --- PROSES VALIDATOR + SUNTIK HISTORY ---
async function prosesFilter(chatId) {
    if (!sock) return bot.sendMessage(chatId, "⚠️ Gunakan `/qr` dulu.");
    if (isProcessing) return;
    
    let daftar = ambilDaftarNomor();
    if (daftar.length === 0) return bot.sendMessage(chatId, "❌ File nomor.txt tidak ditemukan atau kosong.");

    isProcessing = true;
    let nomorValid = [];
    let statusMsg = await bot.sendMessage(chatId, `🔍 **MEMULAI VALIDATOR & SUNTIK HISTORY...**`);

    for (let i = 0; i < daftar.length; i++) {
        if (!isProcessing) break;
        const target = daftar[i];
        const jid = target.nomor + "@s.whatsapp.net";
        
        try {
            const [result] = await sock.onWhatsApp(jid);
            if (result && result.exists) {
                // EFEK VIDEO: Buka Chat & Pancing Kehadiran
                await sock.sendPresenceUpdate('composing', jid); // Status "Sedang Mengetik"
                await new Promise(res => setTimeout(res, 1500));
                await sock.sendPresenceUpdate('paused', jid);
                
                nomorValid.push(target);
                simpanProgress(nomorValid);
            }
        } catch (e) {}

        const persen = Math.round(((i + 1) / daftar.length) * 100);
        if (i % 3 === 0 || i === daftar.length - 1) {
            try {
                await bot.editMessageText(
                    `🔍 **PROGRESS VALIDATOR:**\n${buatBar(persen)} ${persen}%\n✅ **Valid:** ${nomorValid.length} nomor`,
                    { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
                );
            } catch (e) {}
        }
        await new Promise(res => setTimeout(res, JEDA_FILTER));
    }

    isProcessing = false;
    if (nomorValid.length > 0) {
        bot.sendMessage(chatId, `✅ **FILTER SELESAI.**\nTotal nomor siap hantam: ${nomorValid.length}\nKetik \`/jalankan\` untuk mulai blast.`);
    }
}

// --- PROSES BLAST ---
async function prosesJalankan(chatId) {
    if (!sock || isProcessing) return;
    let antrean = muatProgress();
    if (antrean.length === 0) return bot.sendMessage(chatId, "❌ Tidak ada antrean valid. Filter dulu.");

    isProcessing = true;
    let sukses = 0;
    let statusMsg = await bot.sendMessage(chatId, `🚀 **START BLASTING...**`);

    for (let i = 0; i < antrean.length; i++) {
        if (!isProcessing) break;
        const target = antrean[i];
        const jid = target.nomor + "@s.whatsapp.net";

        try {
            const pesanTxt = fs.readFileSync(FILE_PESAN, 'utf-8').replace(/{id}/g, target.nama);
            
            // Simulasi Manusia: Typing dulu sebelum kirim gambar
            await sock.sendPresenceUpdate('composing', jid);
            await new Promise(res => setTimeout(res, 2000));

            await sock.sendMessage(jid, { 
                image: fs.readFileSync(FILE_GAMBAR), 
                caption: pesanTxt
            });
            sukses++;
        } catch (err) {}

        const persen = Math.round(((i + 1) / antrean.length) * 100);
        try {
            await bot.editMessageText(`🚀 **PROGRESS BLAST:**\n${buatBar(persen)} ${persen}%\n✅ Terkirim: ${sukses}/${antrean.length}`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' });
        } catch (e) {}

        const jedaRandom = Math.floor(Math.random() * (JEDA_BLAST_MAX - JEDA_BLAST_MIN + 1) + JEDA_BLAST_MIN);
        await new Promise(res => setTimeout(res, jedaRandom));
    }

    isProcessing = false;
    bot.sendMessage(chatId, `🏁 **BLAST SELESAI!**\nBerhasil mengirim ke ${sukses} target.`);
}

// --- PERINTAH ---
bot.onText(/\/qr/, (msg) => startWA(msg.chat.id));
bot.onText(/\/filter/, (msg) => prosesFilter(msg.chat.id));
bot.onText(/\/jalankan/, (msg) => prosesJalankan(msg.chat.id));
bot.onText(/\/stop/, (msg) => { isProcessing = false; bot.sendMessage(msg.chat.id, "🛑 Berhenti."); });
bot.onText(/\/restart/, (msg) => {
    isProcessing = false;
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    bot.sendMessage(msg.chat.id, "♻️ **SESSION DIHAPUS.** Silakan /qr ulang.");
});
