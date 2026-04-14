bot.onText(/\/jalan/, async (msg) => {
    const chatId = msg.chat.id;
    if (isProcessing) return;
    if (!sock) return bot.sendMessage(chatId, "Login dulu!");

    isProcessing = true;
    successCount = 0;

    try {
        const data = fs.readFileSync('nomor.txt', 'utf-8').split('\n').filter(l => l.trim().length > 5);
        const script1 = fs.readFileSync('script1.txt', 'utf-8');
        const script2 = fs.readFileSync('script2.txt', 'utf-8');
        const total = data.length;

        let progressMsg = await bot.sendMessage(chatId, `🌪️ **ULTRA STORM STARTING...**`);

        // --- TEKNIK BATCH PARALLEL (50 PESAN PER TEMBAKAN) ---
        const batchSize = 50; 
        
        for (let i = 0; i < total; i += batchSize) {
            if (!isProcessing) break;

            // Ambil potongan 50 nomor
            const currentBatch = data.slice(i, i + batchSize);
            
            // Tembak 50 nomor secara paralel (0 detik antar pesan dalam batch)
            const promises = currentBatch.map((line, index) => {
                const globalIdx = i + index;
                let parts = line.trim().split(/\s+/);
                let nama = parts[0];
                let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
                let jid = nomor + "@s.whatsapp.net";
                let selectedTemplate = (globalIdx % 2 === 0) ? script1 : script2;
                const pesan = selectedTemplate.replace(/{id}/g, nama);

                // Kirim tanpa await di dalam map agar meledak
                return sock.sendMessage(jid, { text: pesan })
                    .then(() => { successCount++; })
                    .catch(() => console.log(`Gagal: ${nomor}`));
            });

            // Jalankan batch
            await Promise.all(promises);

            // Update Progress di Telegram
            await bot.editMessageText(`🚀 **SENT: ${successCount}/${total}**\n${createProgressBar(successCount, total)}`, {
                chat_id: chatId,
                message_id: progressMsg.message_id
            }).catch(() => {});

            // Kasih jeda mikro (0.1 detik) antar batch supaya socket WA tidak putus (Limit Protection)
            if (i + batchSize < total) {
                await delay(100); 
            }
        }

        bot.sendMessage(chatId, `🏁 **BADAI SELESAI!**\n✅ Berhasil: ${successCount}`);
        isProcessing = false;

    } catch (e) { 
        console.error(e);
        bot.sendMessage(chatId, "❌ Bot Error: Periksa format nomor.txt atau koneksi."); 
        isProcessing = false; 
    }
});
