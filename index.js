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

        let progressMsg = await bot.sendMessage(chatId, `🚀 **NINJA EXTREME ACTIVE (Target 400+)...**\n${createProgressBar(0, total)}`);
        
        for (let i = 0; i < total; i++) {
            if (!isProcessing) break;

            let line = data[i];
            let parts = line.trim().split(/\s+/);
            let nama = parts[0];
            let nomor = parts[parts.length - 1].replace(/[^0-9]/g, '');
            let jid = nomor + "@s.whatsapp.net";
            let currentIdx = i + 1;

            // --- STRATEGI DUAL SCRIPT (ROTASI) ---
            // Bergantian ambil dari script1 dan script2 agar pola pesan berubah-ubah
            let selectedTemplate = (i % 2 === 0) ? script1 : script2;

            // --- LOGIKA RITME ANTI-BANNED ---
            if (currentIdx <= 6) {
                await delay(1000); // Pemanasan wajib 1 detik
            } 
            // Chat 7 - 70: MODE MELEDAK 0 DETIK
            
            if (currentIdx === 71) {
                await bot.sendMessage(chatId, "⏳ *Jeda Napas 3 Detik (Bypass Sensor)...*");
                await delay(3000);
            }

            // Chat 72 - Seterusnya: KEMBALI MELEDAK 0 DETIK

            try {
                const pesan = selectedTemplate.replace(/{id}/g, nama);
                
                // Trik: Kirim sinyal 'composing' (mengetik)
                await sock.sendPresenceUpdate('composing', jid);
                
                // Kasih jeda mikroskopis 15ms agar Railway tidak kaget
                await delay(15); 
                
                await sock.sendMessage(jid, { text: pesan });
                successCount++;

                // Update Telegram setiap 10 pesan agar lebih ringan
                if (successCount % 10 === 0 || successCount === total) {
                    await bot.editMessageText(`🚀 **NINJA PROGRESS: ${successCount}/${total}**\n${createProgressBar(successCount, total)}`, {
                        chat_id: chatId,
                        message_id: progressMsg.message_id
                    }).catch(() => {});
                }
                
            } catch (err) {
                console.log(`Gagal ke ${nomor}, lanjut...`);
                continue; 
            }
        }
        bot.sendMessage(chatId, `🏁 **MISI SELESAI!**\nTotal Berhasil: ${successCount}\nSemoga Tembus BADAK! 🦏`);
        isProcessing = false;
    } catch (e) { 
        bot.sendMessage(chatId, "❌ Cek file nomor.txt, script1.txt, dan script2.txt"); 
        isProcessing = false; 
    }
});
