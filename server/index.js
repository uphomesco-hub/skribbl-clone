const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity in dev
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;

const { createRoom, joinRoom, removePlayer, getRoom } = require('./utils/rooms');

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('create_room', ({ username }) => {
        const roomId = createRoom(socket.id, username);
        socket.join(roomId);
        // Send back room info
        socket.emit('room_created', { roomId, room: getRoom(roomId) });
        console.log(`Room created: ${roomId} by ${username}`);
    });

    socket.on('join_room', ({ roomId, username }) => {
        const result = joinRoom(roomId, socket.id, username);
        if (result.error) {
            socket.emit('error', { message: result.error });
            return;
        }

        socket.join(roomId);
        // Notify user they joined
        socket.emit('room_joined', { roomId, room: result.room });
        // Notify others in room
        socket.to(roomId).emit('player_joined', { player: { id: socket.id, name: username, score: 0 } });
        console.log(`${username} joined room ${roomId}`);
    });

    socket.on('draw_line', ({ roomId, x0, y0, x1, y1, color, width }) => {
        // Broadcast to others in the room
        socket.to(roomId).emit('draw_line', { x0, y0, x1, y1, color, width });
    });

    socket.on('clear_canvas', ({ roomId }) => {
        socket.to(roomId).emit('clear_canvas');
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);

        const { roomId } = removePlayer(socket.id);
        if (roomId) {
            io.to(roomId).emit('player_left', { playerId: socket.id });
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
