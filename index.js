const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_DATABASE = './session_data/db_sukses.json'; 
const JEDA_DETIK = 15; 

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
💬 *WA 𝑯𝒂𝒏𝒏𝒚 𝒍𝒂𝒒𝒓𝒂𝒏𝒄𝒆* : https://dangsineul.top/wa-hanny-lawrance

*SS kan pesan ini untuk aku bantu langsung kemenangannya ya!*`;

let isBlasting = false;
let suksesCount = 0;
let gagalCount = 0;

function filterAntrean() {
    if (!fs.existsSync(FILE_NOMOR)) return [];
    
    let sudahTerkirim = [];
    if (fs.existsSync(FILE_DATABASE)) {
        try {
            sudahTerkirim = JSON.parse(fs.readFileSync(FILE_DATABASE, 'utf-8'));
        } catch (e) { sudahTerkirim = []; }
    }

    const raw = fs.readFileSync(FILE_NOMOR, 'utf-8');
    return raw.split('\n')
        .map(n => n.replace(/[^0-9]/g, '').trim())
        .filter(n => n.length >= 10 && !sudahTerkirim.includes(n));
}

function catatSukses(nomor) {
    let terkirim = [];
    if (!fs.existsSync('./session_data')) fs.mkdirSync('./session_data');
    if (fs.existsSync(FILE_DATABASE)) {
        try {
            terkirim = JSON.parse(fs.readFileSync(FILE_DATABASE, 'utf-8'));
        } catch (e) { terkirim = []; }
    }
    if (!terkirim.includes(nomor)) {
        terkirim.push(nomor);
        fs.writeFileSync(FILE_DATABASE, JSON.stringify(terkirim), 'utf-8');
    }
}

async function startWA(chatId) {
    if (isBlasting) return;

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
            await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN ULANG SEKARANG**" });
        }

        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                startWA(chatId);
            } else {
                isBlasting = false;
                bot.sendMessage(chatId, "⚠️ Sesi terputus. Silakan hubungkan kembali.");
            }
        } 
        
        else if (connection === 'open') {
            if (isBlasting) return;
            isBlasting = true;
            suksesCount = 0;
            
            let antrean = filterAntrean();
            if (antrean.length === 0) {
                isBlasting = false;
                return bot.sendMessage(chatId, "✅ Semua nomor sudah terkirim.");
            }

            bot.sendMessage(chatId, `🚀 Memulai Blast ke **${antrean.length}** nomor baru...`);

            for (const nomor of antrean) {
                if (!isBlasting) break;
                try {
                    await sock.sendMessage(`${nomor}@s.whatsapp.net`, { text: PESAN_BLAST });
                    suksesCount++;
                    catatSukses(nomor);
                } catch (err) {
                    gagalCount++;
                }
                await new Promise(res => setTimeout(res, JEDA_DETIK * 1000));
            }
            isBlasting = false;
            bot.sendMessage(chatId, `🏁 Selesai! Berhasil: ${suksesCount}`);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🔍 Sedang menyambungkan...");
    startWA(msg.chat.id);
});
