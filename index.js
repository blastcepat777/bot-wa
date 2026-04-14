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

        let progressMsg = await bot.sendMessage(chatId, `🚀 **NINJA TURBO ACTIVE...**\n${createProgressBar(0, total)}`);
        
        for (let i = 0; i < total; i++) {
            if (!isProcessing) break;

            let line = data[i];
            let parts = line.trim().split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let jid = nomor + "@s.whatsapp.net";
            let selectedTemplate = (i % 2 === 0) ? script1 : script2;
            let currentIdx = i + 1; // Urutan chat dimulai dari 1

            // --- LOGIKA RITME SESUAI PERMINTAAN ---

            if (currentIdx <= 6) {
                // 1. Chat 1-6: Mode 1 detik tanpa jeda tambahan
                await delay(1000);
            } 
            else if (currentIdx === 7) {
                // Jeda 1 detik tepat sebelum mengirim chat ke-7
                await bot.sendMessage(chatId, "⏳ *Jeda 1 detik (Pemanasan selesai)...*");
                await delay(1000);
            }

            if (currentIdx >= 7 && currentIdx <= 19) {
                // 2. Chat 7-19: Mode 1 detik super fast
                await delay(1000);
            }
            else if (currentIdx === 20) {
                // Jeda 2 detik tepat sebelum mengirim chat ke-20
                await bot.sendMessage(chatId, "⏳ *Jeda 2 detik... SIAP MELEDAK!*");
                await delay(2000);
            }

            // 3. Mulai Chat 20 ke atas: Mode Ultra Fast 0 detik tanpa delay sama sekali
            // (Logika: Jika currentIdx >= 20, tidak ada fungsi delay() yang dijalankan)

            try {
                const pesan = selectedTemplate.replace(/{id}/g, nama);
                
                // Typing kilat 20ms agar terlihat natural oleh sistem WA
                await sock.sendPresenceUpdate('composing', jid);
                await delay(20); 
                
                await sock.sendMessage(jid, { text: pesan });
                successCount++;

                // Update status ke Telegram setiap 5 pesan
                if (successCount % 5 === 0 || successCount === total) {
                    await bot.editMessageText(`🚀 **NINJA BLAST RUNNING...**\n${createProgressBar(successCount, total)}`, {
                        chat_id: chatId,
                        message_id: progressMsg.message_id
                    }).catch(() => {});
                }
                
            } catch (err) {
                console.log(`Gagal kirim ke ${jid}, lanjut terus...`);
                continue; 
            }
        }
        bot.sendMessage(chatId, `🏁 **MISI SELESAI!**\nNomor di nomor.txt habis total.\nBerhasil: ${successCount}`);
        isProcessing = false;
    } catch (e) { 
        bot.sendMessage(chatId, "❌ Gagal membaca file atau data terhenti."); 
        isProcessing = false; 
    }
});
