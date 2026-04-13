async function startWA(chatId, phoneNumber) {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        connectTimeoutMs: 60000, // Tambah timeout koneksi
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    // Minta kode pairing HANYA jika belum terdaftar
    if (!sock.authState.creds.registered) {
        // Beri jeda 6 detik agar koneksi benar-benar stabil dulu
        setTimeout(async () => {
            try {
                console.log("Mencoba meminta kode pairing untuk:", phoneNumber);
                let code = await sock.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                bot.sendMessage(chatId, `🔑 **KODE PAIRING KAMU:**\n\n#️⃣   \`${code}\`   #️⃣`);
            } catch (e) {
                console.log(e);
                bot.sendMessage(chatId, "❌ Gagal: Koneksi sibuk. Coba lagi dalam 1 menit.");
            }
        }, 6000); // Jeda dinaikkan jadi 6 detik
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const code = lastDisconnect.error?.output?.statusCode;
            // Jika bukan karena logout, hubungkan ulang
            if (code !== DisconnectReason.loggedOut) {
                startWA(chatId, phoneNumber);
            }
        } else if (connection === 'open') {
            bot.sendMessage(chatId, "✅ **TERHUBUNG!**");
        }
    });
}
