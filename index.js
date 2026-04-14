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

        let progressMsg = await bot.sendMessage(chatId, `🚀 **NINJA MODE: STARTING...**`);
        
        for (let i = 0; i < total; i++) {
            if (!isProcessing) break;

            let line = data[i];
            let parts = line.trim().split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let jid = nomor + "@s.whatsapp.net";
            let selectedTemplate = (i % 2 === 0) ? script1 : script2;
            const pesan = selectedTemplate.replace(/{id}/g, nama);
            
            const currentIdx = i + 1;

            // --- RITME NINJA SENDER ---

            if (currentIdx <= 6) {
                // FASE 1: Chat 1-6 (Jeda 1 Detik - Pemanasan)
                await delay(1000);
                await sock.sendMessage(jid, { text: pesan });
                successCount++;
            } 
            else if (currentIdx > 6 && currentIdx <= 70) {
                // FASE 2: Chat 7-70 (MELEDAK 0 DETIK - Seperti Hujan)
                // Kita hilangkan 'await' agar dia langsung tembak tanpa nunggu
                sock.sendMessage(jid, { text: pesan })
                    .then(() => { successCount++; })
                    .catch(() => { console.log(`Gagal ke ${nomor}`); });
                
                // Beri napas CPU super kecil (5ms) agar tidak crash, tapi terasa 0 detik
                await delay(5); 
            } 
            else if (currentIdx === 71) {
                // FASE 3: Jeda 3 Detik setelah chat ke-70
                await bot.sendMessage(chatId, "⏳ *Ninja Break (3 Detik)...*");
                await delay(3000);
                
                // Kirim chat ke-71 secara normal
                await sock.sendMessage(jid, { text: pesan });
                successCount++;
            } 
            else {
                // FASE 4: Chat 72 sampai habis (MELEDAK LAGI 0 DETIK)
                sock.sendMessage(jid, { text: pesan })
                    .then(() => { successCount++; })
                    .catch(() => { console.log(`Gagal ke ${nomor}`); });
                
                await delay(5);
            }

            // Live Update Progress setiap 10 pesan sukses
            if (successCount % 10 === 0 || i === total - 1) {
                bot.editMessageText(`🚀 **NINJA FLOWING: ${successCount}/${total}**\n${createProgressBar(successCount, total)}`, {
                    chat_id: chatId,
                    message_id: progressMsg.message_id
                }).catch(() => {});
            }
        }

        // Monitoring sampai benar-benar selesai semua background process
        const monitor = setInterval(() => {
            if (successCount >= total || !isProcessing) {
                bot.sendMessage(chatId, `🏁 **MISI NINJA SELESAI!**\n✅ Total: ${successCount}`);
                isProcessing = false;
                clearInterval(monitor);
            }
        }, 1000);

    } catch (e) { 
        bot.sendMessage(chatId, "❌ Error file atau koneksi."); 
        isProcessing = false; 
    }
});
