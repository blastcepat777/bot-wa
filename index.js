const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// Proteksi Anti-Crash Global
process.on('uncaughtException', (err) => console.log('Sistem Aman dari Crash:', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection Aman:', reason));

let stats = { totalBlast: 0, hariIni: 0, terahirUpdate: new Date().toLocaleDateString('id-ID') };
let engines = {
    1: { sock: null, session: './session_1', color: '🌪', isInitializing: false, waitingNumber: false },
    2: { sock: null, session: './session_2', color: '🌊', isInitializing: false, waitingNumber: false }
};

const menuBawah = {
    reply_markup: {
        keyboard: [[{ text: "📊 LAPORAN HARIAN" }, { text: "♻️ RESTART" }, { text: "🛡️ CEK STATUS WA" }]],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

async function initWA(chatId, id, phoneNumber) {
    if (engines[id].isInitializing) return;
    engines[id].isInitializing = true;

    // Bersihkan sesi lama agar fresh saat pairing baru
    if (fs.existsSync(engines[id].session)) {
        try { fs.rmSync(engines[id].session, { recursive: true, force: true }); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"], // Browser standar untuk pairing
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        connectTimeoutMs: 60000
    });

    // --- LOGIKA REQUEST PAIRING CODE ---
    if (!engines[id].sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await engines[id].sock.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join('-') || code; // Format XXXX-XXXX
                
                bot.sendMessage(chatId, 
                    `${engines[id].color} **KODE PAIRING ENGINE ${id}**\n\n` +
                    `Nomor: \`${phoneNumber}\`\n` +
                    `Kode: \`${code}\`\n\n` +
                    `**CARA INPUT:**\n` +
                    `1. Buka WA > Perangkat Tertaut.\n` +
                    `2. Pilih **Tautkan Perangkat**.\n` +
                    `3. Klik **"Tautkan dengan nomor telepon saja"** di bagian bawah.\n` +
                    `4. Masukkan kode di atas.`, 
                    { parse_mode: 'Markdown' }
                );
            } catch (err) {
                bot.sendMessage(chatId, `❌ Gagal meminta kode: ${err.message}`);
                engines[id].isInitializing = false;
            }
        }, 3000);
    }

    engines[id].sock.ev.on('creds.update', saveCreds);

    engines[id].sock.ev.on('connection.update', async (u) => {
        const { connection, lastDisconnect } = u;

        if (connection === 'open') {
            engines[id].isInitializing = false;
            bot.sendMessage(chatId, `✅ **ENGINE ${id} BERHASIL TERHUBUNG!**\nSistem siap digunakan Bos.`, menuBawah);
        }

        if (connection === 'close') {
            engines[id].isInitializing = false;
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log(`Engine ${id} terputus, mencoba perbaikan...`);
            }
        }
    });
}

// --- HANDLER CALLBACK ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === 'cmd_login') {
        bot.editMessageText("🚀 Pilih Engine untuk Pairing:", {
            chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "🌪 PAIR 1", callback_data: 'pair_1' }, { text: "🌊 PAIR 2", callback_data: 'pair_2' }]] }
        });
    }

    if (q.data.startsWith('pair_')) {
        const id = q.data.split('_')[1];
        engines[id].waitingNumber = true;
        bot.sendMessage(chatId, `${engines[id].color} **INPUT NOMOR ENGINE ${id}**\n\nSilahkan
