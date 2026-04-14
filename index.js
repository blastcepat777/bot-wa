bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing) return;
    if (!sock) return bot.sendMessage(chatId, "Login dulu!");

    isProcessing = true;
    successCount = 0;

    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const s1 = fs.readFileSync('script1.txt', 'utf-8');
        const s2 = fs.readFileSync('script2.txt', 'utf-8');
        const total = data.length;

        let progressMsg = await bot.sendMessage(chatId, `🌪️ **ULTRA TURBO FLOW ACTIVE...**`);

        // --- ENGINE: CONCURRENCY LIMITER ---
        // Kita kirim 50 pesan sekaligus, tapi begitu 1 selesai, 1 yang lain langsung masuk
        const pLimit = (await import('p-limit')).default; // Jika belum ada, install: npm install p-limit
        const limit = pLimit(50); // MAX 50 PROSES BERJALAN BERSAMAAN

        const tasks = data.map((line, i) => {
            return limit(async () => {
                if (!isProcessing) return;

                let parts = line.trim().split(/\s+/);
                let nama = parts[0];
                let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
                let jid = nomor + "@s.whatsapp.net";
                let msgText = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, nama);

                try {
                    // Eksekusi kirim pesan
                    await sock.sendMessage(jid, { text: msgText });
                    successCount++;

                    // Update progress setiap 10 sukses supaya Telegram gak anggap spam
                    if (successCount % 10 === 0 || successCount === total) {
                        bot.editMessageText(`🚀 **FLOWING: ${successCount}/${total}**\n${createProgressBar(successCount, total)}`, {
                            chat_id: chatId,
                            message_id: progressMsg.message_id
                        }).catch(() => {});
                    }
                } catch (e) {
                    console.log(`Gagal ke ${nomor}`);
                }
            });
        });

        // Jalankan semua task secara mengalir
        await Promise.all(tasks);

        bot.sendMessage(chatId, `🏁 **DONE!** Berhasil: ${successCount}`);
        isProcessing = false;

    } catch (e) {
        console.error(e);
        bot.sendMessage(chatId, "❌ Crash terdeteksi! Kurangi jumlah data atau upgrade RAM server.");
        isProcessing = false;
    }
});
