// ===== Chat Manager =====
// Handles chat messages, guessing, and activity feed

class ChatManager {
    constructor(containerId, inputId, sendBtnId) {
        this.container = document.getElementById(containerId);
        this.input = document.getElementById(inputId);
        this.sendBtn = document.getElementById(sendBtnId);
        this.charCountEl = document.getElementById('chat-char-count');

        this.onSendMessage = null;
        this.isEnabled = true;

        this.init();
    }

    init() {
        this.sendBtn.addEventListener('click', () => this.handleSend());
        this.input.addEventListener('input', () => this.updateCharCount());
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSend();
            }
        });
        this.updateCharCount();
    }

    handleSend() {
        if (!this.isEnabled) return;

        const message = this.input.value.trim();
        if (message === '') return;

        if (this.onSendMessage) {
            this.onSendMessage(message);
        }

        this.input.value = '';
        this.updateCharCount();
    }

    updateCharCount() {
        if (!this.charCountEl) return;
        const len = (this.input && this.input.value) ? this.input.value.length : 0;
        this.charCountEl.textContent = String(len);
    }

    // Add a system message
    addSystemMessage(text, type = 'default') {
        const msgEl = document.createElement('div');
        msgEl.className = `chat-message system ${type}`;
        msgEl.textContent = text;
        this.container.appendChild(msgEl);
        this.scrollToBottom();
    }

    // Add a player message
    addPlayerMessage(playerName, text, playerColor = null) {
        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message player';

        const senderSpan = document.createElement('span');
        senderSpan.className = 'sender';
        senderSpan.textContent = playerName + ':';
        if (playerColor) {
            senderSpan.style.color = playerColor;
        }

        const textSpan = document.createElement('span');
        textSpan.textContent = text;

        msgEl.appendChild(senderSpan);
        msgEl.appendChild(textSpan);
        this.container.appendChild(msgEl);
        this.scrollToBottom();
    }

    // Add a correct guess message
    addCorrectGuessMessage(playerName, score = null) {
        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message correct';
        msgEl.textContent = score ? `${playerName} guessed the word! (+${score})` : `${playerName} guessed the word!`;
        this.container.appendChild(msgEl);
        this.scrollToBottom();
    }

    // Add a close guess message
    addCloseGuessMessage(playerName) {
        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message close';
        msgEl.textContent = `${playerName} is close!`;
        this.container.appendChild(msgEl);
        this.scrollToBottom();
    }

    // Scroll to bottom of chat
    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }

    // Clear all messages
    clear() {
        this.container.innerHTML = '';
    }

    // Enable/disable chat input
    setEnabled(enabled) {
        this.isEnabled = enabled;
        this.input.disabled = !enabled;
        this.sendBtn.disabled = !enabled;
        this.input.placeholder = enabled ? 'Type your guess here...' : 'Waiting...';
        this.updateCharCount();
    }

    // Set input placeholder
    setPlaceholder(text) {
        this.input.placeholder = text;
    }
}

export default ChatManager;
