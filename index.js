const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';

// KONFIGURASI JEDA
const JEDA_MIN = 7000; 
const JEDA_MAX = 15000;

function rakitPesan(userId) {
    const randomID = Math.random().toString(36).substring(7);
    return `🚀 *𝐌𝐈𝐍𝐈𝐌𝐀𝐋 𝐓𝐔𝐑𝐔𝐍 𝟕 𝐒𝐂𝐀𝐓𝐓𝐄𝐑 𝐊𝐇𝐔𝐒𝐔𝐒 𝐁𝐀𝐆𝐈 𝐘𝐀𝐍𝐆 𝐌𝐄𝐍𝐃𝐀𝐏𝐀𝐓𝐊𝐀𝐍 𝐏𝐄𝐒𝐀𝐍 𝐈𝐍𝐈* 🚀\n\n✅ *User ID :* ${userId}\n\n*⭐️ 𝐊𝐄𝐌𝐄𝐍𝐀𝐍𝐆𝐀𝐍 𝐓𝐄𝐑𝐉𝐀𝐌𝐈𝐍 𝐋𝐎𝐆𝐈𝐍 & 𝐌𝐀𝐈𝐍𝐊𝐀𝐍 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆 ‼️ ⭐️*\n\n🎰 *Situs Gampang WD : WSO288*\n🎯 *Link Login :* wso288slotresmi.sbs/login\n\n_Ref: ${randomID}_`;
}

function buatBar(p) {
    const filled = Math.round(p / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
}

let isBlasting = false;

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

async function startWA(chatId, phoneNumber = null) {
    if (isBlasting) return;

    // JIKA MINTA KODE, KITA BUAT FOLDER SESI BARU (Sesi_Pairing) BIAR GAK BENTROK
    const folderSesi = phoneNumber ? 'sesi_pairing' : 'session_data';
    const { state, saveCreds } = await useMultiFileAuthState(folderSesi);
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "114.0.5735.199"], // Chrome Desktop lebih stabil
        syncFullHistory: false
    });

    if (phoneNumber && !sock.authState.creds.registered) {
        // Tunggu 7 detik agar koneksi benar-benar siap
        setTimeout(async () => {
            try {
                let code = await sock.getPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                await bot.sendMessage(chatId, `🔑 **KODE PAIRING:**\n\n\`${code}\`\n\nMasukkan di WA: Perangkat Tertaut > Tautkan Perangkat > Tautkan dengan nomor telepon saja.`, { parse_mode: "Markdown" });
            } catch (e) {
                console.log(e);
                bot.sendMessage(chatId, "❌ Gagal. Tunggu 5 menit lalu coba lagi.");
            }
        }, 7000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !isBlasting && !phoneNumber) {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR ATAU /kode nomor**" });
        }

        if (connection === 'open') {
            isBlasting = true;
            let suksesCount = 0;
            let daftar = ambilDaftarNomor();
            const totalAwal = daftar.length;

            let statusMsg = await bot.sendMessage(chatId, `🛡️ **WA AKTIF**\n${buatBar(0)} 0%`);

            while (daftar.length > 0 && isBlasting) {
                const target = daftar[0];
                const targetJid = `${target.nomor}@s.whatsapp.net`;

                try {
                    await sock.sendMessage(targetJid, { text: rakitPesan(target.nama) });
                    suksesCount++;
                } catch (err) { }

                daftar.shift();
                const persen = Math.round(((totalAwal - daftar.length) / totalAwal) * 100);

                try {
                    await bot.editMessageText(`📊 **PROGRESS**\n${buatBar(persen)} ${persen}%\n✅ Berhasil: ${suksesCount}`, { chat_id: chatId, message_id: statusMsg.message_id });
                } catch (e) {}

                if (daftar.length > 0) {
                    await new Promise(res => setTimeout(res, Math.floor(Math.random() * (JEDA_MAX - JEDA_MIN + 1) + JEDA_MIN)));
                }
            }
            isBlasting = false;
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

bot.onText(/\/start/, (msg) => { isBlasting = false; startWA(msg.chat.id); });
bot.onText(/\/kode (.+)/, (msg, match) => { startWA(msg.chat.id, match[1]); });
bot.onText(/\/stop/, (msg) => { isBlasting = false; bot.sendMessage(msg.chat.id, "🛑 Stop."); });
