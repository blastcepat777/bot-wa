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
const FILE_TEMP_FILTER = 'temp_filter.json'; 
const JEDA_FILTER = 2000; 
const JEDA_BLAST_MIN = 7000;
const JEDA_BLAST_MAX = 15000;

let sock;
let isProcessing = false;
let nomorSudahFilter = []; 

// Fungsi Helper
function simpanProgress(data) { fs.writeFileSync(FILE_TEMP_FILTER, JSON.stringify(data)); }
function muatProgress() { return fs.existsSync(FILE_TEMP_FILTER) ? JSON.parse(fs.readFileSync(FILE_TEMP_FILTER, 'utf-8')) : []; }
function buatBar(p) { return "█".repeat(Math.round(p / 10)) + "░".repeat(10 - Math.round(p / 10)); }

function ambilDaftarNomor() {
    if (!fs.existsSync(FILE_NOMOR)) return [];
    return fs.readFileSync(FILE_NOMOR, 'utf-8').split('\n')
        .map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 2) return null;
            return { nama: parts[0], nomor: parts[parts.length - 1].replace(/[^0-9]/g, '') };
        }).filter(item => item !== null && item.nomor.length >= 10);
}

// --- STEP 1: KONEKSI STABIL ---
async function startWA(chatId) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["MacOS", "Chrome", "110.0.0.0"],
        syncFullHistory: false, // PENTING: Mencegah logout paksa karena beban chat berat
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 15000
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Hanya kirim QR jika belum connect & sedang tidak memproses filter
        if (qr && !isProcessing) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 10 });
                await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR**\nSesi terputus atau baru, silakan scan." });
            } catch (e) {}
        }

        if (connection === 'open') {
            const myNumber = jidNormalizedUser(sock.user.id).split('@')[0]; // Menampilkan nomor terhubung
            bot.sendMessage(chatId, `✅ **WA TERHUBUNG**\n📱 **Number** : ${myNumber}\n\nKetik \`/filter\` untuk lanjut.`);
        }

        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                // Reconnect otomatis tanpa spam QR jika sesi masih valid
                setTimeout(() => startWA(chatId), 5000);
            }
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
}

// --- STEP 2: FILTER DENGAN BACKUP ---
async function prosesFilter(chatId) {
    if (!sock) return bot.sendMessage(chatId, "⚠️ Gunakan `/qr` dulu.");
    if (isProcessing) return;
    
    let daftar = ambilDaftarNomor();
    if (daftar.length === 0) return bot.sendMessage(chatId, "❌ File nomor kosong.");

    isProcessing = true;
    nomorSudahFilter = []; 
    let statusMsg = await bot.sendMessage(chatId, `🔍 **FILTERING...**\n0%`);

    for (let i = 0; i < daftar.length; i++) {
        if (!isProcessing) break; 
        const target = daftar[i];
        const targetJid = jidNormalizedUser(target.nomor + "@s.whatsapp.net");
        
        try {
            if (sock.ws.readyState === 1) {
                await sock.sendPresenceUpdate('composing', targetJid);
                await new Promise(res => setTimeout(res, 800));
                nomorSudahFilter.push(target);
                simpanProgress(nomorSudahFilter); // Simpan tiap step agar tidak "0" jika DC
            }
        } catch (e) {}

        const persen = Math.round(((i + 1) / daftar.length) * 100);
        if (i % 5 === 0 || i === daftar.length - 1) { 
            try { await bot.editMessageText(`🔍 **FILTERING...**\n${buatBar(persen)} ${persen}%`, { chat_id: chatId, message_id: statusMsg.message_id }); } catch (e) {}
        }
        await new Promise(res => setTimeout(res, JEDA_FILTER));
    }

    isProcessing = false;
    // Jika filter selesai tapi variabel kosong (efek DC), ambil dari backup
    if (nomorSudahFilter.length === 0) nomorSudahFilter = muatProgress();

    bot.sendMessage(chatId, `✅ **FILTER SELESAI 100%**\nTotal: **${nomorSudahFilter.length}** nomor.\n\nKlik 👉 /jalankan`);
}

// --- STEP 3: JALANKAN ---
async function prosesJalankan(chatId) {
    if (!sock || isProcessing) return;
    if (nomorSudahFilter.length === 0) nomorSudahFilter = muatProgress();
    if (nomorSudahFilter.length === 0) return bot.sendMessage(chatId, "❌ Data kosong, silakan `/filter` ulang.");

    isProcessing = true;
    let sukses = 0;
    let antrean = [...nomorSudahFilter];
    let statusMsg = await bot.sendMessage(chatId, `🚀 **BLASTING...**`);

    while (antrean.length > 0 && isProcessing) {
        const target = antrean[0];
        try {
            if (sock.ws.readyState === 1) {
                await sock.sendMessage(jidNormalizedUser(target.nomor + "@s.whatsapp.net"), { 
                    image: fs.readFileSync(FILE_GAMBAR), 
                    caption: fs.readFileSync(FILE_PESAN, 'utf-8').replace(/{id}/g, target.nama) 
                });
                sukses++;
            }
        } catch (err) {}

        antrean.shift();
        const persen = Math.round(((nomorSudahFilter.length - antrean.length) / nomorSudahFilter.length) * 100);
        try { await bot.editMessageText(`🚀 **PROGRESS:** ${persen}%\n✅ Berhasil: ${sukses}`, { chat_id: chatId, message_id: statusMsg.message_id }); } catch (e) {}

        if (antrean.length > 0) await new Promise(res => setTimeout(res, Math.floor(Math.random() * (JEDA_BLAST_MAX - JEDA_BLAST_MIN + 1) + JEDA_BLAST_MIN)));
    }

    isProcessing = false;
    if (fs.existsSync(FILE_TEMP_FILTER)) fs.unlinkSync(FILE_TEMP_FILTER);
    bot.sendMessage(chatId, `🏁 **DONE!** Terkirim: ${sukses}`);
}

bot.onText(/\/qr/, (msg) => startWA(msg.chat.id));
bot.onText(/\/filter/, (msg) => prosesFilter(msg.chat.id));
bot.onText(/\/jalankan/, (msg) => prosesJalankan(msg.chat.id));
bot.onText(/\/stop/, (msg) => { isProcessing = false; bot.sendMessage(msg.chat.id, "🛑 Stop."); });
bot.onText(/\/restart/, (msg) => {
    isProcessing = false;
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    if (fs.existsSync(FILE_TEMP_FILTER)) fs.unlinkSync(FILE_TEMP_FILTER);
    bot.sendMessage(msg.chat.id, "Sesi dihapus. Silakan /qr.");
});
