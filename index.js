const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const crypto = require('crypto'); // Untuk generate kode unik

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_GAMBAR = './poster.jpg'; 

// Fungsi untuk membuat jeda acak (Misal 5 sampai 10 detik)
const randomDelay = () => Math.floor(Math.random() * (10000 - 5000 + 1) + 5000);

function rakitPesan(userId) {
    const linkDaftar = `https://wso288slotresmi.sbs/login`;
    const unikID = crypto.randomBytes(3).toString('hex').toUpperCase(); // Kode unik agar pesan beda-beda

    return `🚀 *𝐌𝐈𝐍𝐈𝐌𝐀𝐋 𝐓𝐔𝐑𝐔𝐍 𝟕 𝐒𝐂𝐀𝐓𝐓𝐄𝐑 𝐊𝐇𝐔𝐒𝐔𝐒 𝐁𝐀𝐆𝐈 𝐘𝐀𝐍𝐆 𝐌𝐄𝐍𝐃𝐀𝐏𝐀𝐓𝐊𝐀𝐍 𝐏𝐄𝐒𝐀𝐍 𝐈𝐍𝐈* 🚀

✅ *User ID :* ${userId}
🆔 *Ref Code:* ${unikID}

*⭐️ 𝐊𝐄𝐌𝐄𝐍𝐀𝐍𝐆𝐀𝐍 𝐓𝐄𝐑𝐉𝐀𝐌𝐈𝐍 𝐋𝐎𝐆𝐈𝐍 & 𝐌𝐀𝐈𝐍𝐊𝐀𝐍 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆 ‼️ ⭐️*

💎 *Estimasi Kemenangan :*
• Depo 25RB → 500RB + 25RB 💰
• Depo 50RB → 700RB + 50RB 💵
• Depo 150RB → 1,1JT + 150RB 🏆
• Depo 200RB → 2JT + 200RB 🚀

🎰 *Situs Gampang WD : WSO288*
🔗 ${linkDaftar}

‼️ *𝐊𝐈𝐑𝐈𝐌 "𝐔𝐒𝐄𝐑 𝐈𝐃" 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆 𝐀𝐆𝐀𝐑 𝐈𝐃 𝐀𝐍𝐃𝐀 𝐎𝐓𝐎𝐌𝐀𝐓𝐈𝐒 𝐓𝐔𝐑𝐔𝐍* 🎰

💬 *WA 𝑯𝒂𝒏𝒏𝒚 𝒍𝒂𝒘𝒓𝒂𝒏𝒄𝒆* : https://dangsineul.top/wa-hanny-lawrance`;
}

// ... (Fungsi ambilDaftarNomor dan updateFileNomor tetap sama) ...

async function startWA(chatId) {
    if (isBlasting) return;
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Windows", "Chrome", "11.0.0"],
        // Menambahkan simulasi aktivitas manusia
        markOnlineOnConnect: true 
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr && !isBlasting) {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR SEKARANG**" });
        }

        if (connection === 'open') {
            isBlasting = true;
            suksesCount = 0;
            gagalCount = 0;
            let daftar = ambilDaftarNomor();

            bot.sendMessage(chatId, `🎉 **Terhubung!**\n🚀 Mengirim dengan **Jeda Aman (5-10s)** ke **${daftar.length}** nomor.`);

            while (daftar.length > 0 && isBlasting) {
                const target = daftar[0];
                const jid = `${target.nomor}@s.whatsapp.net`;
                
                try {
                    // Simulasi "Sedang Mengetik" agar terlihat seperti manusia
                    await sock.sendPresenceUpdate('composing', jid);
                    await new Promise(res => setTimeout(res, 2000));
                    
                    await sock.sendMessage(jid, { 
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
                    bot.sendMessage(chatId, `📊 **REKAP**\n✅ BERHASIL : ${suksesCount}\n❌ GAGAL : ${gagalCount}`);
                }

                if (daftar.length > 0 && isBlasting) {
                    const jedaNext = randomDelay();
                    await new Promise(res => setTimeout(res, jedaNext));
                }
            }
            // ... (Sisa logika penutup blast) ...
        }
    });
    sock.ev.on('creds.update', saveCreds);
}
