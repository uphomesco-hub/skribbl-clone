// ===== PeerJS Connection Manager =====
// Handles all peer-to-peer communication using PeerJS WebRTC

class PeerManager {
    constructor() {
        this.peer = null;
        this.connections = new Map(); // peerId -> connection
        this.isHost = false;
        this.roomCode = null;
        this.playerId = null;
        this.hostConnection = null;
        
        this.onPlayerJoin = null;
        this.onPlayerLeave = null;
        this.onMessage = null;
        this.onConnectionError = null;
        this.onConnected = null;
    }

    // Generate a random 6-character room code
    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // Create a new room as host
    async createRoom() {
        return new Promise((resolve, reject) => {
            this.roomCode = this.generateRoomCode();
            this.isHost = true;
            this.playerId = this.roomCode;
            
            this.peer = new Peer(this.roomCode, {
                debug: 1
            });
            
            this.peer.on('open', (id) => {
                console.log('Room created with code:', id);
                this.setupHostListeners();
                resolve(this.roomCode);
            });
            
            this.peer.on('error', (err) => {
                console.error('Peer error:', err);
                if (err.type === 'unavailable-id') {
                    // Room code taken, try again
                    this.roomCode = this.generateRoomCode();
                    this.peer.reconnect();
                } else {
                    reject(err);
                }
            });
        });
    }

    // Join an existing room
    async joinRoom(roomCode) {
        return new Promise((resolve, reject) => {
            this.roomCode = roomCode.toUpperCase();
            this.isHost = false;
            this.playerId = 'player_' + Math.random().toString(36).substr(2, 9);
            
            this.peer = new Peer(this.playerId, {
                debug: 1
            });
            
            this.peer.on('open', () => {
                console.log('Connecting to room:', this.roomCode);
                
                const conn = this.peer.connect(this.roomCode, {
                    reliable: true
                });
                
                conn.on('open', () => {
                    console.log('Connected to host');
                    this.hostConnection = conn;
                    this.setupClientListeners(conn);
                    resolve(true);
                });
                
                conn.on('error', (err) => {
                    console.error('Connection error:', err);
                    reject(new Error('Could not connect to room'));
                });
                
                // Timeout for connection
                setTimeout(() => {
                    if (!this.hostConnection) {
                        reject(new Error('Connection timeout - room may not exist'));
                    }
                }, 10000);
            });
            
            this.peer.on('error', (err) => {
                console.error('Peer error:', err);
                reject(err);
            });
        });
    }

    // Setup listeners for host
    setupHostListeners() {
        this.peer.on('connection', (conn) => {
            console.log('New connection from:', conn.peer);
            
            conn.on('open', () => {
                this.connections.set(conn.peer, conn);
                if (this.onPlayerJoin) {
                    this.onPlayerJoin(conn.peer);
                }
                
                conn.on('data', (data) => {
                    this.handleMessage(conn.peer, data);
                });
                
                conn.on('close', () => {
                    this.connections.delete(conn.peer);
                    if (this.onPlayerLeave) {
                        this.onPlayerLeave(conn.peer);
                    }
                });
            });
        });

        this.peer.on('disconnected', () => {
            console.log('Disconnected from signaling server, attempting reconnect...');
            this.peer.reconnect();
        });
    }

    // Setup listeners for client
    setupClientListeners(conn) {
        conn.on('data', (data) => {
            if (this.onMessage) {
                this.onMessage(data);
            }
        });
        
        conn.on('close', () => {
            console.log('Disconnected from host');
            if (this.onConnectionError) {
                this.onConnectionError(new Error('Host disconnected'));
            }
        });
        
        if (this.onConnected) {
            this.onConnected();
        }
    }

    // Handle incoming messages (host only)
    handleMessage(senderId, data) {
        if (this.onMessage) {
            this.onMessage({ ...data, senderId });
        }
    }

    // Send message (works for both host and client)
    send(data) {
        if (this.isHost) {
            // Host broadcasts to all connections
            this.broadcast(data);
        } else if (this.hostConnection) {
            // Client sends to host
            this.hostConnection.send(data);
        }
    }

    // Broadcast to all connected peers (host only)
    broadcast(data, excludeId = null) {
        if (!this.isHost) return;
        
        this.connections.forEach((conn, peerId) => {
            if (peerId !== excludeId && conn.open) {
                conn.send(data);
            }
        });
    }

    // Send to specific peer (host only)
    sendTo(peerId, data) {
        if (!this.isHost) return;
        
        const conn = this.connections.get(peerId);
        if (conn && conn.open) {
            conn.send(data);
        }
    }

    // Get connected player count
    getPlayerCount() {
        return this.connections.size + (this.isHost ? 1 : 0);
    }

    // Disconnect and cleanup
    disconnect() {
        if (this.peer) {
            this.peer.destroy();
        }
        this.connections.clear();
        this.hostConnection = null;
        this.isHost = false;
        this.roomCode = null;
    }
}

export default PeerManager;
