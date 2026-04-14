bot.onText(/\/restart/, async (msg) => {
    const chatId = msg.chat.id;
    isProcessing = false;
    
    // 1. Beri notifikasi awal agar user tahu proses sedang jalan
    await bot.sendMessage(chatId, "♻️ **RESTARTING...**\nSedang menghapus sesi dan mereset sistem.");

    // 2. Tutup koneksi socket dengan benar
    if (sock) {
        try { 
            await sock.logout(); 
            sock.end(); 
        } catch (e) {
            // Abaikan jika sudah terputus
        }
        sock = null; 
    }

    // 3. Jeda sedikit untuk memastikan file tidak lagi "busy" (sedang digunakan)
    setTimeout(() => {
        try {
            // Hapus folder session jika ada
            if (fs.existsSync('./session_data')) {
                fs.rmSync('./session_data', { recursive: true, force: true });
            }

            // 4. Kirim pesan sukses dan OTOMATIS panggil welcomeMessage
            bot.sendMessage(chatId, "✅ **RESET BERHASIL.** Sesi lama telah dibersihkan.").then(() => {
                // Menu utama muncul di sini tanpa perlu ketik /start lagi
                bot.sendMessage(chatId, welcomeMessage);
            });

        } catch (err) {
            bot.sendMessage(chatId, "⚠️ Gagal menghapus folder sesi secara otomatis. Silakan coba /restart sekali lagi.");
            console.error(err);
        }
    }, 3000); // Jeda 3 detik lebih aman untuk OS Windows/Linux
});
