const WebSocket = require('ws');
const express = require('express');
const http = require('http');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const openaiUrl = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";

wss.on('connection', function connection(ws) {
    console.log('wss client connected');

    const openaiWs = new WebSocket(openaiUrl, {
        headers: {
            "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
            "OpenAI-Beta": "realtime=v1",
        },
    });

    openaiWs.on('open', ()=> {
        console.log("openaiWs connected");
    });

    openaiWs.on('message', function incoming(message) {
        ws.send(JSON.stringify(JSON.parse(message.toString())));
        console.log('send message to wss client');
    });

    ws.on('message', function incoming(message) {
        openaiWs.send(JSON.stringify(JSON.parse(message.toString())));
        console.log('send message to openaiWs', JSON.stringify(JSON.parse(message.toString())));
    });

    ws.on('close', function close() {
        console.log('wss client disconnected');
        openaiWs.close();
    });

    openaiWs.on('close', function close() {
        console.log('openaiWs disconnected');
        ws.close();
    });
});

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`服务器运行在端口 ${PORT}`));