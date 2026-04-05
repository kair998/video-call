const WebSocket = require('ws');
const express = require('express');
const path = require('path');

const app = express();
app.use(express.static('public'));  // 提供静态页面

const server = app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});

const wss = new WebSocket.Server({ server });

// 存储房间内的连接
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
                
                if (!rooms.has(currentRoom)) {
                    rooms.set(currentRoom, []);
                }
                
                const roomClients = rooms.get(currentRoom);
                roomClients.push(ws);
                
                // 通知房间内其他人有新成员加入
                roomClients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'peer-joined',
                            name: clientName
                        }));
                    }
                });
                break;
                
            case 'offer':
            case 'answer':
            case 'ice-candidate':
                // 转发信令给目标客户端
                const targetWs = rooms.get(data.room)?.find(c => c !== ws);
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(JSON.stringify(data));
                }
                break;
                
            case 'leave':
                if (rooms.has(currentRoom)) {
                    const roomClients = rooms.get(currentRoom);
                    const index = roomClients.indexOf(ws);
                    if (index !== -1) roomClients.splice(index, 1);
                    
                    roomClients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'peer-left'
                            }));
                        }
                    });
                }
                break;
        }
    });
    
    ws.on('close', () => {
        if (rooms.has(currentRoom)) {
            const roomClients = rooms.get(currentRoom);
            const index = roomClients.indexOf(ws);
            if (index !== -1) roomClients.splice(index, 1);
            
            roomClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'peer-left' }));
                }
            });
        }
    });
});