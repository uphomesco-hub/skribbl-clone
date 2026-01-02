// ===== Game Logic Manager =====
// Handles game state, turns, scoring, and word management

class GameManager {
    constructor() {
        this.state = 'lobby'; // lobby, wordSelect, drawing, roundEnd, gameEnd
        this.players = new Map(); // peerId -> { name, score, isHost, hasGuessed }
        this.settings = {
            maxPlayers: 8,
            language: 'english',
            drawTime: 80,
            rounds: 3,
            wordCount: 3,
            hints: 2,
            customWords: [],
            customWordsOnly: false
        };

        this.currentRound = 1;
        this.currentDrawerIndex = 0;
        this.currentWord = '';
        this.revealedLetters = [];
        this.timeRemaining = 0;
        this.timerInterval = null;
        this.wordSelectTimer = null;
        this.drawingOrder = [];
        this.roundScores = new Map(); // Track scores earned this round

        this.words = null;

        // Callbacks
        this.onStateChange = null;
        this.onTimerUpdate = null;
        this.onWordSelect = null;
        this.onHintReveal = null;
        this.onRoundEnd = null;
        this.onGameEnd = null;
        this.onPlayerUpdate = null;
    }

    async loadWords() {
        try {
            const response = await fetch('assets/words.json');
            this.words = await response.json();
        } catch (error) {
            console.error('Failed to load words:', error);
            // Fallback words
            this.words = {
                english: {
                    easy: ['cat', 'dog', 'sun', 'tree', 'house'],
                    medium: ['elephant', 'computer', 'rainbow'],
                    hard: ['encyclopedia', 'constellation']
                }
            };
        }
    }

    // Set game settings
    setSettings(settings) {
        this.settings = { ...this.settings, ...settings };
    }

    // Add a player
    addPlayer(peerId, name, isHost = false) {
        this.players.set(peerId, {
            name: name,
            score: 0,
            isHost: isHost,
            hasGuessed: false
        });

        if (this.onPlayerUpdate) {
            this.onPlayerUpdate();
        }
    }

    // Remove a player
    removePlayer(peerId) {
        this.players.delete(peerId);

        // If current drawer left, end their turn
        if (this.state === 'drawing' && this.getCurrentDrawerId() === peerId) {
            this.endTurn();
        }

        if (this.onPlayerUpdate) {
            this.onPlayerUpdate();
        }
    }

    // Get player by ID
    getPlayer(peerId) {
        return this.players.get(peerId);
    }

    // Get all players as array
    getPlayersArray() {
        return Array.from(this.players.entries()).map(([id, player]) => ({
            id,
            ...player
        }));
    }

    // Get current drawer
    getCurrentDrawerId() {
        if (this.drawingOrder.length === 0) return null;
        return this.drawingOrder[this.currentDrawerIndex];
    }

    // Start the game
    startGame({ deferTurnStart = false } = {}) {
        if (this.players.size < 2) {
            return { error: 'Need at least 2 players to start' };
        }

        // Clear ALL timers from any previous run
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.wordSelectTimer) {
            clearInterval(this.wordSelectTimer);
            this.wordSelectTimer = null;
        }
        if (this.nextTurnTimeout) {
            clearTimeout(this.nextTurnTimeout);
            this.nextTurnTimeout = null;
        }

        // Set up drawing order
        this.drawingOrder = Array.from(this.players.keys());
        this.shuffleArray(this.drawingOrder);

        this.currentRound = 1;
        this.currentDrawerIndex = 0;

        // Reset all scores
        this.players.forEach(player => {
            player.score = 0;
            player.hasGuessed = false;
        });

        if (deferTurnStart) {
            this.state = 'wordSelect';
            this.roundScores.clear();
            this.currentWord = '';
            this.revealedLetters = [];
            this.timeRemaining = 0;

            if (this.onStateChange) {
                this.onStateChange(this.state);
            }

            return { success: true };
        }

        this.startTurn();
        return { success: true };
    }

    // Start a new turn
    startTurn() {
        this.state = 'wordSelect';
        this.roundScores.clear();

        // Reset hasGuessed for all players
        this.players.forEach(player => {
            player.hasGuessed = false;
        });

        // Get word options
        const wordOptions = this.getRandomWords(this.settings.wordCount);

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }

        if (this.onWordSelect) {
            this.onWordSelect(wordOptions, this.getCurrentDrawerId());
        }

        // Auto-select after 15 seconds
        let wordSelectTime = 15;
        this.wordSelectTimer = setInterval(() => {
            wordSelectTime--;
            if (this.onTimerUpdate) {
                this.onTimerUpdate(wordSelectTime, 15);
            }
            if (wordSelectTime <= 0) {
                clearInterval(this.wordSelectTimer);
                // Auto-select random word
                const randomWord = wordOptions[Math.floor(Math.random() * wordOptions.length)];
                this.selectWord(randomWord);
            }
        }, 1000);
    }

    // Get random words from the word list
    getRandomWords(count) {
        const lang = this.words[this.settings.language] || this.words.english;
        let allWords = [];

        if (this.settings.customWordsOnly && this.settings.customWords.length >= 10) {
            allWords = [...this.settings.customWords];
        } else {
            allWords = [
                ...lang.easy,
                ...lang.medium,
                ...lang.hard,
                ...this.settings.customWords
            ];
        }

        // Shuffle and pick
        this.shuffleArray(allWords);
        return allWords.slice(0, count);
    }

    // Word selected by drawer
    selectWord(word) {
        clearInterval(this.wordSelectTimer);

        this.currentWord = word.toLowerCase();
        this.revealedLetters = [];
        this.state = 'drawing';
        this.timeRemaining = this.settings.drawTime;

        // Calculate hint intervals
        const hintCount = this.settings.hints;
        const hintInterval = Math.floor(this.settings.drawTime / (hintCount + 1));
        const hintTimes = [];
        for (let i = 1; i <= hintCount; i++) {
            hintTimes.push(this.settings.drawTime - (hintInterval * i));
        }

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }

        // Start the drawing timer
        this.timerInterval = setInterval(() => {
            this.timeRemaining--;

            if (this.onTimerUpdate) {
                this.onTimerUpdate(this.timeRemaining, this.settings.drawTime);
            }

            // Check for hints
            if (hintTimes.includes(this.timeRemaining)) {
                this.revealHint();
            }

            // Check if time is up or everyone guessed
            if (this.timeRemaining <= 0 || this.allPlayersGuessed()) {
                this.endTurn();
            }
        }, 1000);
    }

    // Reveal a hint letter
    revealHint() {
        const word = this.currentWord.replace(/\s/g, '');
        const unrevealedIndices = [];

        for (let i = 0; i < this.currentWord.length; i++) {
            if (this.currentWord[i] !== ' ' && !this.revealedLetters.includes(i)) {
                unrevealedIndices.push(i);
            }
        }

        if (unrevealedIndices.length > 0) {
            const randomIndex = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
            this.revealedLetters.push(randomIndex);

            if (this.onHintReveal) {
                this.onHintReveal(this.getWordDisplay(false));
            }
        }
    }

    // Get word display (with blanks or full)
    getWordDisplay(isDrawer) {
        if (isDrawer) {
            return this.currentWord.toUpperCase();
        }

        let display = '';
        for (let i = 0; i < this.currentWord.length; i++) {
            if (this.currentWord[i] === ' ') {
                display += '  ';
            } else if (this.revealedLetters.includes(i)) {
                display += this.currentWord[i].toUpperCase();
            } else {
                display += '_';
            }
            display += ' ';
        }
        return display.trim();
    }

    // Check a guess
    checkGuess(peerId, guess) {
        const player = this.players.get(peerId);
        if (!player || player.hasGuessed) return { correct: false };

        // Don't let drawer guess
        if (peerId === this.getCurrentDrawerId()) {
            return { correct: false, isDrawer: true };
        }

        const normalizedGuess = guess.toLowerCase().trim();
        const normalizedWord = this.currentWord.toLowerCase().trim();

        // Exact match
        if (normalizedGuess === normalizedWord) {
            player.hasGuessed = true;

            // Calculate score based on time
            const timeBonus = Math.max(50, Math.floor(500 * (this.timeRemaining / this.settings.drawTime)));
            player.score += timeBonus;
            this.roundScores.set(peerId, timeBonus);

            // Give drawer points
            const drawerId = this.getCurrentDrawerId();
            const drawer = this.players.get(drawerId);
            if (drawer) {
                drawer.score += 25;
                const drawerRoundScore = this.roundScores.get(drawerId) || 0;
                this.roundScores.set(drawerId, drawerRoundScore + 25);
            }

            if (this.onPlayerUpdate) {
                this.onPlayerUpdate();
            }

            return { correct: true, score: timeBonus };
        }

        // Check for close guess (80% similarity)
        const similarity = this.calculateSimilarity(normalizedGuess, normalizedWord);
        if (similarity >= 0.8) {
            return { correct: false, close: true };
        }

        return { correct: false };
    }

    // Calculate string similarity (Levenshtein)
    calculateSimilarity(s1, s2) {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;

        if (longer.length === 0) return 1.0;

        const costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }

        return (longer.length - costs[s2.length]) / longer.length;
    }

    // Check if all players have guessed
    allPlayersGuessed() {
        const drawerId = this.getCurrentDrawerId();
        for (const [peerId, player] of this.players) {
            if (peerId !== drawerId && !player.hasGuessed) {
                return false;
            }
        }
        return true;
    }

    // End current turn
    endTurn() {
        // Clear all timers
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.wordSelectTimer) {
            clearInterval(this.wordSelectTimer);
            this.wordSelectTimer = null;
        }

        this.state = 'roundEnd';

        const roundData = {
            word: this.currentWord,
            scores: Array.from(this.roundScores.entries()).map(([id, score]) => ({
                id,
                name: this.players.get(id)?.name || 'Unknown',
                score
            }))
        };

        if (this.onRoundEnd) {
            this.onRoundEnd(roundData);
        }

        // Move to next turn after delay
        this.nextTurnTimeout = setTimeout(() => {
            // Only proceed if still in roundEnd state
            if (this.state === 'roundEnd') {
                this.nextTurn();
            }
        }, 4000);
    }

    // Move to next turn
    nextTurn() {
        this.currentDrawerIndex++;

        // Check if round is complete
        if (this.currentDrawerIndex >= this.drawingOrder.length) {
            this.currentDrawerIndex = 0;
            this.currentRound++;

            // Check if game is complete
            if (this.currentRound > this.settings.rounds) {
                this.endGame();
                return;
            }
        }

        // Start new turn
        this.startTurn();
    }

    // End the game
    endGame() {
        // Clear ALL timers
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.wordSelectTimer) {
            clearInterval(this.wordSelectTimer);
            this.wordSelectTimer = null;
        }
        if (this.nextTurnTimeout) {
            clearTimeout(this.nextTurnTimeout);
            this.nextTurnTimeout = null;
        }

        this.state = 'gameEnd';

        // Sort players by score
        const standings = this.getPlayersArray()
            .sort((a, b) => b.score - a.score)
            .map((player, index) => ({
                ...player,
                rank: index + 1
            }));

        if (this.onGameEnd) {
            this.onGameEnd(standings);
        }
    }

    // Reset for new game
    reset() {
        // Clear ALL timers
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        if (this.wordSelectTimer) {
            clearInterval(this.wordSelectTimer);
            this.wordSelectTimer = null;
        }
        if (this.nextTurnTimeout) {
            clearTimeout(this.nextTurnTimeout);
            this.nextTurnTimeout = null;
        }

        this.state = 'lobby';
        this.currentRound = 1;
        this.currentDrawerIndex = 0;
        this.currentWord = '';
        this.revealedLetters = [];
        this.drawingOrder = [];

        this.players.forEach(player => {
            player.score = 0;
            player.hasGuessed = false;
        });

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    // Shuffle array in place
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // Get game state for syncing
    getGameState() {
        return {
            state: this.state,
            settings: this.settings,
            players: Array.from(this.players.entries()),
            currentRound: this.currentRound,
            currentDrawerIndex: this.currentDrawerIndex,
            drawingOrder: this.drawingOrder,
            currentWord: this.currentWord,
            revealedLetters: this.revealedLetters,
            timeRemaining: this.timeRemaining
        };
    }

    // Apply game state from host
    applyGameState(gameState) {
        this.state = gameState.state;
        this.settings = gameState.settings;
        this.players = new Map(gameState.players);
        this.currentRound = gameState.currentRound;
        this.currentDrawerIndex = gameState.currentDrawerIndex;
        this.drawingOrder = gameState.drawingOrder;
        this.currentWord = gameState.currentWord;
        this.revealedLetters = gameState.revealedLetters;
        this.timeRemaining = gameState.timeRemaining;

        if (this.onStateChange) {
            this.onStateChange(this.state);
        }

        if (this.onPlayerUpdate) {
            this.onPlayerUpdate();
        }
    }
}

export default GameManager;
