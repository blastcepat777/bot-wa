async function initWA(chatId, id) {
    // FIX: Bersihkan sesi lama jika engine belum terhubung agar QR tidak mutar
    if (!engines[id].sock?.user) {
        if (fs.existsSync(engines[id].session)) {
            try { fs.rmSync(engines[id].session, { recursive: true, force: true }); } catch (e) {}
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        // --- PERBAIKAN UTAMA: IDENTITAS BROWSER STANDAR & OPTIMASI ---
        browser: ["Ubuntu", "Chrome", "20.0.04"], 
        syncFullHistory: false, // Jangan tarik history lama agar scan cepat selesai
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000, 
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    engines[id].sock.ev.on('creds.update', saveCreds);
    engines[id].sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;
        
        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 4 });
            await sendOrUpdateQR(chatId, id, buffer);
        }

        if (connection === 'open') {
            await safeDelete(chatId, engines[id].lastQrMsgId);
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE** ✅\nSilahkan pilih filter:`, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: `🔍 FILTER 1`, callback_data: `filter_1` },
                            { text: `🔍 FILTER 2`, callback_data: `filter_2` }
                        ],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                }
            });
        }

        if (connection === 'close') {
            const status = lastDisconnect?.error?.output?.statusCode;
            if (status !== DisconnectReason.loggedOut) {
                initWA(chatId, id);
            } else {
                engines[id].sock = null;
            }
        }
    });
}
