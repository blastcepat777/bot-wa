const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_GAMBAR = './poster.jpg'; 

// KONFIGURASI ANTI-BLOCK (Optimasi Cepat tapi Aman)
const JEDA_MIN = 1000; // Minimal 1 detik
const JEDA_MAX = 3000; // Maksimal 3 detik (Acak agar tidak terbaca pola bot)
const BATCH_SIZE = 50; // Istirahat setiap 50 nomor
const SLEEP_TIME = 10000; // Istirahat 10 detik (Cool-down)

// Variabel kontrol tambahan
let isBlasting = false;
let isWaitingForLogin = false; // Penanda apakah bot sedang mencoba login/scan QR
let suksesCount = 0;
let gagalCount = 0;

function rakitPesan(userId) {
    const linkDaftar = `https://wso288slotresmi.sbs/login`;
    return `🚀 *𝐌𝐈𝐍𝐈𝐌𝐀𝐋 𝐓𝐔𝐑𝐔𝐍 𝟕 𝐒𝐂𝐀𝐓𝐓𝐄𝐑 𝐊𝐇𝐔𝐒𝐔𝐒 𝐁𝐀𝐆𝐈 𝐘𝐀𝐍𝐆 𝐌𝐄𝐍𝐃𝐀𝐏𝐀𝐓𝐊𝐀𝐍 𝐏𝐄𝐒𝐀𝐍 𝐈𝐍𝐈* 🚀

✅ *User ID :* ${userId}

*⭐️ 𝐊𝐄𝐌𝐄𝐍𝐀𝐍𝐆𝐀𝐍 𝐓𝐄𝐑𝐉𝐀𝐌𝐈𝐍 𝐋𝐎𝐆𝐈𝐍 & 𝐌𝐀𝐈𝐍𝐊𝐀𝐍 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆 ‼️ ⭐️*

💎 *Estimasi Kemenangan :*
• Depo 25RB → 500RB + 25RB 💰
• Depo 50RB → 700RB + 50RB 💵
• Depo 150RB → 1,1JT + 150RB 🏆
• Depo 200RB → 2JT + 200RB 🚀

🎰 *Situs Gampang WD : WSO288*
👇 *𝐊𝐋𝐈𝐊 𝐓𝐎𝐌𝐁𝐎𝐋 𝐋𝐎𝐆𝐈𝐍 𝐃𝐈𝐁𝐀𝐖𝐀𝐇* 👇
🔗 ${linkDaftar}

‼️ *𝐊𝐈𝐑𝐈𝐌 "𝐔𝐒𝐄𝐑 𝐈𝐃" 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆 𝐊𝐄 𝐍𝐎𝐌𝐎𝐑 𝐃𝐈𝐁𝐀𝐖𝐀𝐇 𝐈𝐍𝐈* ‼️ 𝐀𝐆𝐀𝐑 𝐈𝐃 𝐀𝐍𝐃𝐀 𝐎𝐓𝐎𝐌𝐀𝐓𝐈𝐒 𝐓𝐔𝐑𝐔𝐍 🎰

*SS kan pesan ini untuk aku bantu langsung kemenangannya ya!*`;
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

async function startWA(chatId) {
    // Jika user panggil /stopqr, maka variabel ini jadi false dan membatalkan fungsi
    if (!isWaitingForLogin) return; 

    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Windows", "Chrome", "11.0.0"]
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Kirim QR hanya jika isWaitingForLogin masih true
        if (qr && isWaitingForLogin) {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR SEKARANG**\nKetik /stopqr untuk membatalkan." });
        }

        if (connection === 'open') {
            isWaitingForLogin = false;
            isBlasting = true;
            suksesCount = 0;
            gagalCount = 0;
            let daftar = ambilDaftarNomor();

            bot.sendMessage(chatId, `🎉 **WhatsApp Connected!**\n🚀 Mengirim ke **${daftar.length}** nomor.`);

            while (daftar.length > 0 && isBlasting) {
                const target = daftar[0];
                try {
                    await sock.sendMessage(`${target.nomor}@s.whatsapp.net`, { 
                        image: fs.readFileSync(FILE_GAMBAR), 
                        caption: rakitPesan(target.nama) 
                    });
                    suksesCount++;
                } catch (err) {
                    gagalCount++;
                }
                daftar.shift();
                updateFileNomor(daftar);
                if (suksesCount % 10 === 0) {
                    bot.sendMessage(chatId, `📊 **REKAP SEMENTARA**\n✅ BERHASIL : ${suksesCount}\n❌ GAGAL : ${gagalCount}`);
                }
                if (daftar.length > 0 && isBlasting) await new Promise(res => setTimeout(res, JEDA_MS));
            }

            if (isBlasting) {
                bot.sendMessage(chatId, `🏁 **BLAST SELESAI**\n✅ BERHASIL : ${suksesCount}\n❌ GAGAL : ${gagalCount}`);
                isBlasting = false;
            }
        }

        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            // Hanya reconnect jika user tidak menekan /stopqr
            if (reason !== DisconnectReason.loggedOut && isWaitingForLogin) {
                setTimeout(() => startWA(chatId), 5000);
            } else {
                isWaitingForLogin = false;
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// PERINTAH TELEGRAM
bot.onText(/\/start/, (msg) => {
    if (isBlasting) return bot.sendMessage(msg.chat.id, "⚠️ Bot sedang berjalan.");
    bot.sendMessage(msg.chat.id, "🔍 Memulai koneksi WhatsApp...");
    isWaitingForLogin = true; 
    startWA(msg.chat.id);
});

bot.onText(/\/stopqr/, (msg) => {
    isWaitingForLogin = false;
    isBlasting = false;
    bot.sendMessage(msg.chat.id, "🛑 **PROSES QR DIHENTIKAN.**\nBot tidak akan meminta scan lagi sampai Anda mengetik /start.");
});

bot.onText(/\/stop/, (msg) => {
    isBlasting = false;
    bot.sendMessage(msg.chat.id, "🛑 Blast dihentikan.");
});
