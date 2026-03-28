const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

// --- PENGATURAN BLAST ---
const FILE_NOMOR = 'nomor.txt';
const JEDA_DETIK = 0; // Jeda aman agar tidak cepat terblokir

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

// FUNGSI AMBIL NOMOR (Sudah Dilengkapi Pembersih Teks Otomatis)
function ambilDaftarNomor() {
    if (!fs.existsSync(FILE_NOMOR)) return [];
    const data = fs.readFileSync(FILE_NOMOR, 'utf-8');
    return data.split('\n')
        .map(line => line.replace(/[^0-9]/g, '').trim()) // Hanya ambil angka, buang nama/spasi
        .filter(num => num.length >= 10); // Pastikan panjang nomor valid
}

function updateFileNomor(sisa) {
    fs.writeFileSync(FILE_NOMOR, sisa.join('\n'), 'utf-8');
}

function getRandomId() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

async function startWA(chatId) {
    if (isBlasting) return bot.sendMessage(chatId, "⚠️ Blast sedang berjalan.");

    // Hapus folder sesi lama jika ingin scan ulang dari nol (opsional)
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
            await bot.sendPhoto(chatId, buffer, { caption: "📸 **BARCODE SIAP SCAN**\n\n_Pastikan Anda scan menggunakan WhatsApp yang ingin digunakan untuk blast._", parse_mode: 'Markdown' });
        }

        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            if (isBlasting) {
                isBlasting = false;
                bot.sendMessage(chatId, `⚠️ **KONEKSI TERPUTUS/WA KELUAR**\n\n✅ BERHASIL: ${suksesCount}\n❌ GAGAL: ${gagalCount}\n📋 Sisa nomor di file: ${ambilDaftarNomor().length}`);
            }
            if (reason !== DisconnectReason.loggedOut) startWA(chatId);
        } 
        
        else if (connection === 'open') {
            isBlasting = true;
            suksesCount = 0;
            gagalCount = 0;
            let daftar = ambilDaftarNomor();

            bot.sendMessage(chatId, `🚀 **WhatsApp Terhubung!**\nDaftar Antrean: ${daftar.length} nomor.\n_Mulai mengirim..._`);

            while (daftar.length > 0 && isBlasting) {
                const nomor = daftar[0];
                const pesanFinal = `${PESAN_BLAST}\n\n_Ref ID: ${getRandomId()}_`;

                try {
                    await sock.sendMessage(`${nomor}@s.whatsapp.net`, { text: pesanFinal });
                    suksesCount++;
                    console.log(`✅ Terkirim: ${nomor}`);
                } catch (err) {
                    gagalCount++;
                    console.log(`❌ Gagal: ${nomor}`);
                }

                daftar.shift(); // Hapus nomor yang sudah diproses
                updateFileNomor(daftar); // Update file .txt

                if (daftar.length > 0 && isBlasting) {
                    await new Promise(res => setTimeout(res, JEDA_DETIK * 1000));
                }
            }

            if (isBlasting || daftar.length === 0) {
                isBlasting = false;
                bot.sendMessage(chatId, `🏁 **PROSES BLAST SELESAI**\n\n✅ BERHASIL: ${suksesCount}\n❌ GAGAL: ${gagalCount}`);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🔍 Menyiapkan Barcode...");
    startWA(msg.chat.id);
});

bot.onText(/\/stop/, (msg) => {
    if (isBlasting) {
        isBlasting = false;
        bot.sendMessage(msg.chat.id, "🛑 **Blast Dihentikan.** Rekap sisa sedang dihitung...");
    } else {
        bot.sendMessage(msg.chat.id, "❌ Tidak ada proses blast aktif.");
    }
});
