const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_GAMBAR = './poster.jpg';
const FILE_PESAN = './script.txt'; // Membaca teks dari sini
const JEDA_MIN = 7000; 
const JEDA_MAX = 15000;

let sock;
let isBlasting = false;
let suksesCount = 0;
let gagalCount = 0;

// Fungsi untuk membuat pesan dari file teks
function rakitPesan(userId) {
    if (!fs.existsSync(FILE_PESAN)) return `Pesan file tidak ditemukan. ID: ${userId}`;
    
    let pesan = fs.readFileSync(FILE_PESAN, 'utf-8');
    const randomID = Math.random().toString(36).substring(7);
    
    // Mengganti placeholder {id} dengan nama dari nomor.txt
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

function updateFileNomor(sisa) {
    const content = sisa.map(item => `${item.nama} ${item.nomor}`).join('\n');
    fs.writeFileSync(FILE_NOMOR, content, 'utf-8');
}

async function jalankanBlast(chatId) {
    if (isBlasting || !sock) return;
    
    let daftar = ambilDaftarNomor();
    if (daftar.length === 0) return bot.sendMessage(chatId, "❌ Nomor kosong.");

    isBlasting = true;
    suksesCount = 0;
    gagalCount = 0;
    const totalAwal = daftar.length;

    let statusMsg = await bot.sendMessage(chatId, `🚀 **PROSES BLAST TERPISAH DIMULAI**\n0%`);

    while (daftar.length > 0 && isBlasting) {
        const target = daftar[0];
        const targetJid = jidNormalizedUser(target.nomor + "@s.whatsapp.net");

        try {
            // 1. Simulasi buka chat & ngetik sebentar
            await sock.sendPresenceUpdate('composing', targetJid);
            await new Promise(res => setTimeout(res, 3000));

            // 2. KIRIM GAMBAR TERLEBIH DAHULU
            await sock.sendMessage(targetJid, { 
                image: fs.readFileSync(FILE_GAMBAR) 
            });

            // Jeda agar terlihat seperti manusia mengirim foto lalu mengetik
            await new Promise(res => setTimeout(res, 2000));
            await sock.sendPresenceUpdate('composing', targetJid);
            await new Promise(res => setTimeout(res, 3000));

            // 3. KIRIM PESAN TEKS DARI SCRIPT.TXT
            await sock.sendMessage(targetJid, { 
                text: rakitPesan(target.nama) 
            });

            suksesCount++;
        } catch (err) {
            console.log("Gagal kirim ke:", target.nomor);
            gagalCount++;
        }

        daftar.shift();
        updateFileNomor(daftar);

        const persen = Math.round(((totalAwal - daftar.length) / totalAwal) * 100);
        try {
            await bot.editMessageText(
                `📊 **PROGRESS BLAST**\n[${"█".repeat(Math.round(persen/10))}${"░".repeat(10-Math.round(persen/10))}] ${persen}%\n\n✅ Berhasil: ${suksesCount}\n❌ Gagal: ${gagalCount}\nSisa: ${daftar.length}`,
                { chat_id: chatId, message_id: statusMsg.message_id }
            );
        } catch (e) {}

        if (daftar.length > 0 && isBlasting) {
            const jeda = Math.floor(Math.random() * (JEDA_MAX - JEDA_MIN + 1) + JEDA_MIN);
            await new Promise(res => setTimeout(res, jeda));
        }
    }
    isBlasting = false;
    bot.sendMessage(chatId, "🏁 **BLAST SELESAI!**");
}

async function startWA(chatId, phoneNumber = null) {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["MacOS", "Chrome", "101.0.4951.54"],
        syncFullHistory: true 
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !phoneNumber) {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            await bot.sendPhoto(chatId, buffer, { caption: "📸 Scan ini untuk menghubungkan WA." });
        }

        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **WA TERHUBUNG**\n\nFilter nomor selesai. Ketik `/jalankan` untuk mulai blast terpisah.");
        }

        if (connection === 'close') {
            const code = lastDisconnect.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) setTimeout(() => startWA(chatId), 5000);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Handler Telegram
bot.onText(/\/start/, (msg) => startWA(msg.chat.id));
bot.onText(/\/jalankan/, (msg) => jalankanBlast(msg.chat.id));
bot.onText(/\/stop/, (msg) => { isBlasting = false; bot.sendMessage(msg.chat.id, "🛑 Berhenti."); });
bot.onText(/\/restart/, (msg) => {
    isBlasting = false;
    if (fs.existsSync('./session_data')) {
        fs.rmSync('./session_data', { recursive: true, force: true });
        bot.sendMessage(msg.chat.id, "✅ Sesi dihapus. Ketik /start.");
    }
});
