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
const FILE_TEMP_FILTER = 'database_valid.json'; 
const JEDA_FILTER = 3500; // Jeda sedikit lebih lama agar pembukaan chat stabil
const JEDA_BLAST_MIN = 7000;
const JEDA_BLAST_MAX = 15000;

let sock;
let isProcessing = false;

// --- DATABASE SISTEM ---
function simpanProgress(data) { 
    fs.writeFileSync(FILE_TEMP_FILTER, JSON.stringify(data, null, 2)); 
}

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

// --- STEP 1: KONEKSI ---
async function startWA(chatId) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["MacOS", "Chrome", "110.0.0.0"],
        syncFullHistory: false,
        connectTimeoutMs: 60000
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr && !isProcessing) {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR**" });
        }
        if (connection === 'open') {
            bot.sendMessage(chatId, `✅ **WA TERHUBUNG**\n\nKetik \`/filter\` untuk membuka history chat.`);
        }
        if (connection === 'close') {
            if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                setTimeout(() => startWA(chatId), 5000);
            }
        }
    });
    sock.ev.on('creds.update', saveCreds);
}

// --- STEP 2: REAL FILTER (MEMBUAT HISTORY CHAT NYATA) ---
async function prosesFilter(chatId) {
    if (!sock) return bot.sendMessage(chatId, "⚠️ Gunakan `/qr` dulu.");
    if (isProcessing) return;
    
    let daftar = ambilDaftarNomor();
    if (daftar.length === 0) return bot.sendMessage(chatId, "❌ File nomor kosong.");

    isProcessing = true;
    let nomorSudahFilter = []; 
    simpanProgress([]); // Reset database lama

    let statusMsg = await bot.sendMessage(chatId, `🔍 **MEMULAI OPEN HISTORY...**`);

    for (let i = 0; i < daftar.length; i++) {
        if (!isProcessing) break; 
        const target = daftar[i];
        const targetJid = target.nomor + "@s.whatsapp.net";
        
        try {
            // 1. Verifikasi nomor di server
            const [result] = await sock.onWhatsApp(targetJid);
            if (result && result.exists) {
                // 2. KIRIM PESAN KOSONG (Ini yang membuat chat MUNCUL di HP)
                await sock.sendMessage(targetJid, { text: "\u200B" }); 
                
                nomorSudahFilter.push(target);
                simpanProgress(nomorSudahFilter); 
            }
        } catch (e) {
            console.log("Gagal memicu chat: " + target.nomor);
        }

        const persen = Math.round(((i + 1) / daftar.length) * 100);
        if (i % 2 === 0 || i === daftar.length - 1) { 
            try { 
                await bot.editMessageText(
                    `🔍 **PROGRESS:** ${buatBar(persen)} ${persen}%\n📱 **Membuka:** \`${target.nomor}\`\n✅ **History Terbuka:** ${nomorSudahFilter.length}`, 
                    { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
                ); 
            } catch (e) {}
        }
        await new Promise(res => setTimeout(res, JEDA_FILTER));
    }

    isProcessing = false;
    bot.sendMessage(chatId, `✅ **FILTER SELESAI**\nTotal chat terbuka: **${muatProgress().length}** nomor.\n\nKlik 👉 /jalankan`);
}

// --- STEP 3: JALANKAN BLAST ---
async function prosesJalankan(chatId) {
    if (!sock || isProcessing) return;
    
    let antrean = muatProgress();
    if (antrean.length === 0) return bot.sendMessage(chatId, "❌ Database kosong. `/filter` dulu.");

    isProcessing = true;
    let sukses = 0;
    let statusMsg = await bot.sendMessage(chatId, `🚀 **START BLASTING...**`);

    for (let i = 0; i < antrean.length; i++) {
        if (!isProcessing) break;
        const target = antrean[i];
        try {
            const pesanTxt = fs.readFileSync(FILE_PESAN, 'utf-8').replace(/{id}/g, target.nama);
            await sock.sendMessage(target.nomor + "@s.whatsapp.net", { 
                image: fs.readFileSync(FILE_GAMBAR), 
                caption: pesanTxt
            });
            sukses++;
        } catch (err) {}

        const persen = Math.round(((i + 1) / antrean.length) * 100);
        try { 
            await bot.editMessageText(`🚀 **BLASTING:** ${persen}%\n✅ Berhasil: ${sukses}/${antrean.length}`, { chat_id: chatId, message_id: statusMsg.message_id }); 
        } catch (e) {}

        const jedaRandom = Math.floor(Math.random() * (JEDA_BLAST_MAX - JEDA_BLAST_MIN + 1) + JEDA_BLAST_MIN);
        await new Promise(res => setTimeout(res, jedaRandom));
    }

    isProcessing = false;
    bot.sendMessage(chatId, `🏁 **DONE!** Terkirim: ${sukses} target.`);
}

bot.onText(/\/qr/, (msg) => startWA(msg.chat.id));
bot.onText(/\/filter/, (msg) => prosesFilter(msg.chat.id));
bot.onText(/\/jalankan/, (msg) => prosesJalankan(msg.chat.id));
bot.onText(/\/stop/, (msg) => { isProcessing = false; bot.sendMessage(msg.chat.id, "🛑 Berhenti."); });
