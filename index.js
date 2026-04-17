engines[id].sock.ev.on('connection.update', async (u) => {
        const { connection, lastDisconnect } = u;

        if (connection === 'open') {
            engines[id].isInitializing = false;
            bot.sendMessage(chatId, `${engines[id].color} **ENGINE ${id} ONLINE** ✅`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `🔍 FILTER ${id}`, callback_data: `filter_${id}` }],
                        [{ text: "❌ CANCEL", callback_data: 'batal' }]
                    ]
                }
            });
        }

        if (connection === 'close') {
            engines[id].isInitializing = false;
            const status = lastDisconnect?.error?.output?.statusCode;
            if (status !== DisconnectReason.loggedOut) {
                setTimeout(() => initWA(chatId, id, phoneNumber), 5000);
            }
        }
    });
}

// --- HANDLER CALLBACK ---
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data === 'cmd_login') {
        bot.sendMessage(chatId, "🚀 Pilih Engine untuk Pairing:", {
            reply_markup: { inline_keyboard: [[{ text: "🌪 PAIR 1", callback_data: 'login_1' }, { text: "🌊 PAIR 2", callback_data: 'login_2' }]] }
        });
    }

    if (data.startsWith('login_')) {
        const id = data.split('_')[1];
        engines[id].waitingNumber = true;
        bot.sendMessage(chatId, `${engines[id].color} **INPUT NOMOR ENGINE ${id}**\n\nSilahkan ketik nomor WA Bos.\nContoh: \`628123456789\``);
    }

    if (data.startsWith('filter_')) {
        const id = data.split('_')[1];
        if (!engines[id].sock) return bot.sendMessage(chatId, `❌ Login dulu!`);
        bot.sendMessage(chatId, `${engines[id].color} **FILTERING...**`);
        try {
            const lines = fs.readFileSync(engines[id].file, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            let aktif = [];
            for (const line of lines) {
                const num = line.replace(/[^0-9]/g, '');
                const [res] = await engines[id].sock.onWhatsApp(num).catch(() => [null]);
                if (res?.exists) aktif.push(line.trim());
            }
            fs.writeFileSync(`aktif_${id}.txt`, aktif.join('\n'));
            bot.sendMessage(chatId, `✅ **FILTER ${id} OK**\nAktif: ${aktif.length}`, {
                reply_markup: { inline_keyboard: [[{ text: `🚀 BLAST ${id}`, callback_data: `jalan_${id}` }]] }
            });
        } catch (e) { bot.sendMessage(chatId, `❌ File ${engines[id].file} tidak ada.`); }
    }

    if (data.startsWith('jalan_')) {
        const id = data.split('_')[1];
        try {
            const numbers = fs.readFileSync(`aktif_${id}.txt`, 'utf-8').split('\n').filter(l => l.trim().length > 5);
            const pesanBlast = fs.readFileSync(engines[id].script, 'utf-8'); 
            bot.sendMessage(chatId, `🚀 **ENGINE ${id} BLASTING...**`);
            for (let line of numbers) {
                const num = line.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
                await engines[id].sock.sendMessage(num, { text: pesanBlast }).catch(() => {});
                stats.totalBlast++; stats.hariIni++;
            }
            bot.sendMessage(chatId, `✅ **ENGINE ${id} SELESAI!**`);
        } catch (e) { bot.sendMessage(chatId, "❌ Gagal Blast."); }
    }

    if (data === 'batal') await safeDelete(chatId, q.message.message_id);
    bot.answerCallbackQuery(q.id);
});

// --- HANDLER PESAN ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    for (let id in engines) {
        if (engines[id].waitingNumber && text.match(/^[0-9]+$/)) {
            engines[id].waitingNumber = false;
            bot.sendMessage(chatId, `⏳ Menyiapkan Kode Pairing untuk Engine ${id}...`);
            initWA(chatId, id, text);
            return;
        }
    }

    if (text === "♻️ RESTART") {
        await bot.sendMessage(chatId, "♻️ **RESTARTING...**", {
            reply_markup: { inline_keyboard: [[{ text: "🚀 LOGIN", callback_data: 'cmd_login' }]] }
        });
        setTimeout(() => process.exit(0), 1000);
    }

    if (text === "📊 LAPORAN HARIAN") bot.sendMessage(chatId, `📊 Hari Ini: ${stats.hariIni}\nTotal: ${stats.totalBlast}`, menuBawah);
    
    if (text === "🛡️ CEK STATUS WA") {
        let s = "🛡️ **STATUS:**\n";
        for (let i=1; i<=2; i++) s += `${engines[i].color} E${i}: ${engines[i].sock?.user ? "✅" : "❌"}\n`;
        bot.sendMessage(chatId, s, menuBawah);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, `🌪️ **NINJA STORM ENGINE READY**`, menuBawah));
bot.onText(/\/login/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 Pilih Engine untuk Pairing:", {
        reply_markup: { inline_keyboard: [[{ text: "🌪 PAIR 1", callback_data: 'login_1' }, { text: "🌊 PAIR 2", callback_data: 'login_2' }]] }
    });
});
