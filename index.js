const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- PERSISTENT STATS ---
const STATS_FILE = './stats.json';
let stats = { totalHariIni: 0, rekapanTotalHarian: 0, terakhirBlast: "-" };
if (fs.existsSync(STATS_FILE)) {
    try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch (e) {}
}
const saveStats = () => fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', color: '🌪', isInitializing: false, qrTimeout: null, config: { ev: 0, every: 0, delay: 0 }, blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 }, step: null, isBlasting: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', color: '🌊', isInitializing: false, qrTimeout: null, config: { ev: 0, every: 0, delay: 0 }, blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 }, step: null, isBlasting: false }
};

const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";
const menuUtama = { reply_markup: { keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }]], resize_keyboard: true } };

async function cleanupEngine(chatId, id) {
    if (engines[id].qrTimeout) clearTimeout(engines[id].qrTimeout);
    if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
    if (engines[id].sock) {
        try { engines[id].sock.end(); } catch (e) {}
        engines[id].sock = null;
    }
    engines[id].isInitializing = false;
    engines[id].isBlasting = false;
    engines[id].step = null;
}

async function initWA(chatId, id, msgIdToEdit) {
    await cleanupEngine(chatId, id);
    engines[id].isInitializing = true;
    try {
        if (!fs.existsSync(engines[id].session)) fs.mkdirSync(engines[id].session, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
        const { version } = await fetchLatestBaileysVersion();
        const sock = makeWASocket({
            version, auth: state, logger: pino({ level: 'silent' }),
            browser: ["Ubuntu", "Chrome", "122.0.6261.112"],
            syncFullHistory: false, // Penting: Biar ringan & gak lemot di awal
            printQRInTerminal: false
        });

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (u) => {
            const { connection, lastDisconnect, qr } = u;
            if (qr && engines[id].isInitializing) {
                const buffer = await QRCode.toBuffer(qr, { scale: 3 });
                if (msgIdToEdit) { await bot.deleteMessage(chatId, msgIdToEdit).catch(() => {}); msgIdToEdit = null; }
                if (engines[id].lastQrMsgId) await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                const sent = await bot.sendPhoto(chatId, buffer, { caption: `${engines[id].color} **ENGINE ${id} READY**\n🕒 ${getWIBTime()}` });
                engines[id].lastQrMsgId = sent.message_id;
            }
            if (connection === 'open') {
                engines[id].sock = sock;
                engines[id].isInitializing = false;
                bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE!**`, {
                    reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI FILTER`, callback_data: `start_filter_${id}` }]] }
                });
            }
            if (connection === 'close') {
                if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) initWA(chatId, id);
            }
        });
    } catch (err) { engines[id].isInitializing = false; }
}

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const id = q.data.split('_')[2];

    if (q.data.startsWith('start_filter_')) {
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `⌨️ **SETUP ENGINE ${id}**\nMasukkan jumlah **ev num**:`);
    }

    if (q.data.startsWith('execute_filter_')) {
        const conf = engines[id].config;
        const sock = engines[id].sock;
        if (!sock) return bot.answerCallbackQuery(q.id, { text: "Offline!" });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim() !== "").slice(0, conf.ev);
            bot.sendMessage(chatId, `🔍 **FILTERING ${dataNomor.length} NOMOR...**`);
            for (let i = 0; i < dataNomor.length; i++) {
                let jid = dataNomor[i].replace(/[^0-9]/g, "") + '@s.whatsapp.net';
                await sock.onWhatsApp(jid).catch(() => {});
                if (conf.every > 0 && (i + 1) % conf.every === 0) await new Promise(res => setTimeout(res, conf.delay * 1000));
            }
            bot.sendMessage(chatId, `✅ **FILTER SELESAI**`, {
                reply_markup: { inline_keyboard: [[{ text: "🚀 SETUP BLAST", callback_data: `setup_blast_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, "❌ File error."); }
    }

    if (q.data.startsWith('setup_blast_')) {
        engines[id].step = 'blast_delay_msg';
        bot.sendMessage(chatId, `🚀 **SETTING BLAST ENGINE ${id}**\nMasukkan **Delay Message** (Detik/Milidetik, contoh: 0.5):`);
    }

    // --- LOGIKA ULTRA NINJA (POKOK PERBAIKAN) ---
    if (q.data.startsWith('jalan_blast_')) {
        const engine = engines[id];
        if (engine.isBlasting) return bot.answerCallbackQuery(q.id, { text: "Sabar Bos, lagi jalan!" });

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').map(n => n.trim()).filter(n => n !== "");
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();
            
            engine.isBlasting = true;
            bot.sendMessage(chatId, `🥷 **ULTRA NINJA START!**\n🚀 Target: \`${dataNomor.length}\` Chat\n⚡ Mode: Non-Blocking Speed`, menuUtama);

            dataNomor.forEach((baris, i) => {
                // Kalkulasi jeda tanpa await (Scheduler Mode)
                let baseDelay = (engine.blastConfig.delayMsg || 0.3) * 1000;
                let scheduleTime = i * baseDelay;

                // Tambahan jeda break
                if (engine.blastConfig.breakAfter > 0) {
                    scheduleTime += (Math.floor(i / engine.blastConfig.breakAfter) * engine.blastConfig.delayBreak * 1000);
                }

                setTimeout(async () => {
                    if (!engine.isBlasting || !engine.sock) return;
                    try {
                        let nomor = baris.replace(/[^0-9]/g, "");
                        let jid = (nomor.startsWith('0') ? '62' + nomor.slice(1) : (nomor.startsWith('62') ? nomor : '62' + nomor)) + '@s.whatsapp.net';
                        let sapaan = baris.split(/[0-9]/)[0].trim() || "";
                        let pesan = ((i % 2 === 0) ? p1 : p2).replace(/{id}/g, sapaan);

                        // FIRE & FORGET: Jangan pakai 'await' di sini biar kencang!
                        engine.sock.sendMessage(jid, { text: pesan }).catch(() => {});

                        // Update Stats per 10 chat biar gak berat di I/O file
                        stats.totalHariIni++;
                        stats.rekapanTotalHarian++;
                        if (i % 10 === 0 || i === dataNomor.length - 1) {
                            stats.terakhirBlast = getWIBTime();
                            saveStats();
                        }

                        if (i === dataNomor.length - 1) {
                            engine.isBlasting = false;
                            bot.sendMessage(chatId, `✅ **NINJA FINISHED!**\nTotal meluncur: \`${dataNomor.length}\` chat.`);
                        }
                    } catch (err) {}
                }, scheduleTime);
            });
        } catch (e) { bot.sendMessage(chatId, "❌ File script/nomor hilang!"); engine.isBlasting = false; }
    }

    if (q.data === 'pilih_engine') {
        bot.sendMessage(chatId, "📌 **PILIH ENGINE:**", {
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }]] }
        });
    }
    if (q.data.startsWith('login_')) initWA(chatId, q.data.split('_')[1]);
    if (q.data === 'batal') { await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2); bot.sendMessage(chatId, "✅ **READY**", menuUtama); }
    bot.answerCallbackQuery(q.id);
});

bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;
    if (!text || text.startsWith('/')) return;

    for (let id in engines) {
        if (engines[id].step) {
            const val = parseFloat(text);
            if (isNaN(val)) return bot.sendMessage(chatId, "⚠️ Masukkan angka!");
            
            if (engines[id].step === 'input_ev') {
                engines[id].config.ev = val; engines[id].step = 'input_every';
                bot.sendMessage(chatId, `✅ OK. Masukkan **Every**:`);
            } else if (engines[id].step === 'input_every') {
                engines[id].config.every = val; engines[id].step = 'input_delay';
                bot.sendMessage(chatId, `✅ OK. Masukkan **Delay** (detik):`);
            } else if (engines[id].step === 'input_delay') {
                engines[id].config.delay = val; engines[id].step = null;
                bot.sendMessage(chatId, `⚙️ **FILTER READY**`, { reply_markup: { inline_keyboard: [[{ text: "🔍 JALAN", callback_data: `execute_filter_${id}` }]] } });
            } else if (engines[id].step === 'blast_delay_msg') {
                engines[id].blastConfig.delayMsg = val; engines[id].step = 'blast_break_after';
                bot.sendMessage(chatId, `✅ Delay: ${val}s. Masukkan **Break After** (Pesan):`);
            } else if (engines[id].step === 'blast_break_after') {
                engines[id].blastConfig.breakAfter = val; engines[id].step = 'blast_delay_break';
                bot.sendMessage(chatId, `✅ Break: ${val} msg. Masukkan **Delay Break** (detik):`);
            } else if (engines[id].step === 'blast_delay_break') {
                engines[id].blastConfig.delayBreak = val; engines[id].step = null;
                bot.sendMessage(chatId, `📊 **BLAST READY**`, { reply_markup: { inline_keyboard: [[{ text: "🚀 JALAN", callback_data: `jalan_blast_${id}` }]] } });
            }
            return;
        }
    }

    if (text === "📊 LAPORAN HARIAN") bot.sendMessage(chatId, `🚀 Hari Ini: ${stats.totalHariIni}\n📈 Total: ${stats.rekapanTotalHarian}`, menuUtama);
    if (text === "♻️ RESTART") { await cleanupEngine(chatId, 1); await cleanupEngine(chatId, 2); bot.sendMessage(chatId, "♻️ **RESTARTED**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } }); }
    if (text === "🛡️ CEK STATUS WA") {
        let st = "🛡️ **STATUS**\n";
        for (let i=1; i<=2; i++) st += `Engine ${i}: ${engines[i].sock?.user ? "✅ ONLINE" : "❌ OFFLINE"}\n`;
        bot.sendMessage(chatId, st, menuUtama);
    }
    if (text === "🚪 LOGOUT WA") {
        for (let i=1; i<=2; i++) { await cleanupEngine(chatId, i); if (fs.existsSync(engines[i].session)) fs.rmSync(engines[i].session, { recursive: true, force: true }); }
        bot.sendMessage(chatId, "✅ **LOGOUT DONE**", menuUtama);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM ONLINE!**", menuUtama));
