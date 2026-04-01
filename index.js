const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const token = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(token, {polling: true});

const FILE_NOMOR = 'nomor.txt';
const FILE_GAMBAR = './poster.jpg';
const JEDA_MS = 1000; // Jeda 1 detik agar lebih aman dari ban

function rakitPesan(userId) {
return `🚀 *𝐌𝐈𝐍𝐈𝐌𝐀𝐋 𝐓𝐔𝐑𝐔𝐍 𝟕 𝐒𝐂𝐀𝐓𝐓𝐄𝐑 𝐊𝐇𝐔𝐒𝐔𝐒 𝐁𝐀𝐆𝐈 𝐘𝐀𝐍𝐆 𝐌𝐄𝐍𝐃𝐀𝐏𝐀𝐓𝐊𝐀𝐍 𝐏𝐄𝐒𝐀𝐍 𝐈𝐍𝐈* 🚀

✅ *User ID :* ${userId}

*⭐️ 𝐊𝐄𝐌𝐄𝐍𝐀𝐍𝐆𝐀𝐍 𝐓𝐄𝐑𝐉𝐀𝐌𝐈𝐍 𝐋𝐎𝐆𝐈𝐍 & 𝐌𝐀𝐈𝐍𝐊𝐀𝐍 𝐒𝐄𝐊𝐀𝐑𝐀𝐍𝐆 ‼️ ⭐️*

🎰 *Situs Gampang WD : WSO288*`;
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

async function startWA(chatId) {
isBlasting = false;
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
await bot.sendPhoto(chatId, buffer, { caption: "📸 **SCAN QR SEKARANG**" });
}

if (connection === 'open') {
isBlasting = true;
suksesCount = 0;
gagalCount = 0;
let daftar = ambilDaftarNomor();
bot.sendMessage(chatId, `🎉 **Terhubung!**\n🖼️ Mengirim ke **${daftar.length}** nomor.`);

while (daftar.length > 0 && isBlasting) {
const target = daftar[0];
try {
const templateButtons = [
{ index: 1, urlButton: { displayText: '🎰 LOGIN SEKARANG', url: 'https://wso288slotresmi.sbs/login' } },
{ index: 2, callButton: { displayText: '📞 HUBUNGI ADMIN', phoneNumber: '+628123456789' } }
];
await sock.sendMessage(`${target.nomor}@s.whatsapp.net`, {
image: fs.readFileSync(FILE_GAMBAR),
caption: rakitPesan(target.nama),
footer: 'Klik tombol di bawah ini:',
templateButtons: templateButtons
});
suksesCount++;
} catch (err) {
gagalCount++;
}
daftar.shift();
updateFileNomor(daftar);
if (suksesCount % 10 === 0) {
bot.sendMessage(chatId, `📊 **REKAP**\n✅ BERHASIL: ${suksesCount}\n❌ GAGAL: ${gagalCount}`);
}
if (daftar.length > 0 && isBlasting) await new Promise(res => setTimeout(res, JEDA_MS));
}

if (isBlasting) {
bot.sendMessage(chatId, `🏁 **BLAST SELESAI**\n✅ BERHASIL: ${suksesCount}`);
isBlasting = false;
}
}

if (connection === 'close') {
const reason = lastDisconnect.error?.output?.statusCode;
if (reason !== DisconnectReason.loggedOut) {
setTimeout(() => startWA(chatId), 5000);
} else {
bot.sendMessage(chatId, "❌ Sesi keluar. Gunakan /start untuk login ulang.");
}
}
});
sock.ev.on('creds.update', saveCreds);
}

bot.onText(/\/start/, (msg) => startWA(msg.chat.id));
bot.onText(/\/stop/, (msg) => {
isBlasting = false;
bot.sendMessage(msg.chat.id, "🛑 Dihentikan.");
});
