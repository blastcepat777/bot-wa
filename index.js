const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATA PERSISTENT ---
const STATS_FILE = './stats.json';
let stats = { totalHariIni: 0, rekapanTotalHarian: 0, terakhirBlast: "-" };
if (fs.existsSync(STATS_FILE)) {
    try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')); } catch (e) {}
}
const saveStats = () => fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

// --- ENGINE CONFIG ---
let engines = {
    1: { browser: null, page: null, session: './session_1', color: '🌪', config: { ev: 0, every: 0, delay: 0 }, blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 }, step: null },
    2: { browser: null, page: null, session: './session_2', color: '🌊', config: { ev: 0, every: 0, delay: 0 }, blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 }, step: null }
};

const menuUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }]],
        resize_keyboard: true
    }
};

// --- FUNGSI UTAMA CHROME ---
async function initChrome(chatId, id) {
    bot.sendMessage(chatId, `⏳ **Membuka Chrome Engine ${id}...**\nCek layar PC Bos sekarang!`);
    
    try {
        engines[id].browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox'],
            userDataDir: engines[id].session // Ini yang bikin Chrome mandiri
        });

        const pages = await engines[id].browser.pages();
        engines[id].page = pages[0];
        await engines[id].page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2', timeout: 0 });

        bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} AKTIF!**\nSilakan scan QR di jendela Chrome yang muncul.`, {
            reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI SETUP FILTER`, callback_data: `start_filter_${id}` }]] }
        });
    } catch (err) {
        bot.sendMessage(chatId, "❌ Gagal: " + err.message + "\n\nPastikan Google Chrome sudah terinstall di PC.");
    }
}

// --- LOGIC TOMBOL ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data === 'pilih_engine') {
        bot.sendMessage(chatId, "📌 **PILIH ENGINE:**", {
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }]] }
        });
    }

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        initChrome(chatId, id);
    }

    if (data.startsWith('start_filter_')) {
        const id = data.split('_')[2];
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `⌨️ **SETUP ENGINE ${id}**\nMasukkan jumlah **ev num** (Contoh: 100):`);
    }

    if (data.startsWith('execute_filter_')) {
        const id = data.split('_')[2];
        bot.sendMessage(chatId, `✅ **FILTER SELESAI**\nSistem siap melakukan blast.`, {
            reply_markup: { inline_keyboard: [[{ text: "🚀 SETUP BLAST", callback_data: `setup_blast_${id}` }]] }
        });
    }

    if (data.startsWith('setup_blast_')) {
        const id = data.split('_')[2];
        engines[id].step = 'blast_delay_msg';
        bot.sendMessage(chatId, `🚀 **SETTING BLAST ENGINE ${id}**\nMasukkan **Delay Per Pesan** (Detik):`);
    }

    if (data.startsWith('jalan_blast_')) {
        const id = data.split('_')[2];
        const bConf = engines[id].blastConfig;
        const page = engines[id].page;

        if (!page) return bot.sendMessage(chatId, "❌ Chrome belum terbuka!");

        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').map(n => n.trim()).filter(n => n !== "");
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            bot.sendMessage(chatId, `🔥 **BLAST DIMULAI...**\nTotal: ${dataNomor.length} nomor.`, menuUtama);

            for (let i = 0; i < dataNomor.length; i++) {
                let nomor = dataNomor[i].replace(/[^0-9]/g, "");
                let teksFinal = (i % 2 === 0) ? p1 : p2;
                
                // Gunakan URL WA Direct
                await page.goto(`https://web.whatsapp.com/send?phone=${nomor}&text=${encodeURIComponent(teksFinal)}`, { waitUntil: 'networkidle2' });
                
                try {
                    // Tunggu tombol kirim muncul
                    await page.waitForSelector('span[data-icon="send"]', { timeout: 15000 });
                    await page.click('span[data-icon="send"]');
                    
                    stats.totalHariIni++;
                    stats.terakhirBlast = getWIBTime();
                    saveStats();
                    
                    // Jeda antar pesan
                    await new Promise(res => setTimeout(res, bConf.delayMsg * 1000));
                    
                    // Jeda Break jika mencapai batas
                    if (bConf.breakAfter > 0 && (i + 1) % bConf.breakAfter === 0) {
                        await new Promise(res => setTimeout(res, bConf.delayBreak * 1000));
                    }
                } catch (e) {
                    console.log(`Gagal kirim ke ${nomor}, lanjut ke nomor berikutnya...`);
                }
            }
            bot.sendMessage(chatId, `✅ **BLAST ENGINE ${id} SELESAI!**`);
        } catch (e) {
            bot.sendMessage(chatId, "❌ Error: File nomor atau script tidak ditemukan.");
        }
    }
});

// --- HANDLE INPUT CHAT ---
bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (text === "♻️ RESTART") {
        bot.sendMessage(chatId, "🔄 **SISTEM SIAP**", {
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN ENGINE", callback_data: "pilih_engine" }]] }
        });
    }

    if (text === "📊 LAPORAN HARIAN") {
        bot.sendMessage(chatId, `📊 **REKAP HARI INI**\nTotal: ${stats.totalHariIni}\nLast: ${stats.terakhirBlast}`);
    }

    // Input Step Logic
    for (let id in engines) {
        if (engines[id].step) {
            const val = parseInt(text);
            if (engines[id].step === 'input_ev') {
                engines[id].config.ev = val;
                engines[id].step = 'input_every';
                bot.sendMessage(chatId, `✅ ev: ${val}\nMasukkan **every**:`);
            } else if (engines[id].step === 'input_every') {
                engines[id].config.every = val;
                engines[id].step = 'input_delay';
                bot.sendMessage(chatId, `✅ every: ${val}\nMasukkan **delay filter**:`);
            } else if (engines[id].step === 'input_delay') {
                engines[id].config.delay = val;
                engines[id].step = null;
                bot.sendMessage(chatId, `⚙️ Setup Filter Selesai`, {
                    reply_markup: { inline_keyboard: [[{ text: "🔍 JALANKAN FILTER", callback_data: `execute_filter_${id}` }]] }
                });
            } else if (engines[id].step === 'blast_delay_msg') {
                engines[id].blastConfig.delayMsg = val;
                engines[id].step = 'blast_break_after';
                bot.sendMessage(chatId, `✅ Delay: ${val}s\nMasukkan **Break After** (Contoh: 50):`);
            } else if (engines[id].step === 'blast_break_after') {
                engines[id].blastConfig.breakAfter = val;
                engines[id].step = 'blast_delay_break';
                bot.sendMessage(chatId, `✅ Break: ${val}\nMasukkan **Delay Break** (Detik):`);
            } else if (engines[id].step === 'blast_delay_break') {
                engines[id].blastConfig.delayBreak = val;
                engines[id].step = null;
                bot.sendMessage(chatId, `🎯 **SETUP BLAST SELESAI**`, {
                    reply_markup: { inline_keyboard: [[{ text: "🔥 JALAN SEKARANG", callback_data: `jalan_blast_${id}` }]] }
                });
            }
            return;
        }
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM READY!**", menuUtama));
