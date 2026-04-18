const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

process.on('uncaughtException', (err) => console.log('Error: ', err.message));
process.on('unhandledRejection', (reason) => console.log('Rejection: ', reason));

// --- SISTEM STATISTIK DENGAN WAKTU WIB ---
let stats = { 
    totalBlast: 0, 
    dailyBlast: 0, 
    lastBlastTime: "-", 
    lastDate: new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }) 
};

// Fungsi cek ganti hari untuk reset harian
const checkDateReset = () => {
    const currentDate = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
    if (stats.lastDate !== currentDate) {
        stats.dailyBlast = 0;
        stats.lastDate = currentDate;
    }
};

const getWIBTime = () => {
    return new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) + " WIB";
};

let engines = {
    1: { sock: null, lastQrMsgId: null, session: './session_1', file: 'nomor1.txt', color: '🌪', menuSent: false, isInitializing: false },
    2: { sock: null, lastQrMsgId: null, session: './session_2', file: 'nomor2.txt', color: '🌊', menuSent: false, isInitializing: false }
};

// --- KEYBOARD PERMANEN
