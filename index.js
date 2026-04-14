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

        let progressMsg = await bot.sendMessage(chatId, `🌪️ **NINJA EXTREME START...**`);

        // --- LOGIKA PROGRESS NINJA SENDER ---
        
        for (let i = 0; i < total; i++) {
            if (!isProcessing) break;
            const currentIdx = i + 1;

            // FASE 1: Chat 1-6 (Jeda 1 detik - Pemanasan)
            if (currentIdx <= 6) {
                let parts = data[i].trim().split(/\s+/);
                let nama = parts[0];
                let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
                let jid = nomor + "@s.whatsapp.net";
                let msgText = (i % 2 === 0 ? s1 : s2).replace(/{id}/g, nama);

                await delay(1000);
                await sock.sendMessage(jid, { text: msgText });
                successCount++;
            } 
            
            // FASE 2 & 4: Mode Meledak (Batch 30 chat sekaligus)
            else {
                // Jika tepat di nomor 71, kasih jeda 3 detik sesuai permintaan
                if (currentIdx === 71) {
                    await bot.sendMessage(chatId, "⏳ *Jeda Ninja 3 Detik...*");
                    await delay(3000);
                }

                // Ambil batch 30 nomor sekaligus
                const batchSize = 30;
                const batch = data.slice(i, i + batchSize);
                
                // Eksekusi Batch Tanpa Jeda (Hujan Ngalir)
                await Promise.all(batch.map(async (line, batchIdx) => {
                    const globalIdx = i + batchIdx;
                    if (globalIdx >= total) return;

                    let parts = line.trim().split(/\s+/);
                    let nama = parts[0];
                    let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
                    let jid = nomor + "@s.whatsapp.net";
                    let msgText = (globalIdx % 2 === 0 ? s1 : s2).replace(/{id}/g, nama);

                    try {
                        await sock.sendMessage(jid, { text: msgText });
                        successCount++;
                    } catch (e) {
                        console.log(`Gagal: ${nomor}`);
                    }
                }));

                // Lompatkan index 'i' sebanyak batch yang sudah dikirim
                i += (batch.length - 1);
            }

            // Update Progress ke Telegram (Dibatasi agar bot tidak hang)
            if (successCount % 10 === 0 || successCount === total) {
                bot.editMessageText(`🚀 **STATUS: ${successCount}/${total}**\n${createProgressBar(successCount, total)}`, {
                    chat_id: chatId,
                    message_id: progressMsg.message_id
                }).catch(() => {});
            }
        }

        bot.sendMessage(chatId, `🏁 **DONE!** Berhasil: ${successCount}`);
        isProcessing = false;

    } catch (e) {
        console.error(e);
        bot.sendMessage(chatId, "❌ Terjadi kesalahan teknis.");
        isProcessing = false;
    }
});
