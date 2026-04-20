const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, delay } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

// PENTING: Segera ganti Token ini karena sudah terekspos publik!
const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA & PERSISTENT STATS ---
const STATS_FILE = './stats.json';
let stats = { totalHariIni: 0, rekapanTotalHarian: 0, terakhirBlast: "-" };

if (fs.existsSync(STATS_FILE)) {
    try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch (e) { console.error("Gagal load stats"); }
}

const saveStats = () => fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false, qrTimeout: null, config: { ev: 0, every: 0, delay: 0 }, blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 }, step: null },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false, qrTimeout: null, config: { ev: 0, every: 0, delay: 0 }, blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 }, step: null }
};

const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

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
    engines[id].step = null;
}

async function initWA(chatId, id, msgIdToEdit = null) {
    await cleanupEngine(chatId, id);
    engines[id].isInitializing = true;
    try {
        if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version, 
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ["Ubuntu", "Chrome", "122.0.6261.112"],
            printQRInTerminal: false,
            connectTimeoutMs: 60000
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;
            
            if (qr && engines[id].isInitializing) { 
                try {
                    const buffer = await QRCode.toBuffer(qr, { scale: 3, margin: 2 });
                    if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                    if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                    
                    const sent = await bot.sendPhoto(chatId, buffer, {
                        caption: `${engines[id].color} **SCAN QR ENGINE ${id}**\n🕒 ${getWIBTime()}\n⚠️ *QR akan refresh otomatis jika tidak discan.*`,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: "❌ BATAL", callback_data: `batal_${id}` }]] }
                    });
                    engines[id].lastQrMsgId = sent.message_id;
                    
                    clearTimeout(engines[id].qrTimeout);
                    engines[id].qrTimeout = setTimeout(() => { if (engines[id].isInitializing) initWA(chatId, id); }, 45000); 
                } catch (e) { console.error("Error generating QR", e); }
            }

            if (connection === 'open') {
                engines[id].isInitializing = false;
                engines[id].sock = sock;
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI FILTER`, callback_data: `start_filter_${id}` }]] }
                });
            }

            if (connection === 'close') {
                const sCode = lastDisconnect?.error?.output?.statusCode;
                if (sCode === DisconnectReason.loggedOut) {
                    if (fs.existsSync(engines[id].session)) fs.rmSync(engines[id].session, { recursive: true, force: true });
                    await cleanupEngine(chatId, id);
                } else {
                    // Reconnect otomatis untuk error jaringan
                    initWA(chatId, id);
                }
            }
        });
    } catch (err) { engines[id].isInitializing = false; console.error(err); }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data.startsWith('start_filter_')) {
        const id = q.data.split('_')[2];
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `⌨️ **SETUP ENGINE ${id}**\nMasukkan jumlah **ev num** (Total nomor):`);
    }

    if (q.data.startsWith('execute_filter_')) {
        const id = q.data.split('_')[2];
        const conf = engines[id].config;
        const sock = engines[id].sock;
        const fileNomor = `./nomor${id}.txt`;

        if (!sock) return bot.answerCallbackQuery(q.id, { text: "❌ Engine Offline!" });
        if (!fs.existsSync(fileNomor)) return bot.sendMessage(chatId, `❌ File ${fileNomor} tidak ditemukan!`);

        bot.sendMessage(chatId, `🔍 **STATUS FILTERING...**\n📊 Ev: ${conf.ev} nomor`);

        try {
            const dataNomor = fs.readFileSync(fileNomor, 'utf-8').split('\n').filter(n => n.trim() !== "").slice(0, conf.ev);
            for (let i = 0; i < dataNomor.length; i++) {
                let nomor = dataNomor[i].replace(/[^0-9]/g, "");
                if (!nomor) continue;
                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                
                await sock.onWhatsApp(jid).catch(() => {});
                
                if (conf.every > 0 && (i + 1) % conf.every === 0 && i < dataNomor.length - 1) {
                    await new Promise(res => setTimeout(res, conf.delay * 1000));
                }
            }
            bot.sendMessage(chatId, `✅ **FILTER SELESAI**`, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 SETUP BLAST", callback_data: `setup_blast_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ Terjadi kesalahan saat membaca file."); }
    }

    if (q.data.startsWith('setup_blast_')) {
        const id = q.data.split('_')[2];
        engines[id].step = 'blast_delay_msg';
        bot.sendMessage(chatId, `🚀 **SETTING BLAST ENGINE ${id}**\nMasukkan **Delay Message** (Detik):`);
    }

    if (q.data.startsWith('jalan_blast_')) {
        const id = q.data.split('_')[2];
        const sock = engines[id].sock;
        const bConf = engines[id].blastConfig;
        
        try {
            const numPath = `./nomor${id}.txt`;
            const s1Path = `./script1.txt`;
            const s2Path = `./script2.txt`;

            if (!fs.existsSync(numPath)) throw new Error(`File nomor${id}.txt tidak ada.`);
            if (!fs.existsSync(s1Path) || !fs.existsSync(s2Path)) throw new Error(`File script1/2.txt tidak ada.`);

            const dataNomor = fs.readFileSync(numPath, 'utf-8').split('\n').map(n => n.trim()).filter(n => n !== "");
            const p1 = fs.readFileSync(s1Path, 'utf-8').trim();
            const p2 = fs.readFileSync(s2Path, 'utf-8').trim();
            
            bot.sendMessage(chatId, `🚀 **BLASTING STARTED...**\nTotal: ${dataNomor.length} nomor`, menuUtama);
            
            for (let i = 0; i < dataNomor.length; i++) {
                let baris = dataNomor[i];
                let nomor = baris.replace(/[^0-9]/g, "");
                if (!nomor) continue;

                let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                let sapaan = baris.split(/[0-9]/)[0].trim() || "Halo";
                
                // Kirim Pesan bergantian script 1 dan 2
                await sock.sendMessage(jid, { text: (i % 2 === 0 ? p1 : p2).replace(/{id}/g, sapaan) }).catch(() => {});
                
                // Stats Update
                stats.totalHariIni++;
                stats.rekapanTotalHarian++;
                stats.terakhirBlast = getWIBTime();
                saveStats();

                // Jeda antar pesan
                if (i < dataNomor.length - 1) {
                    await new Promise(res => setTimeout(res, bConf.delayMsg * 1000));
                }
                
                // Jeda Istirahat (Break)
                if (bConf.breakAfter > 0 && (i + 1) % bConf.breakAfter === 0 && i < dataNomor.length - 1) {
                    await new Promise(res => setTimeout(res, bConf.delayBreak * 1000));
                }
            }
            bot.sendMessage(chatId, `✅ **BLAST ENGINE ${id} SELESAI!**`);
        } catch (e) { 
            bot.sendMessage(chatId, `❌ Error: ${e.message}`); 
        }
    }

    if (q.data === 'pilih_engine') {
        bot.editMessageText("📌 **PILIH ENGINE:**", { chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }], [{ text: "❌ BATAL", callback_data: "batal" }]] }
        });
    }

    if (q.data.startsWith('login_')) {
        const id = q.data.split('_')[1];
        initWA(chatId, id, msgId); 
    }

    if (q.data === 'batal' || q.data.startsWith('batal_')) {
        const id = q.data.split('_')[1];
        if(id) await cleanupEngine(chatId, id);
        bot.sendMessage(chatId, "✅ **SYSTEM ONLINE!**", menuUtama);
    }
    bot.answerCallbackQuery(q.id);
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    for (let id in engines) {
        if (engines[id].step) {
            const val = parseInt(text);
            if (isNaN(val)) return bot.sendMessage(chatId, "❌ Masukkan angka saja.");

            if (engines[id].step === 'input_ev') {
                engines[id].config.ev = val;
                engines[id].step = 'input_every';
                return bot.sendMessage(chatId, `✅ ev num: ${val}\nMasukkan **every** (Jeda per berapa nomor):`);
            } 
            if (engines[id].step === 'input_every') {
                engines[id].config.every = val;
                engines[id].step = 'input_delay';
                return bot.sendMessage(chatId, `✅ every: ${val}\nMasukkan **delay** (detik):`);
            }
            if (engines[id].step === 'input_delay') {
                engines[id].config.delay = val;
                engines[id].step = null;
                return bot.sendMessage(chatId, `⚙️ **SETTING FILTER SELESAI**`, {
                    reply_markup: { inline_keyboard: [[{ text: "🔍 MULAI FILTER", callback_data: `execute_filter_${id}` }]] }
                });
            }

            if (engines[id].step === 'blast_delay_msg') {
                engines[id].blastConfig.delayMsg = val;
                engines[id].step = 'blast_break_after';
                return bot.sendMessage(chatId, `✅ Delay: ${val}s\nMasukkan **Break After** (Jumlah pesan sebelum istirahat):`);
            }
            if (engines[id].step === 'blast_break_after') {
                engines[id].blastConfig.breakAfter = val;
                engines[id].step = 'blast_delay_break';
                return bot.sendMessage(chatId, `✅ Break: ${val} msg\nMasukkan **Delay Break** (Detik istirahat):`);
            }
            if (engines[id].step === 'blast_delay_break') {
                engines[id].blastConfig.delayBreak = val;
                engines[id].step = null;
                return bot.sendMessage(chatId, `📊 **READY TO BLAST**`, {
                    reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN", callback_data: `jalan_blast_${id}` }]] }
                });
            }
        }
    }

    if (text === "📊 LAPORAN HARIAN") {
        const lap = `📊 **LAPORAN BLAST**\n━━━━━━━━━━━━━━\n🕒 **Terakhir:** ${stats.terakhirBlast}\n🚀 **Hari Ini:** ${stats.totalHariIni}\n📈 **Total Harian:** ${stats.rekapanTotalHarian}`;
        bot.sendMessage(chatId, lap, menuUtama);
    }
    
    if (text === "♻️ RESTART") {
        await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2);
        bot.sendMessage(chatId, "♻️ **SYSTEM RESTART**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
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
        bot.sendMessage(chatId, "✅ **LOGOUT BERHASIL**", menuUtama);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
