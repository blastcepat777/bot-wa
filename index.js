// --- FUNGSI FILTER: LANGSUNG SAVE KE FILE TIAP 1 NOMOR ---
async function prosesFilter(chatId) {
    if (!sock) return bot.sendMessage(chatId, "⚠️ Hubungkan WA dulu.");
    if (isProcessing) return;
    
    let daftar = ambilDaftarNomor();
    if (daftar.length === 0) return bot.sendMessage(chatId, "❌ nomor.txt kosong atau salah format.");

    isProcessing = true;
    let hasilFilterTemp = []; // Penampung lokal
    
    // Reset file backup di awal agar tidak campur dengan data lama
    if (fs.existsSync(FILE_TEMP_FILTER)) fs.unlinkSync(FILE_TEMP_FILTER);

    let statusMsg = await bot.sendMessage(chatId, `🔍 **MEMULAI FILTER...**`);

    for (let i = 0; i < daftar.length; i++) {
        if (!isProcessing) break; 
        const target = daftar[i];
        
        try {
            // Kita tidak hanya kirim presence, tapi pastikan data masuk ke array
            hasilFilterTemp.push(target);
            
            // PAKSA TULIS KE FILE DETIK INI JUGA
            fs.writeFileSync(FILE_TEMP_FILTER, JSON.stringify(hasilFilterTemp)); 
            
            // Log ke console untuk memastikan script bekerja
            console.log(`[FILTER] Berhasil memproses: ${target.nomor}`);
        } catch (e) {
            console.log(`[ERROR] Gagal pada nomor ${target.nomor}: ${e.message}`);
        }

        const persen = Math.round(((i + 1) / daftar.length) * 100);
        if (i % 2 === 0 || i === daftar.length - 1) {
            try {
                await bot.editMessageText(
                    `🔍 **PROGRESS FILTER:** ${persen}%\n_Membuka chat: ${target.nomor}_`, 
                    { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
                );
            } catch (e) {}
        }
        await new Promise(res => setTimeout(res, JEDA_FILTER));
    }

    isProcessing = false;
    
    // Verifikasi akhir: Baca langsung dari file yang baru ditulis
    const cekData = muatProgress(); 
    
    if (cekData.length > 0) {
        bot.sendMessage(chatId, `✅ **FILTER SELESAI**\nTerdeteksi **${cekData.length}** nomor valid di database.\n\nKlik 👉 /jalankan`);
    } else {
        bot.sendMessage(chatId, `❌ **DATA MASIH 0!**\nPeriksa apakah file \`nomor.txt\` Anda berisi format: \`Nama Nomor\` (dipisah spasi/tab).`);
    }
}

// --- FUNGSI JALANKAN: AMBIL DATA DARI FILE, BUKAN MEMORI ---
async function prosesJalankan(chatId) {
    if (!sock) return bot.sendMessage(chatId, "⚠️ WA tidak terhubung.");
    
    // JANGAN ambil dari variabel 'nomorSudahFilter', langsung baca file
    const dataSiapBlast = muatProgress();
    
    if (dataSiapBlast.length === 0) {
        return bot.sendMessage(chatId, "❌ Gagal: Database filter kosong (0). Silakan ulangi /filter.");
    }

    isProcessing = true;
    let sukses = 0;
    let statusMsg = await bot.sendMessage(chatId, `🚀 **BLASTING START...**\nTarget: ${dataSiapBlast.length} nomor`);

    for (let i = 0; i < dataSiapBlast.length; i++) {
        if (!isProcessing) break;
        const target = dataSiapBlast[i];
        
        try {
            await sock.sendMessage(jidNormalizedUser(target.nomor + "@s.whatsapp.net"), { 
                image: fs.readFileSync(FILE_GAMBAR), 
                caption: rakitPesan(target.nama) 
            });
            sukses++;
        } catch (err) {
            console.log(`Gagal kirim ke ${target.nomor}`);
        }
        
        const persen = Math.round(((i + 1) / dataSiapBlast.length) * 100);
        try {
            await bot.editMessageText(
                `🚀 **PROGRESS BLAST:** ${persen}%\n✅ Berhasil: ${sukses}/${dataSiapBlast.length}`, 
                { chat_id: chatId, message_id: statusMsg.message_id }
            );
        } catch (e) {}

        await new Promise(res => setTimeout(res, Math.floor(Math.random() * (JEDA_BLAST_MAX - JEDA_BLAST_MIN + 1) + JEDA_BLAST_MIN)));
    }

    isProcessing = false;
    bot.sendMessage(chatId, `🏁 **BLAST SELESAI**\nTotal terkirim: **${sukses}**`);
}
