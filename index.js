const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

const TOKEN = '8657782534:AAEitxbv3VhE_X9AUMMePxRtDgAfMNqOv2k';
const bot = new TelegramBot(TOKEN, { polling: true });

// --- DATABASE REPORT ---
const REPORT_FILE = './daily_report.json';
function getReport() {
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
    if (!fs.existsSync(REPORT_FILE)) return { date: today, total: 0 };
    try {
        let data = JSON.parse(fs.readFileSync(REPORT_FILE));
        if (data.date === today) return data;
        return { date: today, total: 0 };
    } catch (e) { return { date: today, total: 0 }; }
}
function updateReport(count) {
    let data = getReport();
    data.total += count;
    fs.writeFileSync(REPORT_FILE, JSON.stringify(data));
}

// --- SERVER ---
const app = express();
app.get('/', (req, res) => res
