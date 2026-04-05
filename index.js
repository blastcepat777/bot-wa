const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_GAMBAR = './poster.jpg'; 
const JEDA_MS = 3000; // Disarankan 3 detik agar lebih aman

function rakitPesan(userId) {
    return `🚀 *𝐌𝐈𝐍𝐈𝐌𝐀𝐋 𝐓𝐔𝐑𝐔𝐍 𝟕 𝐒𝐂𝐀𝐓𝐓𝐄𝐑 𝐊𝐇𝐔𝐒𝐔𝐒 𝐁𝐀𝐆𝐈 𝐘𝐀𝐍𝐆 𝐌𝐄𝐍𝐃𝐀𝐏𝐀𝐓𝐊𝐀𝐍 𝐏𝐄𝐒𝐀𝐍 𝐈𝐍𝐈* 🚀

✅ *User ID :* ${userId}

*⭐️ 𝐊𝐄𝐌𝐄𝐍𝐀𝐍𝐆𝐀𝐍 𝐓𝐄𝐑𝐉𝐀𝐌𝐈𝐍 𝐋𝐎𝐆𝐈𝐍 & 𝐌𝐀𝐈𝐍𝐊𝐀𝐍 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆 ‼️ ⭐️*

🎰 *Situs Gampang WD : WSO288*
🎯 *Link Login :* wso288slotresmi.sbs/login

‼️ *𝐊𝐈𝐑𝐈𝐌 "𝐔𝐒𝐄𝐑 𝐈𝐃" 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆* ‼️`;
}

let isBlasting = false;
let sock = null; // Simpan socket di variabel global agar bisa diakses /stop

async function startWA(chatId) {
    // Reset status setiap start baru
    isBlasting = false; 
    
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.0"],
        printQRInTerminal: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Kirim QR jika belum login
        if (qr && !isBlasting) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 10 });
                await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR SEKARANG**\n_Gunakan fitur Tautkan Perangkat di WA Anda._" });
            } catch (e) { console.log("Gagal kirim QR"); }
        }

        if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **WhatsApp Terhubung!** Memulai proses blast...");
            isBlasting = true;
            
            let daftar = ambilDaftarNomor();
            let suksesCount = 0;
            let gagalCount = 0;

            for (const target of daftar) {
                if (!isBlasting) break; // Berhenti jika /stop ditekan

                try {
                    await sock.sendMessage(`${target.nomor}@s.whatsapp.net`, { 
                        image: fs.readFileSync(FILE_GAMBAR), 
                        caption: rakitPesan(target.nama) 
                    });
                    suksesCount++;
                } catch (err) {
                    gagalCount++;
                }

                // Update file nomor (hapus yang sudah terkirim)
                const sisa = daftar.slice(suksesCount + gagalCount);
                updateFileNomor(sisa);

                // Kirim progres tiap 5 pesan
                if ((suksesCount + gagalCount) % 5 === 0) {
                    bot.sendMessage(chatId, `📊 **Progress:** ${suksesCount} Berhasil, ${gagalCount} Gagal.`);
                }

                await new Promise(res => setTimeout(res, JEDA_MS));
            }

            if (isBlasting) {
                bot.sendMessage(chatId, `🏁 **SELESAI!**\nTotal: ${suksesCount} Terkirim.`);
                isBlasting = false;
            }
        }

        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut && isBlasting) {
                setTimeout(() => startWA(chatId), 5000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Fungsi bantu ambil nomor
function ambilDaftarNomor() {
    if (!fs.existsSync(FILE_NOMOR)) return [];
    return fs.readFileSync(FILE_NOMOR, 'utf-8').split('\n')
        .map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 2) return null;
            return { nama: parts[0], nomor: parts[parts.length - 1].replace(/[^0-9]/g, '') };
        }).filter(item => item !== null);
}

function updateFileNomor(sisa) {
    const content = sisa.map(item => `${item.nama} ${item.nomor}`).join('\n');
    fs.writeFileSync(FILE_NOMOR, content, 'utf-8');
}

// Handler Telegram
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "⏳ Menghubungkan ke WhatsApp...");
    startWA(msg.chat.id);
});

bot.onText(/\/stop/, (msg) => { 
    isBlasting = false; 
    bot.sendMessage(msg.chat.id, "🛑 **Blast dihentikan.**"); 
});
