bot.onText(/\/start/, msg=>{
    bot.sendMessage(msg.chat.id,"Menu:",{
        reply_markup:{
            inline_keyboard:[
                [{text:"🔗 Connect WhatsApp", callback_data:"connect"}],
                [{text:"📤 Blast", callback_data:"blast"}]
            ]
        }
    });
});

bot.on('callback_query', q=>{
    const chatId = q.message.chat.id;
    if(q.data==='connect') startSock(chatId);
    if(q.data==='blast') bot.sendMessage(chatId,"Kirim nomor & pesan format: 628xxx|pesan");
    bot.answerCallbackQuery(q.id);
});

bot.on('message', async msg=>{
    if(msg.text.includes("|")){
        const [number, message] = msg.text.split("|");
        try{
            await sock.sendMessage(number+"@s.whatsapp.net",{text:message});
            bot.sendMessage(msg.chat.id,"✅ Pesan terkirim!");
        }catch(err){
            bot.sendMessage(msg.chat.id,"❌ Gagal kirim");
        }
    }
});

console.log("🤖 Bot Telegram jalan...");