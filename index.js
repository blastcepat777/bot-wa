const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_GAMBAR = './poster.jpg';
const FILE_PESAN = './script.txt';
const JEDA_FILTER = 2000; // Cepat karena hanya buka chat
const JEDA_BLAST_MIN = 7000;
const JEDA_BLAST_MAX = 15000;

let sock;
let isProcessing = false;
let nomorSudahFilter = []; // Menyimpan daftar yang sudah "dibuka" chatnya

function buatBar(p) {
    const filled = Math.round(p / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
}

function rakitPesan(userId) {
    if (!fs.existsSync(FILE_PESAN)) return `Pesan default. ID: ${userId}`;
    let pesan = fs.readFileSync(FILE_PESAN, 'utf-8');
    const randomID = Math.random().toString(36).substring(7);
    return pesan.replace(/{id}/g, userId).replace(/{ref}/g, randomID);
}

function ambilDaftarNomor() {
    if (!fs.existsSync(FILE_NOMOR)) return [];
    const data = fs.readFileSync(FILE_NOMOR, 'utf-8');
    return data.split('\n')
        .map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 2) return null;
            return { nama: parts[0], nomor: parts[parts.length - 1].replace(/[^0-9]/g, '') };
        })
        .filter(item => item !== null && item.nomor.length >= 10);
}

// --- STEP 1: KONEKSI ---
async function startWA(chatId) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["MacOS", "Chrome", "110.0.0.0"],
        syncFullHistory: true 
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            await bot.sendPhoto(chatId, buffer, { caption: "📸 **STEP 1: SCAN QR**\nSilakan scan untuk menghubungkan." });
        }
        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG**\n\nLanjut ke **STEP 2**, ketik `/filter` untuk membuka history chat.");
        }
        if (connection === 'close') {
            const code = lastDisconnect.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) setTimeout(() => startWA(chatId), 5000);
        }
    });
    sock.ev.on('creds.update', saveCreds);
}

// --- STEP 2: FILTER (Hanya Buka Chat) ---
async function prosesFilter(chatId) {
    if (isProcessing || !sock) return;
    let daftar = ambilDaftarNomor();
    if (daftar.length === 0) return bot.sendMessage(chatId, "❌ Daftar nomor kosong.");

    isProcessing = true;
    nomorSudahFilter = [];
    const total = daftar.length;
    let statusMsg = await bot.sendMessage(chatId, `🔍 **STEP 2: SEDANG FILTER...**\n${buatBar(0)} 0%`);

    for (let i = 0; i < daftar.length; i++) {
        const target = daftar[i];
        const targetJid = jidNormalizedUser(target.nomor + "@s.whatsapp.net");
        
        try {
            // "Membuka Chat" dengan mengirim signal sedang mengetik lalu berhenti
            await sock.sendPresenceUpdate('composing', targetJid);
            await new Promise(res => setTimeout(res, 1000));
            await sock.sendPresenceUpdate('paused', targetJid);
            
            nomorSudahFilter.push(target);
        } catch (e) {}

        const persen = Math.round(((i + 1) / total) * 100);
        if (i % 2 === 0 || i === total - 1) { // Update tiap 2 nomor agar tidak spam telegram
            try {
                await bot.editMessageText(
                    `🔍 **STEP 2: SEDANG FILTER...**\n${buatBar(persen)} ${persen}%\n_Membuka chat: ${target.nomor}_`,
                    { chat_id: chatId, message_id: statusMsg.message_id }
                );
            } catch (e) {}
        }
        await new Promise(res => setTimeout(res, JEDA_FILTER));
    }

    isProcessing = false;
    bot.sendMessage(chatId, `✅ **FILTER SELESAI (100%)**\nSemua chat sudah terbuka di history.\n\nLanjut ke **STEP 3**, ketik `/jalankan` untuk blast.`);
}

// --- STEP 3: JALANKAN (Kirim Gambar + Teks jadi satu) ---
async function prosesJalankan(chatId) {
    if (isProcessing || !sock) return;
    if (nomorSudahFilter.length === 0) return bot.sendMessage(chatId, "❌ Belum ada nomor yang difilter. Ketik /filter dulu.");

    isProcessing = true;
    const total = nomorSudahFilter.length;
    let sukses = 0;
    let statusMsg = await bot.sendMessage(chatId, `🚀 **STEP 3: BLASTING...**\n${buatBar(0)} 0%`);

    while (nomorSudahFilter.length > 0) {
        const target = nomorSudahFilter[0];
        const targetJid = jidNormalizedUser(target.nomor + "@s.whatsapp.net");

        try {
            await sock.sendPresenceUpdate('composing', targetJid);
            await new Promise(res => setTimeout(res, 3000));

            // KIRIM GAMBAR DAN TEKS (CAPTION) DALAM SATU PESAN
            await sock.sendMessage(targetJid, { 
                image: fs.readFileSync(FILE_GAMBAR), 
                caption: rakitPesan(target.nama) 
            });

            sukses++;
        } catch (err) {
            console.log("Gagal blast:", target.nomor);
        }

        nomorSudahFilter.shift(); // Hapus dari antrean yang sudah difilter
        const persen = Math.round(((sukses + nomorSudahFilter.length - nomorSudahFilter.length) / total) * 100);
        
        try {
            await bot.editMessageText(
                `🚀 **STEP 3: BLASTING...**\n${buatBar(persen)} ${persen}%\n✅ Berhasil: ${sukses}`,
                { chat_id: chatId, message_id: statusMsg.message_id }
            );
        } catch (e) {}

        if (nomorSudahFilter.length > 0) {
            const jeda = Math.floor(Math.random() * (JEDA_BLAST_MAX - JEDA_BLAST_MIN + 1) + JEDA_BLAST_MIN);
            await new Promise(res => setTimeout(res, jeda));
        }
    }

    isProcessing = false;
    bot.sendMessage(chatId, "🏁 **SEMUA PESAN TERKIRIM!**");
}

// --- HANDLER TELEGRAM ---
bot.onText(/\/qr/, (msg) => startWA(msg.chat.id));
bot.onText(/\/filter/, (msg) => prosesFilter(msg.chat.id));
bot.onText(/\/jalankan/, (msg) => prosesJalankan(msg.chat.id));
bot.onText(/\/stop/, (msg) => { isProcessing = false; bot.sendMessage(msg.chat.id, "🛑 Dihentikan."); });
bot.onText(/\/restart/, (msg) => {
    isProcessing = false;
    if (fs.existsSync('./session_data')) {
        fs.rmSync('./session_data', { recursive: true, force: true });
        bot.sendMessage(msg.chat.id, "✅ Sesi dihapus. Ulangi dari /qr.");
    }
});
