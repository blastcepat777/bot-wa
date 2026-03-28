const { fs } = require('fs'); // Tambahkan di bagian paling atas

async function startWA(chatId) {
    const sessionFolder = 'session_data';
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.0"]
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            const buffer = await QRCode.toBuffer(qr, { scale: 10 });
            await bot.sendPhoto(chatId, buffer, { caption: "📸 Barcode Baru Terdeteksi. Silakan Scan!" });
        }

        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            console.log("Koneksi tertutup, alasan:", reason);

            if (reason === DisconnectReason.loggedOut) {
                console.log("Sesi Logout. Menghapus folder sesi...");
                // Menghapus folder agar minta scan ulang otomatis
                if (require('fs').existsSync(sessionFolder)) {
                    require('fs').rmSync(sessionFolder, { recursive: true, force: true });
                }
                startWA(chatId); // Mulai ulang untuk dapet QR baru
            } else {
                startWA(chatId); // Reconnect biasa
            }
        }
        // ... sisa kode blast Anda di bawah ...
    });
}
