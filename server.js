const WebSocket = require('ws');
const express = require('express');
const http = require('http');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const openaiUrl = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";

wss.on('connection', function connection(ws) {
    const openaiWs = new WebSocket(openaiUrl, {
        headers: {
            "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
            "OpenAI-Beta": "realtime=v1",
        },
    });

    openaiWs.on('open', function open() {
        console.log("Connected to OpenAI server.");
    });

    openaiWs.on('message', function incoming(message) {
        ws.send(message);
    });

    ws.on('message', function incoming(message) {
        openaiWs.send(message);
    });
});

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));