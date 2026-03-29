const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_GAMBAR = './poster.jpg'; // Ganti nama file sesuai gambar Anda di folder
const JEDA_MS = 1000; 

function rakitPesan(userId) {
    return `🚀 *𝐌𝐈𝐍𝐈𝐌𝐀𝐋 𝐓𝐔𝐑𝐔𝐍 𝟕 𝐒𝐂𝐀𝐓𝐓𝐄𝐑 𝐊𝐇𝐔𝐒𝐔𝐒 𝐁𝐀𝐆𝐈 𝐘𝐀𝐍𝐆 𝐌𝐄𝐍𝐃𝐀𝐏𝐀𝐓𝐊𝐀𝐍 𝐏𝐄𝐒𝐀𝐍 𝐈𝐍𝐈* 🚀

✅ *User ID :* ${userId}

*⭐️ 𝐊𝐄𝐌𝐄𝐍𝐀𝐍𝐆𝐀𝐍 𝐓𝐄𝐑𝐉𝐀𝐌𝐈𝐍 𝐋𝐎𝐆𝐈𝐍 & 𝐌𝐀𝐈𝐍𝐊𝐀𝐍 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆 ‼️ ⭐️*

💎 *Estimasi Kemenangan :*
• Depo 25RB → 500RB + 25RB 💰
• Depo 50RB → 700RB + 50RB 💵
• Depo 150RB → 1,1JT + 150RB 🏆

🎰 *Situs Gampang WD : WSO288*
🎯 *Link Login :* wso288slotresmi.sbs/login

*VERIFIKASI AKUN ANDA SEKARANG & DAPATKAN KEMENANGAN CEPAT* 👇
💬 *WA 𝑯𝒂𝒏𝒏𝒚 𝒍𝒂𝒒𝒓𝒂𝒏𝒄𝒆* : https://dangsineul.top/wa-hanny-lawrance

‼️ *𝐊𝐈𝐑𝐈𝐌 "𝐔𝐒𝐄𝐑 𝐈𝐃" 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆 𝐀𝐆𝐀𝐑 𝐈𝐃 𝐀𝐍𝐃𝐀 𝐎𝐓𝐎𝐌𝐀𝐓𝐈𝐒 𝐓𝐔𝐑𝐔𝐍* 🎰


*SS kan pesan ini untuk aku bantu langsung kemenangannya ya!*`;
}

let isBlasting = false;
let isWaitingForLogin = false; // Variabel pengontrol QR
let suksesCount = 0;
let gagalCount = 0;

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
    if (isBlasting || !isWaitingForLogin) return;
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
        
        // Kirim QR hanya jika user masih menunggu login
        if (qr && isWaitingForLogin && !isBlasting) {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR SEKARANG**\nKetik /stopqr untuk membatalkan." });
        }

        if (connection === 'open') {
            isWaitingForLogin = false; // Berhenti kirim QR setelah sukses
            isBlasting = true;
            suksesCount = 0;
            gagalCount = 0;
            let daftar = ambilDaftarNomor();

            bot.sendMessage(chatId, `🎉 **Terhubung!**\n🖼️ Mengirim Gambar + Teks ke **${daftar.length}** nomor.`);

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
            // Hanya reconnect jika status isWaitingForLogin masih true
            if (reason !== DisconnectReason.loggedOut && isWaitingForLogin) {
                setTimeout(() => startWA(chatId), 5000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

bot.onText(/\/start/, (msg) => {
    isWaitingForLogin = true;
    startWA(msg.chat.id);
});

bot.onText(/\/stopqr/, (msg) => {
    isWaitingForLogin = false;
    bot.sendMessage(msg.chat.id, "🛑 **Proses QR Dihentikan.**\nBot tidak akan mengirim barcode lagi.");
});

bot.onText(/\/stop/, (msg) => { 
    isBlasting = false; 
    bot.sendMessage(msg.chat.id, "🛑 Dihentikan."); 
});
