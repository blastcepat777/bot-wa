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
const JEDA_FILTER = 2000; 
const JEDA_BLAST_MIN = 7000;
const JEDA_BLAST_MAX = 15000;

let sock;
let isProcessing = false;
let nomorSudahFilter = []; 

function buatBar(p) {
    const filled = Math.round(p / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
}

function rakitPesan(userId) {
    try {
        if (!fs.existsSync(FILE_PESAN)) return `Pesan default. ID: ${userId}`;
        let pesan = fs.readFileSync(FILE_PESAN, 'utf-8');
        const randomID = Math.random().toString(36).substring(7);
        return pesan.replace(/{id}/g, userId).replace(/{ref}/g, randomID);
    } catch (e) {
        return `Halo ${userId}, ada kendala membaca file pesan.`;
    }
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
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 10 });
                await bot.sendPhoto(chatId, buffer, { caption: "📸 **STEP 1: SCAN QR**\nSilakan scan untuk menghubungkan." });
            } catch (e) { console.log("Gagal kirim QR"); }
        }
        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG**\n\nKetik `/filter` untuk membuka history chat.");
        }
        if (connection === 'close') {
            const code = lastDisconnect.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                console.log("Koneksi terputus, mencoba menyambung ulang...");
                setTimeout(() => startWA(chatId), 5000);
            }
        }
    });
    sock.ev.on('creds.update', saveCreds);
}

// --- STEP 2: FILTER ---
async function prosesFilter(chatId) {
    if (!sock) return bot.sendMessage(chatId, "⚠️ Hubungkan WA dulu dengan `/qr`.");
    if (isProcessing) return bot.sendMessage(chatId, "⏳ Ada proses lain yang sedang jalan.");
    
    let daftar = ambilDaftarNomor();
    if (daftar.length === 0) return bot.sendMessage(chatId, "❌ File `nomor.txt` kosong atau tidak ditemukan.");

    isProcessing = true;
    nomorSudahFilter = [];
    const total = daftar.length;
    let statusMsg = await bot.sendMessage(chatId, `🔍 **STEP 2: SEDANG FILTER...**\n${buatBar(0)} 0%`);

    for (let i = 0; i < total; i++) {
        if (!isProcessing) break; 
        const target = daftar[i];
        const targetJid = jidNormalizedUser(target.nomor + "@s.whatsapp.net");
        
        try {
            await sock.sendPresenceUpdate('composing', targetJid);
            await new Promise(res => setTimeout(res, 1000));
            await sock.sendPresenceUpdate('paused', targetJid);
            nomorSudahFilter.push(target);
        } catch (e) { console.log(`Gagal filter ${target.nomor}`); }

        const persen = Math.round(((i + 1) / total) * 100);
        if (i % 3 === 0 || i === total - 1) { 
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
    
    // Notifikasi otomatis saat 100% Selesai
    bot.sendMessage(chatId, `✅ **FILTER SELESAI 100%**\n\nSebanyak **${nomorSudahFilter.length}** chat telah berhasil dibuka di history.\n\nSilahkan ketik atau klik perintah di bawah ini untuk memulai blast:\n👉 /jalankan`);
}

// --- STEP 3: JALANKAN ---
async function prosesJalankan(chatId) {
    if (!sock) return bot.sendMessage(chatId, "⚠️ WA terputus. `/qr` ulang.");
    if (isProcessing) return bot.sendMessage(chatId, "⏳ Proses lain masih jalan.");
    if (nomorSudahFilter.length === 0) return bot.sendMessage(chatId, "❌ Daftar filter kosong. Ketik `/filter` dulu.");

    if (!fs.existsSync(FILE_GAMBAR)) return bot.sendMessage(chatId, "❌ File `poster.jpg` tidak ditemukan!");

    isProcessing = true;
    const totalAwal = nomorSudahFilter.length;
    let sukses = 0;
    let statusMsg = await bot.sendMessage(chatId, `🚀 **STEP 3: BLASTING...**\n0%`);

    // Gunakan salinan daftar agar aman
    let antrean = [...nomorSudahFilter];

    while (antrean.length > 0 && isProcessing) {
        const target = antrean[0];
        const targetJid = jidNormalizedUser(target.nomor + "@s.whatsapp.net");

        try {
            await sock.sendPresenceUpdate('composing', targetJid);
            await new Promise(res => setTimeout(res, 3000));

            await sock.sendMessage(targetJid, { 
                image: fs.readFileSync(FILE_GAMBAR), 
                caption: rakitPesan(target.nama) 
            });

            sukses++;
        } catch (err) {
            console.log("Gagal blast:", target.nomor);
        }

        antrean.shift();
        const persen = Math.round(((totalAwal - antrean.length) / totalAwal) * 100);
        
        try {
            await bot.editMessageText(
                `🚀 **STEP 3: BLASTING...**\n${buatBar(persen)} ${persen}%\n✅ Berhasil: ${sukses}\nSisa: ${antrean.length}`,
                { chat_id: chatId, message_id: statusMsg.message_id }
            );
        } catch (e) {}

        if (antrean.length > 0 && isProcessing) {
            const jeda = Math.floor(Math.random() * (JEDA_BLAST_MAX - JEDA_BLAST_MIN + 1) + JEDA_BLAST_MIN);
            await new Promise(res => setTimeout(res, jeda));
        }
    }

    isProcessing = false;
    bot.sendMessage(chatId, `🏁 **SELESAI**\nBerhasil kirim ke **${sukses}** nomor.`);
}

// --- HANDLER TELEGRAM ---
bot.onText(/\/qr/, (msg) => startWA(msg.chat.id));
bot.onText(/\/filter/, (msg) => prosesFilter(msg.chat.id));
bot.onText(/\/jalankan/, (msg) => prosesJalankan(msg.chat.id));
bot.onText(/\/stop/, (msg) => { 
    isProcessing = false; 
    bot.sendMessage(msg.chat.id, "🛑 Proses dihentikan paksa."); 
});
bot.onText(/\/restart/, (msg) => {
    isProcessing = false;
    if (fs.existsSync('./session_data')) {
        fs.rmSync('./session_data', { recursive: true, force: true });
        bot.sendMessage(msg.chat.id, "✅ Sesi dihapus. Ulangi dari `/qr`.");
    }
});
