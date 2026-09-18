const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Explicitly serve index.html on the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve static files (client.js, CSS, etc.)
app.use(express.static(path.join(__dirname, '/')));

// --- In-Memory State ---
let waitingQueue = []; 
let activeRooms = new Map(); 
let connectedUsers = 0;
let reports = [];

// Staff Credentials
const STAFF = {
    'admin1': { pass: 'neonadmin', role: 'admin' },
    'mod1': { pass: 'modpass', role: 'mod' },
    'mod2': { pass: 'modpass', role: 'mod' }
};

io.on('connection', (socket) => {
    connectedUsers++;
    io.emit('online_count', connectedUsers);

    socket.on('staff_login', (data, callback) => {
        const staffAcc = STAFF[data.name];
        if (staffAcc && staffAcc.pass === data.pass) {
            callback({ success: true, role: staffAcc.role });
        } else {
            callback({ success: false, message: 'Invalid credentials' });
        }
    });

    socket.on('find_match', (userData) => {
        socket.userData = userData;
        if (!waitingQueue.includes(socket)) {
            waitingQueue.push(socket);
        }
        matchUsers();
    });

    function matchUsers() {
        if (waitingQueue.length >= 2) {
            const user1 = waitingQueue.shift();
            const user2 = waitingQueue.shift();

            const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            
            user1.join(roomId);
            user2.join(roomId);

            activeRooms.set(user1.id, roomId);
            activeRooms.set(user2.id, roomId);

            user1.emit('match_found', { roomId, partner: user2.userData });
            user2.emit('match_found', { roomId, partner: user1.userData });
        }
    }

    socket.on('send_message', (msgData) => {
        const roomId = activeRooms.get(socket.id);
        if (roomId) {
            socket.to(roomId).emit('receive_message', msgData);
        }
    });

    socket.on('typing', (isTyping) => {
        const roomId = activeRooms.get(socket.id);
        if (roomId) socket.to(roomId).emit('partner_typing', isTyping);
    });

    socket.on('send_reaction', (data) => {
        const roomId = activeRooms.get(socket.id);
        if (roomId) socket.to(roomId).emit('receive_reaction', data);
    });

    socket.on('leave_match', () => {
        handleDisconnect(socket);
    });

    socket.on('disconnect', () => {
        connectedUsers--;
        io.emit('online_count', connectedUsers);
        handleDisconnect(socket);
    });

    function handleDisconnect(socketToDisconnect) {
        const index = waitingQueue.indexOf(socketToDisconnect);
        if (index > -1) waitingQueue.splice(index, 1);

        const roomId = activeRooms.get(socketToDisconnect.id);
        if (roomId) {
            socketToDisconnect.to(roomId).emit('stranger_disconnected');
            socketToDisconnect.leave(roomId);
            activeRooms.delete(socketToDisconnect.id);
            
            const clientsInRoom = io.sockets.adapter.rooms.get(roomId);
            if (clientsInRoom) {
                for (const clientId of clientsInRoom) {
                    activeRooms.delete(clientId);
                }
            }
        }
    }

    socket.on('report_user', () => {
        const roomId = activeRooms.get(socket.id);
        if (roomId) {
            reports.push({ time: new Date().toISOString(), room: roomId, reporter: socket.userData.name });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`UniChat Server running on port ${PORT}`);
});
        }
    });

    // 2. Matchmaking
    socket.on('find_match', (userData) => {
        socket.userData = userData; // Store user data on socket instance
        
        // Ensure not already in queue
        if (!waitingQueue.includes(socket)) {
            waitingQueue.push(socket);
        }

        matchUsers();
    });

    function matchUsers() {
        if (waitingQueue.length >= 2) {
            const user1 = waitingQueue.shift();
            const user2 = waitingQueue.shift();

            const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            
            user1.join(roomId);
            user2.join(roomId);

            activeRooms.set(user1.id, roomId);
            activeRooms.set(user2.id, roomId);

            // Inform clients they matched, passing partner's data
            user1.emit('match_found', { roomId, partner: user2.userData });
            user2.emit('match_found', { roomId, partner: user1.userData });
        }
    }

    // 3. Messaging
    socket.on('send_message', (msgData) => {
        const roomId = activeRooms.get(socket.id);
        if (roomId) {
            // Send to the other person in the room
            socket.to(roomId).emit('receive_message', msgData);
        }
    });

    socket.on('typing', (isTyping) => {
        const roomId = activeRooms.get(socket.id);
        if (roomId) socket.to(roomId).emit('partner_typing', isTyping);
    });

    socket.on('send_reaction', (data) => {
        const roomId = activeRooms.get(socket.id);
        if (roomId) socket.to(roomId).emit('receive_reaction', data);
    });

    // 4. Leaving/Disconnecting
    socket.on('leave_match', () => {
        handleDisconnect(socket);
    });

    socket.on('disconnect', () => {
        connectedUsers--;
        io.emit('online_count', connectedUsers);
        handleDisconnect(socket);
    });

    function handleDisconnect(socketToDisconnect) {
        // Remove from queue if waiting
        const index = waitingQueue.indexOf(socketToDisconnect);
        if (index > -1) waitingQueue.splice(index, 1);

        // If in a room, notify partner and destroy room
        const roomId = activeRooms.get(socketToDisconnect.id);
        if (roomId) {
            socketToDisconnect.to(roomId).emit('stranger_disconnected');
            socketToDisconnect.leave(roomId);
            activeRooms.delete(socketToDisconnect.id);
            
            // Find partner and remove them from room tracking too
            const clientsInRoom = io.sockets.adapter.rooms.get(roomId);
            if (clientsInRoom) {
                for (const clientId of clientsInRoom) {
                    activeRooms.delete(clientId);
                }
            }
        }
    }

    // 5. Moderation
    socket.on('report_user', () => {
        const roomId = activeRooms.get(socket.id);
        if (roomId) {
            reports.push({ time: new Date().toISOString(), room: roomId, reporter: socket.userData.name });
            console.log("New Report logged.");
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`UniChat Server running on port ${PORT}`);
});
