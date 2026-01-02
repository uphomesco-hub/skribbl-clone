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

        // ICE servers for NAT traversal
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ];
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
                debug: 2,
                config: {
                    iceServers: this.iceServers
                }
            });

            this.peer.on('open', (id) => {
                console.log('Room created with code:', id);
                this.setupHostListeners();
                resolve(this.roomCode);
            });

            this.peer.on('error', (err) => {
                console.error('Peer error:', err);
                if (err.type === 'unavailable-id') {
                    // Room code taken, try again with new code
                    this.peer.destroy();
                    this.roomCode = this.generateRoomCode();
                    this.playerId = this.roomCode;
                    this.peer = new Peer(this.roomCode, {
                        debug: 2,
                        config: {
                            iceServers: this.iceServers
                        }
                    });
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

            let resolved = false;
            let retryCount = 0;
            const maxRetries = 3;

            const attemptConnection = () => {
                console.log(`Attempting to connect to room: ${this.roomCode} (attempt ${retryCount + 1})`);

                this.peer = new Peer(this.playerId + '_' + retryCount, {
                    debug: 2,
                    config: {
                        iceServers: this.iceServers
                    }
                });

                this.peer.on('open', () => {
                    console.log('Peer open, connecting to room:', this.roomCode);

                    const conn = this.peer.connect(this.roomCode, {
                        reliable: true,
                        serialization: 'json'
                    });

                    conn.on('open', () => {
                        if (!resolved) {
                            resolved = true;
                            console.log('Connected to host successfully');
                            this.hostConnection = conn;
                            this.setupClientListeners(conn);
                            resolve(true);
                        }
                    });

                    conn.on('error', (err) => {
                        console.error('Connection error:', err);
                        if (!resolved) {
                            retryCount++;
                            if (retryCount < maxRetries) {
                                this.peer.destroy();
                                setTimeout(attemptConnection, 1000);
                            } else {
                                resolved = true;
                                reject(new Error('Could not connect to room after ' + maxRetries + ' attempts'));
                            }
                        }
                    });
                });

                this.peer.on('error', (err) => {
                    console.error('Peer error:', err);
                    if (!resolved) {
                        if (err.type === 'peer-unavailable') {
                            resolved = true;
                            reject(new Error('Room does not exist or host is offline'));
                        } else if (retryCount < maxRetries) {
                            retryCount++;
                            this.peer.destroy();
                            setTimeout(attemptConnection, 1000);
                        } else {
                            resolved = true;
                            reject(err);
                        }
                    }
                });

                // Timeout for this attempt
                setTimeout(() => {
                    if (!resolved && !this.hostConnection) {
                        retryCount++;
                        if (retryCount < maxRetries) {
                            console.log('Connection attempt timed out, retrying...');
                            this.peer.destroy();
                            setTimeout(attemptConnection, 500);
                        } else {
                            resolved = true;
                            reject(new Error('Connection timeout - room may not exist or host is behind a firewall'));
                        }
                    }
                }, 8000);
            };

            attemptConnection();
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
