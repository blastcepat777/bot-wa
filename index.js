async function initWA(chatId, id) {
    if (engines[id].isInitializing) return;
    engines[id].isInitializing = true;

    // Kirim pesan awal dan simpan ID-nya untuk diedit nanti
    const statusMsg = await bot.sendMessage(chatId, `⏳ **Menyiapkan QR Engine ${id}...**`);
    engines[id].lastQrMsgId = statusMsg.message_id;

    if (engines[id].sock) {
        try { engines[id].sock.end(); } catch (e) {}
        engines[id].sock = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(engines[id].session);
    const { version } = await fetchLatestBaileysVersion();

    engines[id].sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Chrome", "MacOS", "20.0.04"],
        syncFullHistory: false, 
        printQRInTerminal: false,
        connectTimeoutMs: 60000
    });

    const sock = engines[id].sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, qr, lastDisconnect } = u;

        if (qr) {
            try {
                const buffer = await QRCode.toBuffer(qr, { scale: 4 }); 
                const otherId = id == 1 ? 2 : 1;
                const markup = {
                    inline_keyboard: [
                        [{ text: `(ON)${engines[otherId].color} QR${otherId}`, callback_data: `login_${otherId}` }],
                        [{ text: "♻️ RESTART", callback_data: 'restart_bot' }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                };

                const caption = `${engines[id].color} **SCAN QR ENGINE ${id} SEKARANG !!**\n\n🕒 Update: ${new Date().toLocaleTimeString('id-ID')}`;

                // PERBAIKAN: Hapus pesan teks "Menyiapkan" dan ganti dengan Foto QR di posisi yang sama
                await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                const sent = await bot.sendPhoto(chatId, buffer, { caption, parse_mode: 'Markdown', reply_markup: markup });
                
                // Simpan ID foto agar jika QR update, kita cukup edit medianya saja, bukan kirim pesan baru
                engines[id].lastQrMsgId = sent.message_id;
            } catch (e) { console.log("Gagal update QR"); }
        }

        if (connection === 'open') {
            engines[id].isInitializing = false;
            // Hapus QR jika sudah berhasil login agar chat bersih
            if (engines[id].lastQrMsgId) {
                await bot.deleteMessage(chatId, engines[id].lastQrMsgId).catch(() => {});
                engines[id].lastQrMsgId = null;
            }
            
            if (!engines[id].menuSent) {
                sendMenuEngine(chatId, id);
                engines[id].menuSent = true;
            }
        }
        
        if (connection === 'close') {
            engines[id].isInitializing = false;
            engines[id].menuSent = false;
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                initWA(chatId, id);
            }
        }
    });
}
