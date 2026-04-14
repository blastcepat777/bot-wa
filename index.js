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

        let progressMsg = await bot.sendMessage(chatId, `🌪️ **ULTRA STORM MODE ACTIVE...**\nTarget: ${total} nomor.`);

        for (let i = 0; i < total; i++) {
            if (!isProcessing) break;

            const currentIdx = i + 1;
            
            // Logika Ritme (Hanya Pemanasan Singkat)
            if (currentIdx <= 4) {
                await delay(300); // Pemanasan 4 chat pertama agar socket stabil
            }

            let line = data[i];
            let parts = line.trim().split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let jid = nomor + "@s.whatsapp.net";
            let selectedTemplate = (i % 2 === 0) ? script1 : script2;
            const pesan = selectedTemplate.replace(/{id}/g, nama);

            // --- EKSEKUSI TANPA JEDA (FIRE & FORGET) ---
            // Kita hilangkan 'await' supaya bot tidak menunggu respon server WA
            sock.sendMessage(jid, { text: pesan }).then(() => {
                successCount++;
                // Update progress ke Telegram setiap 10 pesan agar tidak kena spam-limit Telegram
                if (successCount % 10 === 0 || successCount === total) {
                    bot.editMessageText(`🌪️ **SENT: ${successCount}/${total}**\n${createProgressBar(successCount, total)}`, {
                        chat_id: chatId,
                        message_id: progressMsg.message_id
                    }).catch(() => {});
                }
            }).catch((err) => console.log(`Gagal kirim ke: ${nomor}`));

            // --- BATCHING INTERNAL ---
            // Supaya script tidak crash karena memori penuh (overload), 
            // setiap 50 pesan kita beri jeda mikro (10ms) untuk melepas antrean CPU.
            if (currentIdx % 50 === 0) {
                await delay(10); 
            }
        }

        // Monitoring selesai
        const checkDone = setInterval(() => {
            if (successCount >= total || !isProcessing) {
                bot.sendMessage(chatId, `🏁 **BADAI SELESAI!**\n✅ Total Terkirim: ${successCount}`);
                isProcessing = false;
                clearInterval(checkDone);
            }
        }, 1000);

    } catch (e) { 
        bot.sendMessage(chatId, "❌ Error dalam menjalankan badai."); 
        isProcessing = false; 
    }
});
