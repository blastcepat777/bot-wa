const TelegramBot = require('node-telegram-bot-api');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

const token = '8657782534:AAF_1CDS_6tdqw8bIKwKEticsAdz9xxxL-w'; // token BotFather kamu
const bot = new TelegramBot(token, { polling: true });

let sock;

async function startSock(chatId=null){
    const { state, saveCreds } = await useMultiFileAuthState('session');
    sock = makeWASocket({ auth: state });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, qr }) => {
        if(qr){
            qrcode.generate(qr, { small:true });
            if(chatId) bot.sendMessage(chatId, "Scan QR ini di WhatsApp:\n"+qr);
        }
        if(connection==='open'){
            if(chatId) bot.sendMessage(chatId,"✅ WhatsApp Connected!");
        }
    });
}

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