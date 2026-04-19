const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, delay } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA & PERSISTENT STATS ---
const STATS_FILE = './stats.json';
let stats = { totalHariIni: 0, rekapanTotalHarian: 0, terakhirBlast: "-" };

if (fs.existsSync(STATS_FILE)) {
    try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch (e) {}
}

const saveStats = () => fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false, qrTimeout: null, config: { ev: 0, every: 0, delay: 0 }, step: null },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false, qrTimeout: null, config: { ev: 0, every: 0, delay: 0 }, step: null }
};

const menuUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }]],
        resize_keyboard: true, one_time_keyboard: false
    }
};

async function cleanupEngine(chatId, id) {
    if (engines[id].qrTimeout) { clearTimeout(engines[id].qrTimeout); engines[id].qrTimeout = null; }
    if (engines[id].lastQrMsgId) { await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {}); engines[id].lastQrMsgId = null; }
    if (engines[id].sock) {
        try {
            engines[id].sock.ev.removeAllListeners('connection.update');
            engines[id].sock.ev.removeAllListeners('creds.update');
            engines[id].sock.end();
            engines[id].sock = null;
        } catch (e) {}
    }
    engines[id].isInitializing = false;
}

async function initWA(chatId, id) {
    if (engines[id].isInitializing && engines[id].sock) return; // Mencegah double inisialisasi
    engines[id].isInitializing = true;
    
    try {
        if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version, auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ubuntu", "Chrome", "122.0.6261.112"],
            printQRInTerminal: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;
            
            if (qr) {
                try {
                    const buffer = await QRCode.toBuffer(qr, { scale: 3, margin: 2 });
                    const caption = `${engines[id].color} **SCAN QR ENGINE ${id}**\n🕒 ${getWIBTime()}\n⚠️ *Barcode akan refresh otomatis.*`;
                    
                    if (engines[id].lastQrMsgId) {
                        await bot.editMessageMedia({ type: 'photo', media: buffer, caption: caption, parse_mode: 'Markdown' }, {
                            chat_id: chatId, message_id: engines[id].lastQrMsgId,
                            reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] }
                        }).catch(async () => {
                            const sent = await bot.sendPhoto(chatId, buffer, { caption, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] } });
                            engines[id].lastQrMsgId = sent.message_id;
                        });
                    } else {
                        const sent = await bot.sendPhoto(chatId, buffer, { caption, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: 'batal' }]] } });
                        engines[id].lastQrMsgId = sent.message_id;
                    }
                } catch (e) {}
            }

            if (connection === 'open') {
                engines[id].sock = sock;
                engines[id].isInitializing = false;
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                engines[id].lastQrMsgId = null;

                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: `🔍 SETUP FILTER & JAM`, callback_data: `start_filter_${id}` }]] }
                });
            }

            if (connection === 'close') {
                const sCode = lastDisconnect?.error?.output?.statusCode;
                engines[id].sock = null;
                if (sCode === DisconnectReason.loggedOut) {
                    if (fs.existsSync(engines[id].session)) fs.rmSync(engines[id].session, { recursive: true, force: true });
                    await cleanupEngine(chatId, id);
                } else {
                    // Reconnect otomatis jika bukan karena logout
                    setTimeout(() => initWA(chatId, id), 5000);
                }
            }
        });
    } catch (err) { engines[id].isInitializing = false; }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data.startsWith('start_filter_')) {
        const id = q.data.split('_')[2];
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `⌨️ **SETUP ENGINE ${id}**\n━━━━━━━━━━━━━━\nMasukkan jumlah **ev num**:`);
    }

    if (q.data.startsWith('execute_filter_')) {
        const id = q.data.split('_')[2];
        const conf = engines[id].config;
        const engine = engines[id];
        
        // Perbaikan: Validasi socket sebelum eksekusi
        if (!engine.sock || !engine.sock.user) {
            return bot.answerCallbackQuery(q.id, { text: "❌ Engine Offline! Silakan login ulang.", show_alert: true });
        }

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').replace(/\r/g, "").split('\n').map(n => n.trim()).filter(n => n.length > 5);
            const targetNomor = dataNomor.slice(0, conf.ev);
            if (targetNomor.length === 0) throw new Error("File nomor kosong.");

            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            const statusMsg = await bot.sendMessage(chatId, `⏳ **PROSES NGEJAM...**\nMemproses \`${targetNomor.length}\` nomor.`);

            for (const [index, baris] of targetNomor.entries()) {
                if (!engine.sock) break;
                let nomor = baris.replace(/[^0-9]/g, "");
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                let sapaan = baris.split(/[0-9]/)[0].trim() || "Kak";
                let pesan = ((index % 2 === 0) ? p1 : p2).replace(/{id}/g, sapaan);

                engine.sock.sendMessage(jid, { text: pesan }).catch(() => {});
                if (index % 15 === 0) await new Promise(res => setTimeout(res, 100)); // Jeda sedikit agar socket tidak overload
            }

            await new Promise(res => setTimeout(res, 2000));
            if (engine.sock) engine.sock.end(); // Menutup koneksi dengan aman
            engine.sock = null; 

            await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
            bot.sendMessage(chatId, `✅ **NGEJAM SELESAI**\nTotal: \`${targetNomor.length}\` pesan tertahan.`, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 JALANKAN SEKARANG", callback_data: `lepas_jam_${id}` }]] }
            });

        } catch (e) { bot.sendMessage(chatId, "❌ Error: " + e.message); }
    }

    if (q.data.startsWith('lepas_jam_')) {
        const id = q.data.split('_')[2];
        bot.editMessageText(`🚀 **MELEPAS ANTREAN ENGINE ${id}...**\nKoneksi sedang dibangun ulang.`, { chat_id: chatId, message_id: msgId });
        stats.totalHariIni += (engines[id].config.ev || 0);
        stats.rekapanTotalHarian += (engines[id].config.ev || 0);
        stats.terakhirBlast = getWIBTime();
        saveStats();
        initWA(chatId, id); 
    }

    if (q.data.startsWith('login_')) {
        const id = q.data.split('_')[1];
        initWA(chatId, id);
    }

    if (q.data === 'pilih_engine') {
        bot.editMessageText("📌 **PILIH ENGINE:**", { chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }], [{ text: "❌ BATAL", callback_data: "batal" }]] }
        });
    }

    if (q.data === 'batal') { 
        await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2); 
        bot.editMessageText("✅ **SISTEM DIHENTIKAN**", { chat_id: chatId, message_id: msgId });
    }
    bot.answerCallbackQuery(q.id);
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;
    if (!text) return;

    for (let id in engines) {
        if (engines[id].step) {
            const val = parseInt(text);
            if (isNaN(val)) return bot.sendMessage(chatId, "❌ Masukkan angka.");
            if (engines[id].step === 'input_ev') {
                engines[id].config.ev = val; engines[id].step = 'input_every';
                return bot.sendMessage(chatId, `✅ ev: \`${val}\`\nMasukkan **every**:`);
            } else if (engines[id].step === 'input_every') {
                engines[id].config.every = val; engines[id].step = 'input_delay';
                return bot.sendMessage(chatId, `✅ every: \`${val}\`\nMasukkan **delay**:`);
            } else if (engines[id].step === 'input_delay') {
                engines[id].config.delay = val; engines[id].step = null;
                return bot.sendMessage(chatId, `⚙️ **SETTING SELESAI**`, {
                    reply_markup: { inline_keyboard: [[{ text: "🔍 MULAI FILTER & JAM", callback_data: `execute_filter_${id}` }]] }
                });
            }
        }
    }

    if (text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **LAPORAN BLAST**\n━━━━━━━━━━━━━━\n🕒 **Waktu:** ${getWIBTime()}\n🚀 **Sesi Ini:** \`${stats.totalHariIni}\` chat\n📈 **Total Harian:** \`${stats.rekapanTotalHarian}\` chat`, { parse_mode: 'Markdown' });
    }
    if (text === "♻️ RESTART") {
        await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2);
        bot.sendMessage(chatId, "♻️ **RESTART BERHASIL**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }
    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS ENGINE**\n━━━━━━━━━━━━━━\n";
        for (let i=1; i<=2; i++) st += `${engines[i].color} Engine ${i}: ${engines[i].sock?.user ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        bot.sendMessage(chatId, st, menuUtama);
    }
    if (text === "🚪 LOGOUT WA") {
        for (let i=1; i<=2; i++) { 
            await cleanupEngine(chatId, i); 
            if (fs.existsSync(engines[i].session)) fs.rmSync(engines[i].session, { recursive: true, force: true }); 
        }
        bot.sendMessage(chatId, "✅ **SEMUA ENGINE TELAH LOGOUT**", menuUtama);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
