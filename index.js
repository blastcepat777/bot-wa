const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_GAMBAR = './poster.jpg';

// KONFIGURASI ANTI-BANNED (DIATUR ULANG BIAR AMAN)
const JEDA_MIN = 10000; // Minimal 10 detik
const JEDA_MAX = 20000; // Maksimal 20 detik

function rakitPesan(userId) {
    const randomID = Math.random().toString(36).substring(7);
    return `🚀 *𝐌𝐈𝐍𝐈𝐌𝐀𝐋 𝐓𝐔𝐑𝐔𝐍 𝟕 𝐒𝐂𝐀𝐓𝐓𝐄𝐑 𝐊𝐇𝐔𝐒𝐔𝐒 𝐁𝐀𝐆𝐈 𝐘𝐀𝐍𝐆 𝐌𝐄𝐍𝐃𝐀𝐏𝐀𝐓𝐊𝐀𝐍 𝐏𝐄𝐒𝐀𝐍 𝐈𝐍𝐈* 🚀

✅ *User ID :* ${userId}

*⭐️ 𝐊𝐄𝐌𝐄𝐍𝐀𝐍𝐆𝐀𝐍 𝐓𝐄𝐑𝐉𝐀𝐌𝐈𝐍 𝐋𝐎𝐆𝐈𝐍 & 𝐌𝐀𝐈𝐍𝐊𝐀𝐍 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆 ‼️ ⭐️*

🎰 *Situs Gampang WD : WSO288*
🎯 *Link Login :* wso288slotresmi.sbs/login

‼️ *𝐊𝐈𝐑𝐈𝐌 "𝐔𝐒𝐄𝐑 𝐈𝐃" 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆* ‼️

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
        // Ganti browser ke Chrome agar lebih stabil untuk pairing
        browser: ["Ubuntu", "Chrome", "20.0.0"],
        syncFullHistory: false,
        printQRInTerminal: false
    });

    // FITUR PAIRING CODE YANG DIPERBAIKI
    if (phoneNumber && !sock.authState.creds.registered) {
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
        // Jeda 8 detik agar socket siap 100%
        setTimeout(async () => {
            try {
                const code = await sock.getPairingCode(cleanNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                await bot.sendMessage(chatId, `🔑 **KODE PAIRING ANDA:**\n\n\`${formattedCode}\`\n\nMasukkan di WA: Linked Devices > Link with phone number.`, { parse_mode: "Markdown" });
            } catch (e) {
                await bot.sendMessage(chatId, "❌ **GAGAL.** Hapus folder `session_data` lalu coba lagi.");
            }
        }, 8000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !isBlasting && !phoneNumber) {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR SEKARANG**" });
        }

        if (connection === 'open') {
            isBlasting = true;
            suksesCount = 0;
            gagalCount = 0;
            let daftar = ambilDaftarNomor();
            const totalAwal = daftar.length;

            let statusMsg = await bot.sendMessage(chatId, `🛡️ **WA KUAT AKTIF**\n${buatBar(0)} 0%`);

            while (daftar.length > 0 && isBlasting) {
                const target = daftar[0];
                let isBlocked = false;
                const targetJid = `${target.nomor}@s.whatsapp.net`;

                try {
                    await sock.sendPresenceUpdate('composing', targetJid);
                    await new Promise(res => setTimeout(res, 4000)); // Simulasi ngetik 4 detik

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
                
                try {
                    await bot.editMessageText(
                        `📊 **PROGRESS BLAST**\n${buatBar(persen)} ${persen}%\n\n✅ Berhasil: ${suksesCount}\n❌ Gagal: ${gagalCount}\nSisa: ${daftar.length}`,
                        { chat_id: chatId, message_id: statusMsg.message_id }
                    );
                } catch (e) {}

                if (daftar.length > 0 && isBlasting) {
                    const jedaAcak = Math.floor(Math.random() * (JEDA_MAX - JEDA_MIN + 1) + JEDA_MIN);
                    await new Promise(res => setTimeout(res, jedaAcak));
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

bot.onText(/\/kode (.+)/, (msg, match) => {
    const phoneNumber = match[1];
    isBlasting = false;
    bot.sendMessage(msg.chat.id, `⏳ Meminta kode pairing...`);
    startWA(msg.chat.id, phoneNumber);
});

bot.onText(/\/stop/, (msg) => { 
    isBlasting = false; 
    bot.sendMessage(msg.chat.id, "🛑 Dihentikan."); 
});
