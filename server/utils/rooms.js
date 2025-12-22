const rooms = {};

// Generate a random room ID (e.g., 4 letters/numbers)
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createRoom(hostId, hostName) {
    const roomId = generateRoomId();
    rooms[roomId] = {
        id: roomId,
        players: [], // { id, name, score }
        gameState: 'LOBBY', // LOBBY, PLAYING, ENDED
        currentDrawer: null,
        currentWord: null,
        round: 0,
        settings: {
            maxRounds: 3,
            drawTime: 60
        }
    };

    // Add host as first player
    const player = { id: hostId, name: hostName, score: 0 };
    rooms[roomId].players.push(player);

    return roomId;
}

function joinRoom(roomId, playerId, playerName) {
    const room = rooms[roomId];
    if (!room) return { error: 'Room not found' };

    // Prevent duplicate joins if relying on socket ID, but playerName maps are good
    const existingPlayer = room.players.find(p => p.id === playerId);
    if (!existingPlayer) {
        room.players.push({ id: playerId, name: playerName, score: 0 });
    }

    return { room };
}

function removePlayer(socketId) {
    let affectedRoomId = null;

    for (const [roomId, room] of Object.entries(rooms)) {
        const index = room.players.findIndex(p => p.id === socketId);
        if (index !== -1) {
            room.players.splice(index, 1);
            affectedRoomId = roomId;

            // If room empty, delete
            if (room.players.length === 0) {
                delete rooms[roomId];
                return { roomId: null, wasEmpty: true }; // Room deleted
            }
            break;
        }
    }

    return { roomId: affectedRoomId };
}

function getRoom(roomId) {
    return rooms[roomId];
}

module.exports = {
    createRoom,
    joinRoom,
    removePlayer,
    getRoom
};
