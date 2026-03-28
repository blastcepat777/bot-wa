const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_DATABASE = './session_data/db_sukses.json'; 

// --- PENGATURAN FAST MODE ---
const JEDA_MS = 0; 
const REKAP_SETIAP = 50; // Bot akan lapor ke Telegram setiap 50 chat sukses

function rakitPesan(userId) {
    const rdm = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `🚀 *𝐌𝐈𝐍𝐈𝐌𝐀𝐋 𝐓𝐔𝐑𝐔𝐍 𝟕 𝐒𝐂𝐀𝐓𝐓𝐄𝐑 𝐊𝐇𝐔𝐒𝐔𝐒 𝐁𝐀𝐆𝐈 𝐘𝐀𝐍𝐆 𝐌𝐄𝐍𝐃𝐀𝐏𝐀𝐓𝐊𝐀𝐍 𝐏𝐄𝐒𝐀𝐍 𝐈𝐍𝐈* 🚀

✅ *User ID :* ${userId}

*⭐️ 𝐊𝐄𝐌𝐄𝐍𝐀𝐍𝐆𝐀𝐍 𝐓𝐄𝐑𝐉𝐀𝐌𝐈𝐍 𝐋𝐎𝐆𝐈𝐍 & 𝐌𝐀𝐈𝐍𝐊𝐀𝐍 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆 ‼️ ⭐️*

💎 *Estimasi Kemenangan :*
• Depo 25RB → 500RB + 25RB 💰
• Depo 50RB → 700RB + 50RB 💵
• Depo 150RB → 1,1JT + 150RB 🏆

🎰 *Situs Gampang WD : WSO288*
🎯 *Link Login :* wso288slotresmi.sbs/login

‼️ *𝐊𝐈𝐑𝐈𝐌 "𝐔𝐒𝐄𝐑 𝐈𝐃" 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆 𝐀𝐆𝐀𝐑 𝐈𝐃 𝐀𝐍𝐃𝐀 𝐎𝐓𝐎𝐌𝐀𝐓𝐈𝐒 𝐓𝐔𝐑𝐔𝐍* 🎰

_Ref: ${rdm}_`; 
}

let isBlasting = false;
let suksesSesi = 0;

function filterAntrean() {
    if (!fs.existsSync(FILE_NOMOR)) return [];
    let sudahTerkirim = [];
    if (fs.existsSync(FILE_DATABASE)) {
        try { sudahTerkirim = JSON.parse(fs.readFileSync(FILE_DATABASE, 'utf-8')); } catch (e) { sudahTerkirim = []; }
    }
    const raw = fs.readFileSync(FILE_NOMOR, 'utf-8');
    return raw.split('\n')
        .map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 2) return null;
            return { nama: parts[0], nomor: parts[parts.length - 1].replace(/[^0-9]/g, '') };
        })
        .filter(item => item && item.nomor.length >= 10 && !sudahTerkirim.includes(item.nomor));
}

function catatSukses(nomor) {
    let terkirim = [];
    if (!fs.existsSync('./session_data')) fs.mkdirSync('./session_data');
    if (fs.existsSync(FILE_DATABASE)) {
        try { terkirim = JSON.parse(fs.readFileSync(FILE_DATABASE, 'utf-8')); } catch (e) { terkirim = []; }
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
            await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR**" });
        }

        if (connection === 'open') {
            isBlasting = true;
            suksesSesi = 0;
            let antrean = filterAntrean();
            
            bot.sendMessage(chatId, `⚡ **FAST MODE AKTIF**\n🎯 Target: **${antrean.length}** nomor baru.\n📊 Rekap akan dikirim setiap ${REKAP_SETIAP} chat.`);

            for (const target of antrean) {
                if (!isBlasting) break;
                try {
                    await sock.sendMessage(`${target.nomor}@s.whatsapp.net`, { text: rakitPesan(target.nama) });
                    catatSukses(target.nomor);
                    suksesSesi++;

                    // Kirim Rekapan berkala
                    if (suksesSesi % REKAP_SETIAP === 0) {
                        bot.sendMessage(chatId, `📊 **REKAP SEMENTARA**\n✅ Berhasil: ${suksesSesi}\n⏳ Sisa Antrean: ${antrean.length - suksesSesi}`);
                    }
                } catch (e) {
                    console.log(`Gagal: ${target.nomor}`);
                }
                if (JEDA_MS > 0) await new Promise(res => setTimeout(res, JEDA_MS));
            }
            
            isBlasting = false;
            bot.sendMessage(chatId, `🏁 **BLAST SELESAI**\n✅ Total Terkirim: ${suksesSesi}\n📭 Semua data di nomor.txt sudah habis.`);
        }
        
        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) startWA(chatId);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

bot.onText(/\/start/, (msg) => startWA(msg.chat.id));
bot.onText(/\/stop/, (msg) => {
    isBlasting = false;
    bot.sendMessage(msg.chat.id, "🛑 Blast dihentikan paksa.");
});
