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
const JEDA_FILTER = 4000; 
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

// --- STEP 1: KONEKSI DENGAN PERBAIKAN QR ---
async function startWA(chatId, isRelogin = false) {
    // Perbaikan: Force logout dan hapus sesi agar QR /relogin tidak error
    if (isRelogin || !sock) {
        if (sock) {
            try {
                sock.ev.removeAllListeners();
                sock.terminate();
            } catch (e) {}
        }
        if (isRelogin && fs.existsSync('./session_data')) {
            fs.rmSync('./session_data', { recursive: true, force: true });
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        // Identitas Browser agar QR stabil & terbaca sebagai WA Web
        browser: ["Windows", "Chrome", "110.0.0.0"], 
        syncFullHistory: false,
        printQRInTerminal: false,
        connectTimeoutMs: 60000
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            // Perbaikan: Resolusi tinggi (Scale 15) agar mudah di-scan di Telegram
            const buffer = await QRCode.toBuffer(qr, { 
                scale: 15, 
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' } 
            });
            const caption = isRelogin ? "🔄 **SCAN QR CLIENT (BARU)**\nPastikan pancingan history sudah selesai." : "📸 **SCAN QR PANCINGAN**";
            await bot.sendPhoto(chatId, buffer, { caption });
        }

        if (connection === 'open') {
            const currentDb = muatProgress();
            if (isRelogin && currentDb.length > 0) {
                bot.sendMessage(chatId, `✅ **CLIENT TERHUBUNG**\n\nData: **${currentDb.length}** nomor siap.\nKetik 👉 \`/jalankan\``);
            } else {
                bot.sendMessage(chatId, `✅ **WA TERHUBUNG**\n\nKetik \`/filter\` untuk injeksi history ke WA Web.`);
            }
        }

        if (connection === 'close') {
            const code = lastDisconnect.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                setTimeout(() => startWA(chatId, isRelogin), 5000);
            }
        }
    });
    sock.ev.on('creds.update', saveCreds);
}

// --- STEP 2: NINJA FILTER (MUNCUL DI WA WEB, BERSIH DI MEMBER) ---
async function prosesFilter(chatId) {
    if (!sock) return bot.sendMessage(chatId, "⚠️ Gunakan `/qr` dulu.");
    if (isProcessing) return;
    
    let daftar = ambilDaftarNomor();
    if (daftar.length === 0) return bot.sendMessage(chatId, "❌ File nomor kosong.");

    isProcessing = true;
    let nomorSudahFilter = []; 
    simpanProgress([]); 

    let statusMsg = await bot.sendMessage(chatId, `🔍 **MEMULAI INJEKSI WA WEB...**\n(Chat akan terbuka otomatis di WA Anda)`);

    for (let i = 0; i < daftar.length; i++) {
        if (!isProcessing) break; 
        const target = daftar[i];
        const targetJid = target.nomor + "@s.whatsapp.net";
        
        try {
            const [result] = await sock.onWhatsApp(targetJid);
            if (result && result.exists) {
                /**
                 * METODE NINJA:
                 * Memaksa WA Web/HP Anda membuat baris chat baru (Upsert)
                 * dengan status unread, sehingga muncul pesan sistem Meta Secure.
                 */
                await sock.ev.emit('chats.upsert', [{
                    id: targetJid,
                    conversationTimestamp: Math.floor(Date.now() / 1000),
                    unreadCount: 1
                }]);

                // Sinyal pancingan agar server WA menyinkronkan daftar chat
                await sock.sendPresenceUpdate('available', targetJid);
                
                nomorSudahFilter.push(target);
                simpanProgress(nomorSudahFilter); 
            }
        } catch (e) {}

        if (i % 2 === 0 || i === daftar.length - 1) {
            const persen = Math.round(((i + 1) / daftar.length) * 100);
            try { 
                await bot.editMessageText(
                    `🔍 **PROGRESS:** ${buatBar(persen)} ${persen}%\n✅ **History Terpancing:** ${nomorSudahFilter.length}`, 
                    { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
                ); 
            } catch (e) {}
        }
        await new Promise(res => setTimeout(res, JEDA_FILTER));
    }

    isProcessing = false;
    bot.sendMessage(chatId, `✅ **FILTER SELESAI**\nCek WA Web Anda, chat sudah terbuka.\n\nLanjut ketik \`/relogin\` untuk scan akun Client.`);
}

// --- STEP 3: JALANKAN BLAST ---
async function prosesJalankan(chatId) {
    if (!sock || isProcessing) return;
    let antrean = muatProgress();
    if (antrean.length === 0) return bot.sendMessage(chatId, "❌ Database kosong.");

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
bot.onText(/\/relogin/, (msg) => startWA(msg.chat.id, true));
bot.onText(/\/restart/, (msg) => {
    isProcessing = false;
    if (sock) { try { sock.logout(); sock.end(); } catch(e){} }
    if (fs.existsSync('./session_data')) fs.rmSync('./session_data', { recursive: true, force: true });
    if (fs.existsSync(FILE_TEMP_FILTER)) fs.unlinkSync(FILE_TEMP_FILTER);
    bot.sendMessage(msg.chat.id, "♻️ **RESET TOTAL BERHASIL.**");
});
