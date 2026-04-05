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
const FILE_TEMP = 'temp_validator.json'; // Backup file agar tidak 0
const JEDA_VALIDATOR = 2000; 
const JEDA_BLAST_MIN = 7000;
const JEDA_BLAST_MAX = 15000;

let sock;
let isProcessing = false;
let nomorSudahFilter = []; 

// --- HELPER FUNCTIONS ---
function buatBar(p) {
    const filled = Math.round(p / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
}

function simpanKeFile(data) { fs.writeFileSync(FILE_TEMP, JSON.stringify(data)); }
function muatDariFile() { return fs.existsSync(FILE_TEMP) ? JSON.parse(fs.readFileSync(FILE_TEMP, 'utf-8')) : []; }

function rakitPesan(userId) {
    try {
        if (!fs.existsSync(FILE_PESAN)) return `Pesan default. ID: ${userId}`;
        let pesan = fs.readFileSync(FILE_PESAN, 'utf-8');
        const randomID = Math.random().toString(36).substring(7);
        return pesan.replace(/{id}/g, userId).replace(/{ref}/g, randomID);
    } catch (e) { return `Halo ${userId}`; }
}

function ambilDaftarNomor() {
    if (!fs.existsSync(FILE_NOMOR)) return [];
    const data = fs.readFileSync(FILE_NOMOR, 'utf-8');
    return data.split('\n')
        .map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 2) return null;
            let num = parts[parts.length - 1].replace(/[^0-9]/g, '');
            if (num.startsWith('0')) num = '62' + num.slice(1);
            return { nama: parts[0], nomor: num };
        })
        .filter(item => item !== null && item.nomor.length >= 10);
}

// --- STEP 1: KONEKSI WA ---
async function startWA(chatId) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["MacOS", "Chrome", "110.0.0.0"],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !isProcessing) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 10 });
                await bot.sendPhoto(chatId, buffer, { caption: "📸 **STEP 1: SCAN QR**\nSilakan scan untuk menghubungkan." });
            } catch (e) {}
        }

        if (connection === 'open') {
            const userJid = jidNormalizedUser(sock.user.id);
            const cleanNumber = userJid.split('@')[0];
            bot.sendMessage(chatId, `✅ **WA TERHUBUNG**\n📱 **Number** : ${cleanNumber}\n\nKetik \`/validator\` untuk membuka history chat.`);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                if (!isProcessing) setTimeout(() => startWA(chatId), 5000);
            }
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
}

// --- STEP 2: VALIDATOR (PENGGANTI FILTER) ---
async function prosesValidator(chatId) {
    if (!sock) return bot.sendMessage(chatId, "⚠️ Gunakan `/qr` dulu.");
    if (isProcessing) return;
    
    let daftar = ambilDaftarNomor();
    if (daftar.length === 0) return bot.sendMessage(chatId, "❌ File nomor.txt kosong.");

    isProcessing = true;
    nomorSudahFilter = [];
    const total = daftar.length;
    let statusMsg = await bot.sendMessage(chatId, `🔍 **STEP 2: SEDANG VALIDATOR...**\n0%`, { parse_mode: 'Markdown' });

    for (let i = 0; i < total; i++) {
        if (!isProcessing) break; 
        const target = daftar[i];
        const targetJid = jidNormalizedUser(target.nomor + "@s.whatsapp.net");
        
        try {
            if (sock?.ws?.readyState === 1) { 
                // Benar-benar membuka chat dengan mengecek status WhatsApp
                const [result] = await sock.onWhatsApp(targetJid);
                if (result && result.exists) {
                    await sock.sendPresenceUpdate('composing', targetJid);
                    await new Promise(res => setTimeout(res, 500));
                    nomorSudahFilter.push(target);
                    simpanKeFile(nomorSudahFilter); // Simpan tiap step ke file
                }
            }
        } catch (e) { console.log("Gagal akses nomor: " + target.nomor); }

        const persen = Math.round(((i + 1) / total) * 100);
        
        // PASTI MUNCUL NOMOR YANG SEDANG DIPROSES
        if (i % 2 === 0 || i === total - 1) { 
            try {
                await bot.editMessageText(
                    `🔍 **STEP 2: SEDANG VALIDATOR...**\n${buatBar(persen)} ${persen}%\n\n_Membuka chat: ${target.nomor}_`,
                    { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
                );
            } catch (e) {}
        }
        await new Promise(res => setTimeout(res, JEDA_VALIDATOR));
    }

    isProcessing = false;
    // Ambil data final
    const dataFinal = muatDariFile();
    bot.sendMessage(chatId, `✅ **VALIDATOR SELESAI**\nBerhasil membuka **${dataFinal.length}** history chat.\n\nKetik: /jalankan`);
}

// --- STEP 3: JALANKAN ---
async function prosesJalankan(chatId) {
    if (!sock || isProcessing) return;
    
    // Pastikan data diambil dari file backup agar tidak 0
    nomorSudahFilter = muatDariFile();
    if (nomorSudahFilter.length === 0) return bot.sendMessage(chatId, "❌ Database kosong, silakan `/validator` dulu!");

    isProcessing = true;
    let antrean = [...nomorSudahFilter];
    let sukses = 0;
    let statusMsg = await bot.sendMessage(chatId, `🚀 **BLASTING START...**`);

    while (antrean.length > 0 && isProcessing) {
        const target = antrean[0];
        const targetJid = jidNormalizedUser(target.nomor + "@s.whatsapp.net");

        try {
            if (sock?.ws?.readyState === 1) {
                await sock.sendMessage(targetJid, { 
                    image: fs.readFileSync(FILE_GAMBAR), 
                    caption: rakitPesan(target.nama) 
                });
                sukses++;
            }
        } catch (err) { console.log("Gagal kirim ke " + target.nomor); }

        antrean.shift();
        const persen = Math.round(((nomorSudahFilter.length - antrean.length) / nomorSudahFilter.length) * 100);
        
        try {
            await bot.editMessageText(`🚀 **PROGRESS:** ${persen}%\n✅ Berhasil: ${sukses}`, { chat_id: chatId, message_id: statusMsg.message_id });
        } catch (e) {}

        if (antrean.length > 0) {
            const jeda = Math.floor(Math.random() * (JEDA_BLAST_MAX - JEDA_BLAST_MIN + 1) + JEDA_BLAST_MIN);
            await new Promise(res => setTimeout(res, jeda));
        }
    }

    isProcessing = false;
    bot.sendMessage(chatId, `🏁 **DONE!** Terkirim: ${sukses}`);
}

bot.onText(/\/qr/, (msg) => startWA(msg.chat.id));
bot.onText(/\/validator/, (msg) => prosesValidator(msg.chat.id)); // Ganti ke /validator
bot.onText(/\/jalankan/, (msg) => prosesJalankan(msg.chat.id));
bot.onText(/\/stop/, (msg) => { isProcessing = false; bot.sendMessage(msg.chat.id, "🛑 Stop."); });
bot.onText(/\/restart/, (msg) => {
    isProcessing = false;
    if (fs.existsSync('./session_data')) {
        fs.rmSync('./session_data', { recursive: true, force: true });
    }
    if (fs.existsSync(FILE_TEMP)) fs.unlinkSync(FILE_TEMP);
    bot.sendMessage(msg.chat.id, "Sesi dihapus. Silakan /qr.");
});
