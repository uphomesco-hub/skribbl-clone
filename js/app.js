// ===== Main Application =====
// Ties together all modules and handles the game flow

import PeerManager from './peer.js';
import CanvasManager from './canvas.js';
import GameManager from './game.js';
import ChatManager from './chat.js';
import UIManager from './ui.js';

class SkribblApp {
    constructor() {
        this.peer = new PeerManager();
        this.canvas = new CanvasManager('drawing-canvas');
        this.game = new GameManager();
        this.chat = new ChatManager('chat-messages', 'chat-input', 'send-chat-btn');
        this.ui = new UIManager();

        this.playerName = '';
        this.isHost = false;
        this.publicWordDisplay = '';
        this.isEditingSettings = false;

        this.init();
    }

    async init() {
        this.initVersionBadge();

        // Load words
        await this.game.loadWords();

        // Check for room code in URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomCode = urlParams.get('room');

        if (roomCode) {
            document.getElementById('room-code-input').value = roomCode;
            document.getElementById('join-input-section').classList.remove('hidden');
        }

        // Load saved name
        const savedName = localStorage.getItem('skribbl_name');
        if (savedName) {
            document.getElementById('player-name').value = savedName;
        }

        this.setupEventListeners();
        this.setupPeerCallbacks();
        this.setupGameCallbacks();
        this.setupCanvasCallbacks();
        this.setupChatCallbacks();
        this.ui.setupMobileSidebars();
    }

    initVersionBadge() {
        const versionEl = document.getElementById('app-version');
        if (!versionEl) return;

        const setText = (text) => {
            versionEl.textContent = text;
        };

        // Fallback (may be inaccurate on some hosts).
        if (document.lastModified) {
            const d = new Date(document.lastModified);
            if (!Number.isNaN(d.getTime())) setText(d.toLocaleString());
        }

        // Prefer server-provided Last-Modified/ETag (updates automatically on each deploy).
        const url = window.location.origin + window.location.pathname;
        fetch(url, { method: 'HEAD', cache: 'no-store' })
            .then((res) => {
                const lastModified = res.headers.get('last-modified');
                if (lastModified) {
                    const d = new Date(lastModified);
                    if (!Number.isNaN(d.getTime())) {
                        setText(d.toLocaleString());
                        return;
                    }
                    setText(lastModified);
                    return;
                }

                const etag = res.headers.get('etag');
                if (etag) {
                    setText(etag.replace(/W\//, '').replace(/\"/g, ''));
                }
            })
            .catch(() => { });
    }

    setupEventListeners() {
        // Landing screen
        document.getElementById('create-room-btn').addEventListener('click', () => this.handleCreateRoom());
        document.getElementById('join-room-btn').addEventListener('click', () => this.handleJoinRoomClick());
        document.getElementById('join-confirm-btn').addEventListener('click', () => this.handleJoinRoom());
        document.getElementById('room-code-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleJoinRoom();
        });

        // Settings modal
        document.getElementById('cancel-settings-btn').addEventListener('click', () => {
            this.ui.hideModal('settings');
        });
        document.getElementById('confirm-settings-btn').addEventListener('click', () => this.handleConfirmSettings());

        // Lobby
        document.getElementById('copy-code-btn').addEventListener('click', () => this.copyRoomCode());
        document.getElementById('invite-btn').addEventListener('click', () => this.copyInviteLink());
        document.getElementById('start-game-btn').addEventListener('click', () => this.handleStartGame());
        document.getElementById('edit-settings-btn').addEventListener('click', () => this.openEditSettings());

        // Host controls
        document.getElementById('end-game-btn').addEventListener('click', () => this.handleEndGame());

        // Game - Drawing tools
        this.setupDrawingTools();

        // Play again
        document.getElementById('play-again-btn').addEventListener('click', () => this.handlePlayAgain());
    }

    setupDrawingTools() {
        // Color buttons
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.canvas.setColor(btn.dataset.color);
            });
        });

        // Size buttons
        document.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.canvas.setBrushSize(parseInt(btn.dataset.size));
            });
        });

        // Tool buttons
        document.getElementById('pencil-tool').addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('pencil-tool').classList.add('active');
            this.canvas.setTool('pencil');
        });

        document.getElementById('eraser-tool').addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('eraser-tool').classList.add('active');
            this.canvas.setTool('eraser');
        });

        document.getElementById('fill-tool').addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('fill-tool').classList.add('active');
            this.canvas.setTool('fill');
        });

        // Action buttons
        document.getElementById('undo-btn').addEventListener('click', () => this.canvas.undo());
        document.getElementById('clear-btn').addEventListener('click', () => this.canvas.clear());
    }

    setupPeerCallbacks() {
        this.peer.onPlayerJoin = (peerId) => {
            console.log('Player joined:', peerId);
            // Send current game state to new player
            if (this.isHost) {
                const gameState = this.game.getGameState();
                this.peer.sendTo(peerId, {
                    type: 'gameState',
                    payload: gameState
                });
            }
        };

        this.peer.onPlayerLeave = (peerId) => {
            console.log('Player left:', peerId);
            const player = this.game.getPlayer(peerId);
            if (player) {
                this.chat.addSystemMessage(`${player.name} left the game`, 'default');
                this.game.removePlayer(peerId);
                this.updatePlayerLists();
            }
        };

        this.peer.onMessage = (data) => {
            this.handlePeerMessage(data);
        };

        this.peer.onConnectionError = (error) => {
            this.ui.showToast('Connection lost: ' + error.message, 'error');
            this.ui.showScreen('landing');
        };
    }

    setupGameCallbacks() {
        this.game.onStateChange = (state) => {
            this.handleGameStateChange(state);

            // Host is authoritative for state transitions; notify peers about drawing phase start.
            if (this.isHost && state === 'drawing') {
                const drawerId = this.game.getCurrentDrawerId();
                const wordDisplay = this.game.getWordDisplay(false);

                // Ensure the drawer knows the actual word (auto-select can happen).
                if (drawerId && drawerId !== this.peer.roomCode) {
                    this.peer.sendTo(drawerId, {
                        type: 'yourWord',
                        payload: { word: this.game.currentWord }
                    });
                }

                this.peer.broadcast({
                    type: 'drawingStart',
                    payload: {
                        drawerId,
                        currentRound: this.game.currentRound,
                        currentDrawerIndex: this.game.currentDrawerIndex,
                        drawingOrder: this.game.drawingOrder,
                        wordDisplay
                    }
                });
            }
        };

        this.game.onTimerUpdate = (time, maxTime) => {
            if (this.game.state === 'wordSelect') {
                this.ui.updateWordSelectionTimer(time);
            } else {
                this.ui.updateTimerDisplay(time, maxTime);
            }

            // Broadcast timer update
            if (this.isHost) {
                this.peer.broadcast({
                    type: 'timerUpdate',
                    payload: { time, maxTime, state: this.game.state }
                });
            }
        };

        this.game.onWordSelect = (words, drawerId) => {
            if (!this.isHost) return;

            const turnPayload = {
                drawerId,
                currentRound: this.game.currentRound,
                currentDrawerIndex: this.game.currentDrawerIndex,
                drawingOrder: this.game.drawingOrder
            };

            // Everyone enters word-select; only the active drawer receives the word options.
            this.peer.broadcast({
                type: 'wordSelectPhase',
                payload: { ...turnPayload, words: null }
            });

            if (drawerId === this.peer.roomCode) {
                this.ui.showWordSelection(words, (word) => {
                    this.game.selectWord(word);
                });
                return;
            }

            this.peer.sendTo(drawerId, {
                type: 'wordSelectPhase',
                payload: { ...turnPayload, words }
            });
        };

        this.game.onHintReveal = (wordDisplay) => {
            const drawerId = this.game.getCurrentDrawerId();
            const isDrawer = (this.isHost && drawerId === this.peer.roomCode) ||
                (!this.isHost && drawerId === this.peer.playerId);

            if (!isDrawer) {
                this.publicWordDisplay = wordDisplay;
                this.ui.updateWordDisplay(wordDisplay);
            }

            if (this.isHost) {
                this.peer.broadcast({
                    type: 'hintReveal',
                    payload: { wordDisplay }
                });
            }
        };

        this.game.onPlayerUpdate = () => {
            this.updatePlayerLists();

            if (this.isHost) {
                this.peer.broadcast({
                    type: 'playersUpdate',
                    payload: { players: Array.from(this.game.players.entries()) }
                });
            }
        };

        this.game.onRoundEnd = (roundData) => {
            this.ui.showRoundEnd(roundData.word, roundData.scores);
            this.chat.addSystemMessage(`The word was: ${roundData.word}`, 'success');

            if (this.isHost) {
                this.peer.broadcast({
                    type: 'roundEnd',
                    payload: roundData
                });
            }
        };

        this.game.onGameEnd = (standings) => {
            this.ui.showGameEnd(standings);
            this.canvas.setEnabled(false);
            this.ui.setToolbarVisible(false);

            if (this.isHost) {
                this.peer.broadcast({
                    type: 'gameEnd',
                    payload: { standings }
                });
            }
        };
    }

    setupCanvasCallbacks() {
        this.canvas.onDraw = (data) => {
            if (this.isHost) {
                this.peer.broadcast({
                    type: 'draw',
                    payload: data
                });
            } else {
                this.peer.send({
                    type: 'draw',
                    payload: data
                });
            }
        };
    }

    setupChatCallbacks() {
        this.chat.onSendMessage = (message) => {
            const drawerId = this.game.getCurrentDrawerId();
            const myId = this.isHost ? this.peer.roomCode : this.peer.playerId;
            const isDrawer = myId === drawerId;

            // Drawer can't send messages during drawing phase
            if (this.game.state === 'drawing' && isDrawer) {
                return; // Ignore messages from drawer
            }

            if (this.game.state === 'drawing' && !isDrawer) {
                // All guesses go to host for validation
                if (this.isHost) {
                    // Host validates locally
                    const result = this.game.checkGuess(myId, message);

                    if (result.correct) {
                        this.chat.addCorrectGuessMessage(this.playerName, result.score);
                        this.chat.setPlaceholder('You guessed it!');
                        this.chat.setEnabled(false);
                        this.peer.broadcast({
                            type: 'correctGuess',
                            payload: { playerId: myId, playerName: this.playerName, score: result.score }
                        });
                    } else if (result.close) {
                        this.chat.addCloseGuessMessage(this.playerName);
                        this.peer.broadcast({
                            type: 'closeGuess',
                            payload: { playerName: this.playerName }
                        });
                    } else {
                        // Show wrong guess in chat (don't reveal correct answer)
                        this.chat.addPlayerMessage(this.playerName, message);
                        this.peer.broadcast({
                            type: 'chat',
                            payload: { playerName: this.playerName, message }
                        });
                    }
                } else {
                    // Non-host sends guess to host for validation
                    this.peer.send({
                        type: 'guess',
                        payload: { message, playerName: this.playerName }
                    });
                    // Don't show locally yet - wait for host response
                }
            } else {
                // Regular chat message (not during drawing or in lobby)
                this.chat.addPlayerMessage(this.playerName, message);

                const msgData = {
                    type: 'chat',
                    payload: { playerName: this.playerName, message }
                };

                if (this.isHost) {
                    this.peer.broadcast(msgData);
                } else {
                    this.peer.send(msgData);
                }
            }
        };
    }

    handlePeerMessage(data) {
        const { type, payload, senderId } = data;

        switch (type) {
            case 'playerInfo':
                this.game.addPlayer(senderId, payload.name);
                this.chat.addSystemMessage(`${payload.name} joined the room!`, 'success');
                this.updatePlayerLists();
                this.updateStartButton();
                // Broadcast updated player list
                this.peer.broadcast({
                    type: 'playersUpdate',
                    payload: { players: Array.from(this.game.players.entries()) }
                });
                break;

            case 'gameState':
                this.game.applyGameState(payload);
                this.updatePlayerLists();
                if (this.game.state === 'lobby') {
                    this.ui.updateLobbySettings(this.game.settings);
                    this.ui.showScreen('lobby');
                }
                break;

            case 'playersUpdate':
                this.game.players = new Map(payload.players);
                this.updatePlayerLists();
                break;

            case 'settingsUpdate':
                if (payload && payload.settings) {
                    this.game.setSettings(payload.settings);
                    if (this.game.state === 'lobby') {
                        this.ui.updateLobbySettings(this.game.settings);
                    }
                    this.updateStartButton();
                }
                break;

            case 'draw':
                this.canvas.applyDrawData(payload);
                if (this.isHost) {
                    // Relay to other players
                    this.peer.broadcast({ type: 'draw', payload }, senderId);
                }
                break;

            case 'chat':
                this.chat.addPlayerMessage(payload.playerName, payload.message);
                if (this.isHost) {
                    this.peer.broadcast({ type: 'chat', payload }, senderId);
                }
                break;

            case 'guess':
                if (this.isHost) {
                    const result = this.game.checkGuess(senderId, payload.message);
                    if (result.correct) {
                        this.chat.addCorrectGuessMessage(payload.playerName, result.score);
                        this.peer.broadcast({
                            type: 'correctGuess',
                            payload: { playerId: senderId, playerName: payload.playerName, score: result.score }
                        });
                    } else if (result.close) {
                        this.chat.addCloseGuessMessage(payload.playerName);
                        this.peer.broadcast({
                            type: 'closeGuess',
                            payload: { playerName: payload.playerName }
                        });
                    } else {
                        this.chat.addPlayerMessage(payload.playerName, payload.message);
                        this.peer.broadcast({
                            type: 'chat',
                            payload: { playerName: payload.playerName, message: payload.message }
                        });
                    }
                }
                break;

            case 'correctGuess':
                this.chat.addCorrectGuessMessage(payload.playerName, payload.score);
                {
                    const myId = this.isHost ? this.peer.roomCode : this.peer.playerId;
                    if (payload.playerId && payload.playerId === myId) {
                        this.chat.setPlaceholder('You guessed it!');
                        this.chat.setEnabled(false);
                    }
                }
                break;

            case 'closeGuess':
                this.chat.addCloseGuessMessage(payload.playerName);
                break;

            case 'gameStart':
                this.handleGameStart(payload);
                break;

            case 'wordSelectPhase':
                this.ui.hideWordSelection();
                // Sync turn state (clients rely on this for drawer detection and round display).
                if (typeof payload.currentRound === 'number') this.game.currentRound = payload.currentRound;
                if (typeof payload.currentDrawerIndex === 'number') this.game.currentDrawerIndex = payload.currentDrawerIndex;
                if (Array.isArray(payload.drawingOrder)) this.game.drawingOrder = payload.drawingOrder;

                const myId = this.isHost ? this.peer.roomCode : this.peer.playerId;
                if (payload.drawerId === myId && payload.words) {
                    this.ui.showWordSelection(payload.words, (word) => {
                        // Store locally so the drawer can see the word immediately.
                        this.game.currentWord = word.toLowerCase();
                        this.peer.send({
                            type: 'wordChosen',
                            payload: { word }
                        });
                    });
                }
                this.handleGameStateChange('wordSelect');
                break;

            case 'wordChosen':
                if (this.isHost) {
                    if (this.game.state !== 'wordSelect') break;
                    if (senderId !== this.game.getCurrentDrawerId()) break;
                    this.game.selectWord(payload.word);
                }
                break;

            case 'wordSelected':
            case 'drawingStart':
                this.ui.hideWordSelection();
                // Sync turn state if provided.
                if (payload && typeof payload.currentRound === 'number') this.game.currentRound = payload.currentRound;
                if (payload && typeof payload.currentDrawerIndex === 'number') this.game.currentDrawerIndex = payload.currentDrawerIndex;
                if (payload && Array.isArray(payload.drawingOrder)) this.game.drawingOrder = payload.drawingOrder;

                if (payload && typeof payload.wordDisplay === 'string') {
                    this.publicWordDisplay = payload.wordDisplay;
                    const myId = this.isHost ? this.peer.roomCode : this.peer.playerId;
                    const isDrawer = this.game.getCurrentDrawerId() === myId;
                    // Don't overwrite the drawer's "DRAW THIS" word with the public masked word.
                    if (!isDrawer) {
                        this.ui.updateWordDisplay(payload.wordDisplay, 'GUESS THIS:');
                    }
                }
                this.handleGameStateChange('drawing');
                break;

            case 'timerUpdate':
                if (payload.state === 'wordSelect') {
                    this.ui.updateWordSelectionTimer(payload.time);
                } else {
                    this.ui.updateTimerDisplay(payload.time, payload.maxTime);
                }
                break;

            case 'hintReveal':
                // Hint reveals are meant for guessers; the drawer should keep seeing the full word.
                this.publicWordDisplay = payload.wordDisplay;
                {
                    const myId = this.isHost ? this.peer.roomCode : this.peer.playerId;
                    const isDrawer = this.game.getCurrentDrawerId() === myId;
                    if (!isDrawer) {
                        this.ui.updateWordDisplay(payload.wordDisplay);
                    }
                }
                break;

            case 'roundEnd':
                this.ui.showRoundEnd(payload.word, payload.scores);
                this.chat.addSystemMessage(`The word was: ${payload.word}`, 'success');
                break;

            case 'newTurn':
                this.canvas.clear(false);
                this.handleGameStateChange('wordSelect');
                break;

            case 'gameEnd':
                this.ui.showGameEnd(payload.standings);
                this.canvas.setEnabled(false);
                this.ui.setToolbarVisible(false);
                break;

            case 'playAgain':
                this.ui.hideGameEnd();
                this.canvas.clear(false);
                this.game.reset();
                this.ui.showScreen('lobby');
                this.ui.updateLobbySettings(this.game.settings);
                this.updatePlayerLists();
                this.updateStartButton();
                break;

            case 'terminateGame':
                this.ui.hideGameEnd();
                this.canvas.clear(false);
                this.game.reset();
                this.ui.showScreen('lobby');
                this.ui.updateLobbySettings(this.game.settings);
                this.updatePlayerLists();
                this.updateStartButton();
                this.chat.addSystemMessage('Game ended by host.', 'default');
                break;

            case 'yourWord':
                if (payload && payload.word) {
                    this.game.currentWord = payload.word.toLowerCase();
                    const myId = this.isHost ? this.peer.roomCode : this.peer.playerId;
                    if (this.game.state === 'drawing' && this.game.getCurrentDrawerId() === myId) {
                        this.ui.updateWordDisplay(this.game.currentWord.toUpperCase(), 'DRAW THIS:');
                    }
                }
                break;
        }
    }

    handleGameStateChange(state) {
        // Keep local state in sync (clients don't run the full game logic).
        this.game.state = state;

        const drawerId = this.game.getCurrentDrawerId();
        const myId = this.isHost ? this.peer.roomCode : this.peer.playerId;
        const isDrawer = myId === drawerId;

        const endBtn = document.getElementById('end-game-btn');
        if (endBtn) {
            const show = this.isHost && state !== 'lobby';
            endBtn.classList.toggle('hidden', !show);
        }

        switch (state) {
            case 'wordSelect':
                this.publicWordDisplay = '';
                // Clear between turns so the previous drawing doesn't linger.
                this.canvas.clear(false);
                this.canvas.setEnabled(false);
                this.ui.setToolbarVisible(false);
                this.chat.setEnabled(true);
                this.chat.setPlaceholder('Chat here...');
                this.ui.updateWordDisplay('Choosing word...', 'WAIT:');
                this.ui.updateRoundDisplay(this.game.currentRound, this.game.settings.rounds);
                this.updatePlayerLists();
                break;

            case 'drawing':
                this.ui.hideWordSelection();
                // New drawing phase: always start with a clean board for everyone.
                this.canvas.clear(false);

                if (isDrawer) {
                    this.canvas.setEnabled(true);
                    this.ui.setToolbarVisible(true);
                    this.chat.setEnabled(false);
                    this.chat.setPlaceholder("You're drawing!");
                    this.ui.updateWordDisplay(this.game.currentWord.toUpperCase(), 'DRAW THIS:');
                    this.chat.addSystemMessage(`You are drawing: ${this.game.currentWord}`, 'info');
                } else {
                    this.canvas.setEnabled(false);
                    this.ui.setToolbarVisible(false);
                    this.chat.setEnabled(true);
                    this.chat.setPlaceholder('Type your guess here...');
                    const display = this.publicWordDisplay || this.game.getWordDisplay(false) || '...';
                    this.ui.updateWordDisplay(display, 'GUESS THIS:');

                    const drawer = this.game.getPlayer(drawerId);
                    if (drawer) {
                        this.chat.addSystemMessage(`${drawer.name} is drawing now!`, 'info');
                    }
                }
                this.updatePlayerLists();
                break;
        }
    }

    handleGameStart(payload) {
        this.ui.showScreen('game');
        // Resize canvas after screen is visible
        setTimeout(() => {
            this.canvas.resizeCanvas();
        }, 50);
        this.game.applyGameState(payload.gameState);
        this.canvas.clear(false);
        this.chat.clear();
        this.chat.addSystemMessage('Game started!', 'success');
    }

    getPlayerName() {
        const name = document.getElementById('player-name').value.trim();
        if (!name) {
            this.ui.showToast('Please enter your name', 'error');
            return null;
        }
        localStorage.setItem('skribbl_name', name);
        return name;
    }

    async handleCreateRoom() {
        this.playerName = this.getPlayerName();
        if (!this.playerName) return;

        // Reset modal state for room creation
        this.isEditingSettings = false;
        const confirmBtn = document.getElementById('confirm-settings-btn');
        if (confirmBtn) confirmBtn.textContent = 'Create Room';

        this.ui.showModal('settings');
    }

    handleJoinRoomClick() {
        const section = document.getElementById('join-input-section');
        section.classList.toggle('hidden');
        if (!section.classList.contains('hidden')) {
            document.getElementById('room-code-input').focus();
        }
    }

    async handleJoinRoom() {
        this.playerName = this.getPlayerName();
        if (!this.playerName) return;

        const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
        if (!roomCode || roomCode.length !== 6) {
            this.ui.showToast('Please enter a valid 6-character room code', 'error');
            return;
        }

        const joinBtn = document.getElementById('join-confirm-btn');
        if (joinBtn) joinBtn.disabled = true;
        this.ui.showToast('Connecting to room...', 'default', 2000);

        try {
            await this.peer.joinRoom(roomCode);
            this.isHost = false;

            // Send our info to host
            this.peer.send({
                type: 'playerInfo',
                payload: { name: this.playerName }
            });

            // Add ourselves to local game state
            this.game.addPlayer(this.peer.playerId, this.playerName);

            // Update URL
            window.history.replaceState({}, '', `?room=${roomCode}`);

            // Show lobby
            document.getElementById('lobby-room-code').textContent = roomCode;
            this.ui.showScreen('lobby');
            this.chat.addSystemMessage('Joined the room!', 'success');

            // Hide start button for non-hosts
            document.getElementById('start-game-btn').style.display = 'none';
            document.getElementById('edit-settings-btn').classList.add('hidden');

        } catch (error) {
            this.ui.showToast('Could not join room: ' + error.message, 'error');
        } finally {
            if (joinBtn) joinBtn.disabled = false;
        }
    }

    getSettings() {
        return {
            maxPlayers: parseInt(document.getElementById('setting-players').value),
            language: document.getElementById('setting-language').value,
            drawTime: parseInt(document.getElementById('setting-drawtime').value),
            rounds: parseInt(document.getElementById('setting-rounds').value),
            wordCount: parseInt(document.getElementById('setting-wordcount').value),
            hints: parseInt(document.getElementById('setting-hints').value),
            customWords: document.getElementById('custom-words').value
                .split(',')
                .map(w => w.trim())
                .filter(w => w.length >= 1 && w.length <= 32),
            customWordsOnly: document.getElementById('custom-words-only').checked
        };
    }

    async handleConfirmSettings() {
        const settings = this.getSettings();

        // Validate custom words if using only custom
        if (settings.customWordsOnly && settings.customWords.length < 10) {
            this.ui.showToast('Need at least 10 custom words when using only custom words', 'error');
            return;
        }

        this.game.setSettings(settings);

        // Editing settings in lobby (host only)
        if (this.isEditingSettings && this.isHost) {
            this.isEditingSettings = false;
            this.ui.hideModal('settings');
            this.ui.updateLobbySettings(settings);
            this.updateStartButton();

            this.peer.broadcast({
                type: 'settingsUpdate',
                payload: { settings }
            });
            this.chat.addSystemMessage('Game settings updated.', 'default');
            return;
        }

        const confirmBtn = document.getElementById('confirm-settings-btn');
        const originalText = confirmBtn ? confirmBtn.textContent : '';
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Creating...';
        }
        this.ui.showToast('Creating room...', 'default', 2000);

        try {
            await this.peer.createRoom();
            this.isHost = true;

            // Add ourselves as host
            this.game.addPlayer(this.peer.roomCode, this.playerName, true);

            // Update UI
            document.getElementById('lobby-room-code').textContent = this.peer.roomCode;
            this.ui.updateLobbySettings(settings);
            document.getElementById('edit-settings-btn').classList.remove('hidden');
            this.updatePlayerLists();

            // Update URL
            window.history.replaceState({}, '', `?room=${this.peer.roomCode}`);

            this.ui.hideModal('settings');
            this.ui.showScreen('lobby');
            this.updateStartButton();

            this.chat.addSystemMessage(`${this.playerName} is now the room owner!`, 'default');

        } catch (error) {
            this.ui.showToast('Could not create room: ' + error.message, 'error');
        } finally {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = originalText || 'Create Room';
            }
        }
    }

    openEditSettings() {
        if (!this.isHost) return;
        if (this.game.state !== 'lobby') return;

        const settings = this.game.settings;
        document.getElementById('setting-players').value = String(settings.maxPlayers);
        document.getElementById('setting-language').value = settings.language;
        document.getElementById('setting-drawtime').value = String(settings.drawTime);
        document.getElementById('setting-rounds').value = String(settings.rounds);
        document.getElementById('setting-wordcount').value = String(settings.wordCount);
        document.getElementById('setting-hints').value = String(settings.hints);
        document.getElementById('custom-words').value = (settings.customWords || []).join(', ');
        document.getElementById('custom-words-only').checked = !!settings.customWordsOnly;

        this.isEditingSettings = true;
        const confirmBtn = document.getElementById('confirm-settings-btn');
        if (confirmBtn) confirmBtn.textContent = 'Save Settings';
        this.ui.showModal('settings');
    }

    copyRoomCode() {
        const code = this.peer.roomCode;
        navigator.clipboard.writeText(code).then(() => {
            this.ui.showToast('Room code copied!', 'success');
        });
    }

    copyInviteLink() {
        const link = `${window.location.origin}${window.location.pathname}?room=${this.peer.roomCode}`;
        navigator.clipboard.writeText(link).then(() => {
            this.ui.showToast('Invite link copied!', 'success');
            this.chat.addSystemMessage('Copied room link to clipboard!', 'default');
        });
    }

    updatePlayerLists() {
        const players = this.game.getPlayersArray();

        if (this.game.state === 'lobby') {
            this.ui.updateLobbyPlayers(players, this.game.settings.maxPlayers);
        } else {
            this.ui.updateGamePlayers(players, this.game.getCurrentDrawerId());
        }
    }

    updateStartButton() {
        const btn = document.getElementById('start-game-btn');
        const playerCount = this.game.players.size;

        if (playerCount < 2) {
            btn.disabled = true;
            document.getElementById('lobby-message').textContent = 'You need at least 2 players to start the game!';
        } else {
            btn.disabled = false;
            document.getElementById('lobby-message').textContent = '';
        }
    }

    handleStartGame() {
        if (!this.isHost) return;

        this.ui.showScreen('game');
        // Resize canvas after screen is visible
        setTimeout(() => {
            this.canvas.resizeCanvas();
        }, 50);
        this.canvas.clear(false);
        this.chat.clear();
        this.chat.addSystemMessage('Game started!', 'success');

        const result = this.game.startGame({ deferTurnStart: true });
        if (result.error) {
            this.ui.showToast(result.error, 'error');
            this.ui.showScreen('lobby');
            return;
        }

        // Broadcast game start
        this.peer.broadcast({
            type: 'gameStart',
            payload: { gameState: this.game.getGameState() }
        });

        // Start the first turn AFTER peers have switched to the game screen.
        this.game.startTurn();
    }

    handlePlayAgain() {
        if (!this.isHost) {
            const btn = document.getElementById('play-again-btn');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Waiting for host...';
            }
            this.ui.setGameEndStatus('Waiting for host to restart...');
            return;
        }

        this.ui.hideGameEnd();
        this.canvas.clear(false);
        this.game.reset();

        this.peer.broadcast({
            type: 'playAgain',
            payload: {}
        });

        // Show lobby again
        this.ui.showScreen('lobby');
        this.updatePlayerLists();
        this.updateStartButton();
    }

    handleEndGame() {
        if (!this.isHost) return;

        this.ui.hideGameEnd();
        this.canvas.clear(false);
        this.game.reset();

        this.peer.broadcast({
            type: 'terminateGame',
            payload: {}
        });

        this.ui.showScreen('lobby');
        this.ui.updateLobbySettings(this.game.settings);
        this.updatePlayerLists();
        this.updateStartButton();
        this.chat.addSystemMessage('Game ended by host.', 'default');
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SkribblApp();
});
