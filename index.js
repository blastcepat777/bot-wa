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

// --- ENGINE CONFIG ---
let engines = {
    1: { browser: null, page: null, session: './session_1', color: '🌪', config: { ev: 0, every: 0, delay: 0 }, blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 }, step: null },
    2: { browser: null, page: null, session: './session_2', color: '🌊', config: { ev: 0, every: 0, delay: 0 }, blastConfig: { delayMsg: 0, breakAfter: 0, delayBreak: 0 }, step: null }
};

const getWIBTime = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: 'medium', timeStyle: 'medium' }) + " WIB";

const menuUtama = {
    reply_markup: {
        keyboard: [[{ text: "♻️ RESTART" }], [{ text: "📊 LAPORAN HARIAN" }, { text: "🛡️ CEK STATUS WA" }, { text: "🚪 LOGOUT WA" }]],
        resize_keyboard: true
    }
};

// --- CORE PUPPETEER FUNCTION ---
async function initChrome(chatId, id) {
    if (engines[id].browser) await engines[id].browser.close().catch(() => {});
    
    bot.sendMessage(chatId, `⏳ **Membuka Chrome Engine ${id}...**\nSilakan cek layar PC Bos.`);

    try {
        engines[id].browser = await puppeteer.launch({
            headless: false, // AGAR MUNCUL VISUALNYA
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Sesuaikan path chrome Bos
            userDataDir: engines[id].session,
            args: ['--start-maximized', '--no-sandbox']
        });

        const pages = await engines[id].browser.pages();
        engines[id].page = pages[0];
        await engines[id].page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2', timeout: 0 });

        // Cek apakah perlu scan QR
        const isLogged = await engines[id].page.evaluate(() => {
            return !!document.querySelector('canvas');
        }).catch(() => false);

        if (isLogged) {
            // Ambil screenshot QR untuk dikirim ke Telegram
            const canvas = await engines[id].page.$('canvas');
            if (canvas) {
                const buffer = await canvas.screenshot();
                await bot.sendPhoto(chatId, buffer, { 
                    caption: `📸 **SCAN QR ENGINE ${id}**\nSegera scan dari HP Bos!` 
                });
            }
        }

        bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} READY!**`, {
            reply_markup: { inline_keyboard: [[{ text: `🔍 MULAI FILTER`, callback_data: `start_filter_${id}` }]] }
        });

    } catch (err) {
        bot.sendMessage(chatId, "❌ Gagal membuka Chrome: " + err.message);
    }
}

async function sendMessagePuppeteer(id, nomor, pesan) {
    const page = engines[id].page;
    try {
        const url = `https://web.whatsapp.com/send?phone=${nomor}&text=${encodeURIComponent(pesan)}`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
        
        // Tunggu tombol kirim dan klik
        await page.waitForSelector('span[data-icon="send"]', { timeout: 30000 });
        await page.click('span[data-icon="send"]');
        
        // Tunggu sebentar biar pesan terkirim (icon jam hilang)
        await page.waitForTimeout(2000); 
        return true;
    } catch (e) {
        return false;
    }
}

// --- TELEGRAM LOGIC ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const id = q.data.split('_')[q.data.split('_').length - 1];

    if (q.data.startsWith('login_')) {
        initChrome(chatId, id);
    }

    if (q.data.startsWith('jalan_blast_')) {
        const bConf = engines[id].blastConfig;
        try {
            const dataNomor = fs.readFileSync(`./nomor${id}.txt`, 'utf-8').split('\n').map(n => n.trim()).filter(n => n !== "");
            const p1 = fs.readFileSync(`./script1.txt`, 'utf-8').trim();
            const p2 = fs.readFileSync(`./script2.txt`, 'utf-8').trim();

            bot.sendMessage(chatId, `🚀 **BLASTING STARTED (VISUAL MODE)...**`, menuUtama);

            for (let i = 0; i < dataNomor.length; i++) {
                let baris = dataNomor[i];
                let nomor = baris.replace(/[^0-9]/g, "");
                let sapaan = baris.split(/[0-9]/)[0].trim() || "";
                let teksFinal = ((i % 2 === 0) ? p1 : p2).replace(/{id}/g, sapaan);

                const sukses = await sendMessagePuppeteer(id, nomor, teksFinal);
                
                if (sukses) {
                    stats.totalHariIni++;
                    saveStats();
                }

                // Delay antar pesan
                await new Promise(res => setTimeout(res, bConf.delayMsg * 1000));

                // Jeda Break
                if (bConf.breakAfter > 0 && (i + 1) % bConf.breakAfter === 0) {
                    bot.sendMessage(chatId, `☕ **BREAK SEJENAK...** (${bConf.delayBreak}s)`);
                    await new Promise(res => setTimeout(res, bConf.delayBreak * 1000));
                }
            }
            bot.sendMessage(chatId, `✅ **BLAST SELESAI!**`);
        } catch (e) {
            bot.sendMessage(chatId, "❌ Error: " + e.message);
        }
    }
    // ... Tambahkan callback_data lainnya (batal, start_filter, dll) sesuai script lama Bos
});

// --- HANDLE INPUT ANGKA ---
bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (text === "♻️ RESTART") {
        for (let i in engines) if (engines[i].browser) await engines[i].browser.close();
        bot.sendMessage(chatId, "✅ **SYSTEM RESTARTED**", {
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN ENGINE 1", callback_data: "login_1" }]] }
        });
    }
    
    // ... Handle Step input_ev, input_delay, dll sama seperti script lama Bos
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "✅ **SYSTEM CHROME ONLINE!**", menuUtama));
