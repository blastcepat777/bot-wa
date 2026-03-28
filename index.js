const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

// --- PENGATURAN BLAST ---
const FILE_NOMOR = 'nomor.txt';
const JEDA_DETIK = 15; // Jeda 15 detik agar lebih aman (disarankan)

const PESAN_BLAST = `🚀 *𝐌𝐈𝐍𝐈𝐌𝐀𝐋 𝐓𝐔𝐑𝐔𝐍 𝟕 𝐒𝐂𝐀𝐓𝐓𝐄𝐑 𝐊𝐇𝐔𝐒𝐔𝐒 𝐁𝐀𝐆𝐈 𝐘𝐀𝐍𝐆 𝐌𝐄𝐍𝐃𝐀𝐏𝐀𝐓𝐊𝐀𝐍 𝐏𝐄𝐒𝐀𝐍 𝐈𝐍𝐈* 🚀

✅ *User ID :* A (full_name)

*⭐️ 𝐊𝐄𝐌𝐄𝐍𝐀𝐍𝐆𝐀𝐍 𝐓𝐄𝐑𝐉𝐀𝐌𝐈𝐍 𝐋𝐎𝐆𝐈𝐍 & 𝐌𝐀𝐈𝐍𝐊𝐀𝐍 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆 ‼️ ⭐️*

💎 *Estimasi Kemenangan :*
• Depo 25RB → 500RB + 25RB 💰
• Depo 50RB → 700RB + 50RB 💵
• Depo 150RB → 1,1JT + 150RB 🏆
• Depo 200RB → 2JT + 200RB 🚀

🎰 *Situs Gampang WD : WSO288*
🎯 *Link Login :* wso288slotresmi.sbs/login

‼️ *𝐊𝐈𝐑𝐈𝐌 "𝐔𝐒𝐄𝐑 𝐈𝐃" 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆 𝐊𝐄 𝐍𝐎𝐌𝐎𝐑 𝐃𝐈𝐁𝐀𝐖𝐀𝐇 𝐈𝐍𝐈* ‼️ 𝐀𝐆𝐀𝐑 𝐈𝐃 𝐀𝐍𝐃𝐀 𝐎𝐓𝐎𝐌𝐀𝐓𝐈𝐒 𝐓𝐔𝐑𝐔𝐍 🎰*𝐒𝐜𝐚𝐭𝐭𝐞𝐫 𝐭𝐮𝐫𝐮𝐧 𝐛𝐞𝐫𝐭𝐮𝐛𝐢-𝐭𝐮𝐛𝐢!*

*VERIFIKASI AKUN ANDA SEKARANG & DAPATKAN KEMENANGAN CEPAT* 👇
💬 *WA 𝑯𝒂𝒏𝒏𝒚 𝒍𝒂𝒘𝒓𝒂𝒏𝒄𝒆* : https://dangsineul.top/wa-hanny-lawrance

*SS kan pesan ini untuk aku bantu langsung kemenangannya ya!*`;

// --------------------------

let isBlasting = false;
let suksesCount = 0;
let gagalCount = 0;

// Fungsi ambil nomor dari file
function ambilDaftarNomor() {
    if (!fs.existsSync(FILE_NOMOR)) return [];
    return fs.readFileSync(FILE_NOMOR, 'utf-8').split('\n').map(n => n.trim()).filter(n => n.length > 5);
}

// Fungsi update file (hapus yang sudah dikirim)
function updateFileNomor(sisa) {
    fs.writeFileSync(FILE_NOMOR, sisa.join('\n'), 'utf-8');
}

// Fungsi generate kode unik agar pesan tidak identik (Anti-Spam)
function getRandomId() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

async function startWA(chatId) {
    if (isBlasting) return bot.sendMessage(chatId, "⚠️ Blast sedang berjalan, jangan spam /start.");

    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.0"]
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN SEKARANG**\n_Rekap otomatis muncul jika koneksi putus._", parse_mode: 'Markdown' });
        }

        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            if (isBlasting) {
                isBlasting = false;
                bot.sendMessage(chatId, `⚠️ **KONEKSI TERPUTUS!**\n\n✅ BERHASIL: ${suksesCount}\n❌ GAGAL: ${gagalCount}\n📋 Sisa antrean di file: ${ambilDaftarNomor().length}`);
            }
            if (reason !== DisconnectReason.loggedOut) startWA(chatId);
        } 
        
        else if (connection === 'open') {
            isBlasting = true;
            suksesCount = 0;
            gagalCount = 0;
            let daftar = ambilDaftarNomor();

            bot.sendMessage(chatId, `🚀 **WhatsApp Terhubung!**\nTarget: ${daftar.length} nomor.\n_Ketik /stop untuk berhenti._`);

            while (daftar.length > 0 && isBlasting) {
                const nomor = daftar[0];
                // Tambahkan kode unik di akhir pesan agar tiap chat berbeda sedikit
                const pesanFinal = `${PESAN_BLAST}\n\n_Ref ID: ${getRandomId()}_`;

                try {
                    await sock.sendMessage(`${nomor}@s.whatsapp.net`, { text: pesanFinal });
                    suksesCount++;
                    console.log(`✅ Berhasil: ${nomor}`);
                } catch (err) {
                    gagalCount++;
                    console.log(`❌ Gagal: ${nomor}`);
                }

                daftar.shift(); // Hapus nomor yang baru diproses
                updateFileNomor(daftar); // Simpan perubahan ke file .txt

                if (daftar.length > 0 && isBlasting) {
