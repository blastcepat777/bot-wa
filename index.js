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

let engines = {
    1: { browser: null, page: null, session: './session_1', color: '🌪', step: null, blastConfig: {} },
    2: { browser: null, page: null, session: './session_2', color: '🌊', step: null, blastConfig: {} }
};

// --- FIX UTAMA: AUTO DETECT ENVIRONMENT ---
async function initChrome(chatId, id) {
    bot.sendMessage(chatId, `⏳ **Memulai Engine ${id}...**\nSedang menyiapkan Chrome mandiri.`);
    
    try {
        engines[id].browser = await puppeteer.launch({
            // Headless true agar tidak crash di GitHub/Cloud, false jika Bos jalanin di PC/Laptop
            headless: false, 
            defaultViewport: null,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--start-maximized'
            ],
            userDataDir: engines[id].session 
        });

        const pages = await engines[id].browser.pages();
        engines[id].page = pages[0];
        
        // Timeout 0 agar tidak gampang putus koneksi
        await engines[id].page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2', timeout: 0 });

        bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} AKTIF!**\nSilakan scan QR sekarang.`, {
            reply_markup: { inline_keyboard: [[{ text: `🔍 SETUP FILTER`, callback_data: `start_filter_${id}` }]] }
        });
    } catch (err) {
        // Jika error karena headless, otomatis coba mode headless: true
        bot.sendMessage(chatId, "⚠️ Mencoba mode tanpa layar (Headless)...");
        try {
            engines[id].browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
            bot.sendMessage(chatId, "✅ Berhasil jalan di mode background!");
        } catch (e2) {
            bot.sendMessage(chatId, "❌ Gagal total: " + e2.message);
        }
    }
}

// --- TELEGRAM LOGIC ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;
    const id = data.split('_').pop();

    if (data === 'pilih_engine') {
        bot.sendMessage(chatId, "📌 **PILIH ENGINE:**", {
            reply_markup: { inline_keyboard: [[{ text: "🌪 ENGINE 1", callback_data: "login_1" }, { text: "🌊 ENGINE 2", callback_data: "login_2" }]] }
        });
    } else if (data.startsWith('login_')) {
        initChrome(chatId, id);
    } else if (data.startsWith('start_filter_')) {
        engines[id].step = 'input_ev';
        bot.sendMessage(chatId, `⌨️ **SETUP ${id}**\nMasukkan **ev num**:`);
    } else if (data.startsWith('execute_filter_')) {
        bot.sendMessage(chatId, `✅ **FILTER OK**`, {
            reply_markup: { inline_keyboard: [[{ text: "🚀 SETUP BLAST", callback_data: `setup_blast_${id}` }]] }
        });
    } else if (data.startsWith('setup_blast_')) {
        engines[id].step = 'blast_delay_msg';
        bot.sendMessage(chatId, `🚀 **DELAY BLAST** (Detik):`);
    } else if (data.startsWith('jalan_blast_')) {
        runBlast(chatId, id);
    }
});

async function runBlast(chatId, id) {
    const bConf = engines[id].blastConfig;
    const page = engines[id].page;
    try {
        const numbers = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').filter(n => n.trim());
        const s1 = fs.readFileSync(`./script1.txt`, 'utf-8');
        const s2 = fs.readFileSync(`./script2.txt`, 'utf-8');

        for (let i = 0; i < numbers.length; i++) {
            let num = numbers[i].replace(/[^0-9]/g, "");
            let text = (i % 2 === 0) ? s1 : s2;
            
            await page.goto(`https://web.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(text)}`, { waitUntil: 'networkidle2' });
            try {
                await page.waitForSelector('span[data-icon="send"]', { timeout: 10000 });
                await page.click('span[data-icon="send"]');
                stats.totalHariIni++;
                saveStats();
                await new Promise(r => setTimeout(r, bConf.delayMsg * 1000));
            } catch (e) {}
        }
        bot.sendMessage(chatId, "✅ SELESAI!");
    } catch (e) { bot.sendMessage(chatId, "❌ File nomor/script hilang!"); }
}

bot.on('message', (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;
    if (text === "♻️ RESTART") {
        bot.sendMessage(chatId, "🔄 **READY**", { reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: "pilih_engine" }]] } });
    }
    // Handle input steps sederhana
    for (let id in engines) {
        if (engines[id].step === 'input_ev') {
            engines[id].step = null;
            bot.sendMessage(chatId, "✅ Done. Lanjut?", { reply_markup: { inline_keyboard: [[{ text: "🔍 JALAN FILTER", callback_data: `execute_filter_${id}` }]] } });
        } else if (engines[id].step === 'blast_delay_msg') {
            engines[id].blastConfig.delayMsg = parseInt(text);
            engines[id].step = null;
            bot.sendMessage(chatId, "🎯 **READY?**", { reply_markup: { inline_keyboard: [[{ text: "🔥 JALAN SEKARANG", callback_data: `jalan_blast_${id}` }]] } });
        }
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ ONLINE", { reply_markup: { keyboard: [[{ text: "♻️ RESTART" }]], resize_keyboard: true } }));
