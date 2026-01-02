// ===== UI Manager =====
// Handles screen transitions, player list, and modals

class UIManager {
    constructor() {
        this.screens = {
            landing: document.getElementById('landing-screen'),
            lobby: document.getElementById('lobby-screen'),
            game: document.getElementById('game-screen')
        };

        this.modals = {
            settings: document.getElementById('settings-modal')
        };

        this.playerColors = [
            '#E74C3C', '#3498DB', '#2ECC71', '#F39C12',
            '#9B59B6', '#1ABC9C', '#E91E63', '#00BCD4'
        ];
    }

    // Switch to a screen
    showScreen(screenName) {
        Object.values(this.screens).forEach(screen => {
            screen.classList.remove('active');
            screen.classList.add('hidden');
        });

        if (this.screens[screenName]) {
            this.screens[screenName].classList.remove('hidden');
            this.screens[screenName].classList.add('active');
        }

        // Only show version/credit on landing + lobby (not inside the game UI)
        const showMeta = screenName !== 'game';
        const versionBadge = document.getElementById('version-badge');
        const footerCredit = document.getElementById('footer-credit');
        if (versionBadge) versionBadge.classList.toggle('hidden', !showMeta);
        if (footerCredit) footerCredit.classList.toggle('hidden', !showMeta);
    }

    // Show a modal
    showModal(modalName) {
        if (this.modals[modalName]) {
            this.modals[modalName].classList.remove('hidden');
        }
    }

    // Hide a modal
    hideModal(modalName) {
        if (this.modals[modalName]) {
            this.modals[modalName].classList.add('hidden');
        }
    }

    // Get player color by index
    getPlayerColor(index) {
        return this.playerColors[index % this.playerColors.length];
    }

    fitNameToSingleLine(el, name) {
        if (!el) return;
        const n = String(name || '');
        const len = n.length;
        let size = '0.9rem';
        if (len > 20) size = '0.75rem';
        else if (len > 16) size = '0.8rem';
        else if (len > 12) size = '0.85rem';
        el.style.fontSize = size;
        el.style.lineHeight = '1.15';

        // If it still doesn't fit, shrink further until it does (or we hit the minimum).
        requestAnimationFrame(() => {
            const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            const minPx = 0.6 * rootFont;
            let currentPx = parseFloat(getComputedStyle(el).fontSize) || (0.9 * rootFont);

            while (el.scrollWidth > el.clientWidth && currentPx > minPx) {
                currentPx -= 1;
                el.style.fontSize = `${currentPx}px`;
            }
        });
    }

    // Update lobby player list
    updateLobbyPlayers(players, maxPlayers) {
        const list = document.getElementById('lobby-player-list');
        const countSpan = document.getElementById('player-count');

        list.innerHTML = '';
        countSpan.textContent = `(${players.length}/${maxPlayers})`;

        players.forEach((player, index) => {
            const li = document.createElement('li');

            const avatar = document.createElement('div');
            avatar.className = 'player-avatar';
            avatar.style.background = `linear-gradient(135deg, ${this.getPlayerColor(index)} 0%, ${this.getPlayerColor(index + 1)} 100%)`;
            avatar.textContent = player.name.charAt(0).toUpperCase();

            const name = document.createElement('span');
            name.className = 'player-name';
            name.textContent = player.name;
            this.fitNameToSingleLine(name, player.name);

            li.appendChild(avatar);
            li.appendChild(name);

            if (player.isHost) {
                const crown = document.createElement('span');
                crown.className = 'player-crown';
                crown.textContent = '👑';
                li.appendChild(crown);
            }

            list.appendChild(li);
        });
    }

    // Update lobby settings display
    updateLobbySettings(settings) {
        const display = document.getElementById('lobby-settings-display');
        display.innerHTML = '';

        const settingsToShow = [
            { label: 'Draw Time', value: settings.drawTime + 's' },
            { label: 'Rounds', value: settings.rounds },
            { label: 'Language', value: settings.language },
            { label: 'Hints', value: settings.hints }
        ];

        settingsToShow.forEach(setting => {
            const div = document.createElement('div');
            div.className = 'setting-display';
            div.innerHTML = `
                <div class="label">${setting.label}</div>
                <div class="value">${setting.value}</div>
            `;
            display.appendChild(div);
        });
    }

    // Update game player list
    updateGamePlayers(players, currentDrawerId) {
        const list = document.getElementById('game-player-list');
        list.innerHTML = '';

        // Sort by score
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

        sortedPlayers.forEach((player, index) => {
            const li = document.createElement('li');

            if (player.id === currentDrawerId) {
                li.classList.add('drawing');
            }
            if (player.hasGuessed) {
                li.classList.add('guessed');
            }

            const rank = document.createElement('span');
            rank.className = 'player-rank';
            rank.textContent = `#${index + 1}`;

            const avatar = document.createElement('div');
            avatar.className = 'player-avatar';
            avatar.style.background = `linear-gradient(135deg, ${this.getPlayerColor(index)} 0%, ${this.getPlayerColor(index + 1)} 100%)`;
            avatar.textContent = player.name.charAt(0).toUpperCase();

            const info = document.createElement('div');
            info.className = 'player-info';
            info.innerHTML = `
                <div class="player-name">${player.name}</div>
                <div class="player-score">${player.score} pts</div>
            `;
            this.fitNameToSingleLine(info.querySelector('.player-name'), player.name);

            const icons = document.createElement('div');
            icons.className = 'player-icons';

            if (player.isHost) {
                icons.innerHTML += '<span title="Host">👑</span>';
            }
            if (player.id === currentDrawerId) {
                icons.innerHTML += '<span title="Drawing">✏️</span>';
            }
            if (player.hasGuessed) {
                icons.innerHTML += '<span title="Guessed">✓</span>';
            }

            li.appendChild(rank);
            li.appendChild(avatar);
            li.appendChild(info);
            li.appendChild(icons);

            list.appendChild(li);
        });
    }

    // Show word selection overlay
    showWordSelection(words, onSelect) {
        const overlay = document.getElementById('word-selection');
        const optionsContainer = document.getElementById('word-options');

        optionsContainer.innerHTML = '';

        words.forEach(word => {
            const btn = document.createElement('button');
            btn.textContent = word;
            btn.addEventListener('click', () => {
                onSelect(word);
                this.hideWordSelection();
            });
            optionsContainer.appendChild(btn);
        });

        overlay.classList.remove('hidden');
    }

    // Hide word selection overlay
    hideWordSelection() {
        document.getElementById('word-selection').classList.add('hidden');
    }

    // Update word selection timer
    updateWordSelectionTimer(time) {
        const t = Math.max(0, parseInt(time, 10) || 0);
        document.getElementById('word-timer-display').textContent = t;
    }

    // Show round end overlay
    showRoundEnd(word, scores) {
        const overlay = document.getElementById('round-end');
        const wordEl = document.getElementById('round-end-word').querySelector('strong');
        const scoresEl = document.getElementById('round-scores');

        wordEl.textContent = word;
        scoresEl.innerHTML = '';

        scores.forEach(score => {
            const div = document.createElement('div');
            div.className = 'score-item positive';
            div.innerHTML = `
                <span>${score.name}</span>
                <span>+${score.score}</span>
            `;
            scoresEl.appendChild(div);
        });

        overlay.classList.remove('hidden');

        // Auto-hide after delay
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 3500);
    }

    // Show game end overlay
    showGameEnd(standings) {
        const overlay = document.getElementById('game-end');
        const standingsEl = document.getElementById('final-standings');
        this.resetGameEndControls();

        standingsEl.innerHTML = '';

        const rankEmojis = ['🥇', '🥈', '🥉'];

        standings.forEach((player, index) => {
            const div = document.createElement('div');
            div.className = 'standing-item';
            div.innerHTML = `
                <span class="standing-rank">${rankEmojis[index] || (index + 1)}</span>
                <span class="standing-name">${player.name}</span>
                <span class="standing-score">${player.score} pts</span>
            `;
            standingsEl.appendChild(div);
        });

        overlay.classList.remove('hidden');
    }

    // Hide game end overlay
    hideGameEnd() {
        this.resetGameEndControls();
        document.getElementById('game-end').classList.add('hidden');
    }

    setGameEndStatus(message) {
        const el = document.getElementById('game-end-status');
        if (!el) return;
        const msg = String(message || '').trim();
        if (!msg) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    resetGameEndControls() {
        const btn = document.getElementById('play-again-btn');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Play Again';
        }
        this.setGameEndStatus('');
    }

    // Update round display
    updateRoundDisplay(current, total) {
        document.getElementById('round-display').textContent = `Round ${current} of ${total}`;
    }

    // Update timer display
    updateTimerDisplay(time, maxTime) {
        document.getElementById('timer-display').textContent = time;
        const progress = (time / maxTime) * 100;
        document.getElementById('timer-bar').style.setProperty('--progress', `${progress}%`);
    }

    // Update word display
    updateWordDisplay(text, label = 'GUESS THIS:') {
        document.getElementById('word-label').textContent = label;
        document.getElementById('word-text').textContent = text;

        const countEl = document.getElementById('word-count');
        if (!countEl) return;

        const labelLower = String(label || '').toLowerCase();
        const textLower = String(text || '').toLowerCase();
        if (labelLower.indexOf('wait') !== -1 || textLower.indexOf('choosing') !== -1) {
            countEl.classList.add('hidden');
            return;
        }

        const count = this.countMaskedWordLength(text);
        if (count > 0) {
            countEl.textContent = `(${count})`;
            countEl.classList.remove('hidden');
        } else {
            countEl.classList.add('hidden');
        }
    }

    countMaskedWordLength(text) {
        if (!text) return 0;
        // Accept formats like "_ _ _", "A _ _", "CAT", "C A T"
        const chars = String(text).replace(/\s/g, '');
        if (!chars) return 0;

        let count = 0;
        for (let i = 0; i < chars.length; i++) {
            const c = chars[i];
            if (c === '_' || /[a-zA-Z0-9]/.test(c)) count++;
        }

        // Ignore non-word states (e.g., "Choosing word...")
        if (count > 0 && (chars.indexOf('_') !== -1 || /[A-Z0-9]/.test(chars))) return count;
        return 0;
    }

    // Show/hide drawing toolbar
    setToolbarVisible(visible) {
        const toolbar = document.getElementById('drawing-toolbar');
        if (visible) {
            toolbar.classList.remove('hidden');
        } else {
            toolbar.classList.add('hidden');
        }
    }

    // Show toast notification
    showToast(message, type = 'default', duration = 3000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // Setup mobile sidebar toggles
    setupMobileSidebars() {
        const playersBtn = document.getElementById('toggle-players');
        const chatBtn = document.getElementById('toggle-chat');
        const playersSidebar = document.querySelector('.players-sidebar');
        const chatSidebar = document.querySelector('.chat-sidebar');

        // Create overlay
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            document.getElementById('game-screen').appendChild(overlay);
        }

        if (playersBtn) {
            playersBtn.addEventListener('click', () => {
                playersSidebar.classList.toggle('open');
                chatSidebar.classList.remove('open');
                overlay.classList.toggle('active', playersSidebar.classList.contains('open'));
            });
        }

        if (chatBtn) {
            chatBtn.addEventListener('click', () => {
                chatSidebar.classList.toggle('open');
                playersSidebar.classList.remove('open');
                overlay.classList.toggle('active', chatSidebar.classList.contains('open'));
            });
        }

        overlay.addEventListener('click', () => {
            playersSidebar.classList.remove('open');
            chatSidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }
}

export default UIManager;
