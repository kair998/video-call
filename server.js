const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const express = require('express');
const path = require('path');

const app = express();
app.use(express.static('public'));

// 读取证书文件
const options = {
    key: fs.readFileSync('/root/ssl/key.pem'),   // 改成你的 key 路径
    cert: fs.readFileSync('/root/ssl/cert.pem')  // 改成你的 cert 路径
};

// 创建 HTTPS 服务器
const server = https.createServer(options, app);

// WebSocket 也需要走这个服务器
const wss = new WebSocket.Server({ server });

// 信令逻辑（和之前一样）
const rooms = new Map();

wss.on('connection', (ws) => {
    let currentRoom = null;
    let clientName = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        switch(data.type) {
            case 'join':
                currentRoom = data.room;
                clientName = data.name;
                if (!rooms.has(currentRoom)) rooms.set(currentRoom, []);
                const roomClients = rooms.get(currentRoom);
                roomClients.push(ws);
                for (let i = 0; i < roomClients.length; i++) {
                    const client = roomClients[i];
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'peer-joined', name: clientName }));
                    }
                }
                break;
            case 'offer':
            case 'answer':
            case 'ice-candidate':
                if (rooms.has(currentRoom)) {
                    const roomClients = rooms.get(currentRoom);
                    for (let i = 0; i < roomClients.length; i++) {
                        const targetWs = roomClients[i];
                        if (targetWs !== ws && targetWs.readyState === WebSocket.OPEN) {
                            targetWs.send(JSON.stringify(data));
                            break;
                        }
                    }
                }
                break;
            case 'leave':
                if (currentRoom && rooms.has(currentRoom)) {
                    const roomClients = rooms.get(currentRoom);
                    const index = roomClients.indexOf(ws);
                    if (index !== -1) roomClients.splice(index, 1);
                    for (let i = 0; i < roomClients.length; i++) {
                        const client = roomClients[i];
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'peer-left' }));
                        }
                    }
                }
                break;
        }
    });
    
    ws.on('close', () => {
        if (currentRoom && rooms.has(currentRoom)) {
            const roomClients = rooms.get(currentRoom);
            const index = roomClients.indexOf(ws);
            if (index !== -1) roomClients.splice(index, 1);
            for (let i = 0; i < roomClients.length; i++) {
                const client = roomClients[i];
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'peer-left' }));
                }
            }
        }
    });
});

// 监听 443 端口（HTTPS 默认端口）
server.listen(443, '0.0.0.0', () => {
    console.log('HTTPS Server running on https://0.0.0.0:443');
});