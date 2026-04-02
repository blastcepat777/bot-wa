const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_GAMBAR = './poster.jpg';

// --- PERUBAHAN DI SINI ---
// KONFIGURASI JEDA dibuat kaku 1 detik (1000 ms)
const JEDA_MIN = 1000; 
const JEDA_MAX = 1000;
// --------------------------

function rakitPesan(userId) {
    const randomID = Math.random().toString(36).substring(7);
    return `🚀 *𝐌𝐈𝐍𝐈𝐌𝐀𝐋 𝐓𝐔𝐑𝐔𝐍 𝟕 𝐒𝐂𝐀𝐓𝐓𝐄𝐑 𝐊𝐇𝐔𝐒𝐔𝐒 𝐁𝐀𝐆𝐈 𝐘𝐀𝐍𝐆 𝐌𝐄𝐍𝐃𝐀𝐏𝐀𝐓𝐊𝐀𝐍 𝐏𝐄𝐒𝐀𝐍 𝐈𝐍𝐈* 🚀

✅ *User ID :* ${userId}

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

_Ref: ${randomID}_`;
}

function buatBar(p) {
    const filled = Math.round(p / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
}

let isBlasting = false;
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

async function startWA(chatId, phoneNumber = null) {
    if (isBlasting) return;
    
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["iOS", "Safari", "17.0"],
        syncFullHistory: false,
        printQRInTerminal: false
    });

    if (phoneNumber && !sock.authState.creds.registered) {
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
        setTimeout(async () => {
            try {
                const code = await sock.getPairingCode(cleanNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                await bot.sendMessage(chatId, `🔑 **KODE PAIRING ANDA:**\n\n\`${formattedCode}\`\n\nMasukkan di WhatsApp: Link Device > Link with phone number.`, { parse_mode: "Markdown" });
            } catch (e) {
                console.log(e);
                await bot.sendMessage(chatId, "❌ **Gagal mengambil kode.**\n\n1. Hapus folder `session_data`.\n2. Tunggu 5 menit.\n3. Coba lagi tanpa tanda '+'.");
            }
        }, 5000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !isBlasting && !phoneNumber) {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR SEKARANG**\n_Atau gunakan /kode nomor_wa_" });
        }

        if (connection === 'open') {
            isBlasting = true;
            suksesCount = 0;
            gagalCount = 0;
            let daftar = ambilDaftarNomor();
            const totalAwal = daftar.length;

            let statusMsg = await bot.sendMessage(chatId, `🛡️ **WA AKTIF (Jeda 1 Detik)**\n${buatBar(0)} 0%`);

            while (daftar.length > 0 && isBlasting) {
                const target = daftar[0];
                let isBlocked = false;
                const targetJid = `${target.nomor}@s.whatsapp.net`;

                try {
                    // --- PERUBAHAN DI SINI ---
                    // Menghapus simulasi 'composing' 3 detik agar instan
                    // await sock.sendPresenceUpdate('composing', targetJid);
                    // await new Promise(res => setTimeout(res, 3000));

                    await sock.sendMessage(targetJid, { 
                        image: fs.readFileSync(FILE_GAMBAR), 
                        caption: rakitPesan(target.nama) 
                    });
                    suksesCount++;
                } catch (err) {
                    gagalCount++;
                    isBlocked = true;
                }

                daftar.shift();
                updateFileNomor(daftar);

                const persen = Math.round(((totalAwal - daftar.length) / totalAwal) * 100);
                const teksStatus = isBlocked ? `(Eror/Blocked)` : `(Berjalan)`;

                try {
                    await bot.editMessageText(
                        `📊 **PROGRESS BLAST**\n${buatBar(persen)} ${persen}% ${teksStatus}\n\n✅ Berhasil: ${suksesCount}\n❌ Gagal: ${gagalCount}\nSisa: ${daftar.length}`,
                        { chat_id: chatId, message_id: statusMsg.message_id }
                    );
                } catch (e) {}

                if (daftar.length > 0 && isBlasting) {
                    // Jeda tepat 1 detik sebelum lanjut ke nomor berikutnya
                    await new Promise(res => setTimeout(res, JEDA_MIN));
                }
            }

            if (isBlasting) {
                bot.sendMessage(chatId, `🏁 **SELESAI**\nTotal Berhasil: ${suksesCount}`);
                isBlasting = false;
            }
        }

        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                setTimeout(() => startWA(chatId), 5000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

bot.onText(/\/start/, (msg) => { 
    isBlasting = false; 
    startWA(msg.chat.id); 
});

bot.onText(/\/kode (.+)/, (msg, match
