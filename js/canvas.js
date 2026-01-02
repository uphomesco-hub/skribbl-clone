// ===== Canvas Drawing Manager =====
// Handles all drawing functionality with real-time sync

class CanvasManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        this.isDrawing = false;
        this.isEnabled = false;
        this.currentTool = 'pencil';
        this.currentColor = '#000000';
        this.brushSize = 8;

        this.lastX = 0;
        this.lastY = 0;

        this.undoStack = [];
        this.maxUndoSteps = 20;

        this.onDraw = null; // Callback for sending draw data

        this.init();
    }

    init() {
        // Set canvas context properties
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        // Resize again after window fully loads
        window.addEventListener('load', () => {
            setTimeout(() => this.resizeCanvas(), 100);
        });

        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());

        // Touch events
        this.canvas.addEventListener('touchstart', (e) => this.handleTouch(e, 'start'));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouch(e, 'move'));
        this.canvas.addEventListener('touchend', () => this.stopDrawing());
        this.canvas.addEventListener('touchcancel', () => this.stopDrawing());

        // Prevent scrolling while drawing
        this.canvas.addEventListener('touchmove', (e) => {
            if (this.isEnabled) e.preventDefault();
        }, { passive: false });

        this.clear(false);
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        // Save current canvas content
        let imageData = null;
        if (this.canvas.width > 0 && this.canvas.height > 0) {
            try {
                imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            } catch (e) {
                // Canvas might not be ready
            }
        }

        // Set canvas size to container size
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        // Restore canvas settings
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Fill with white background
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Try to restore content if dimensions are the same
        if (imageData && imageData.width === this.canvas.width && imageData.height === this.canvas.height) {
            this.ctx.putImageData(imageData, 0, 0);
        }

        console.log('Canvas resized to:', this.canvas.width, 'x', this.canvas.height);
    }

    handleTouch(e, type) {
        if (!this.isEnabled) return;
        e.preventDefault();

        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const mouseEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY
        };

        if (type === 'start') {
            this.startDrawing(mouseEvent);
        } else if (type === 'move') {
            this.draw(mouseEvent);
        }
    }

    getCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    startDrawing(e) {
        if (!this.isEnabled) return;

        this.isDrawing = true;
        const coords = this.getCoordinates(e);
        this.lastX = coords.x;
        this.lastY = coords.y;

        // Save state for undo
        this.saveState();

        // Handle fill tool
        if (this.currentTool === 'fill') {
            this.fill(coords.x, coords.y, this.currentColor);
            this.sendDrawData({
                type: 'fill',
                x: coords.x,
                y: coords.y,
                color: this.currentColor
            });
            this.isDrawing = false;
            return;
        }

        // Start a path for pencil/eraser
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);

        // Draw a dot for single click
        this.ctx.lineTo(this.lastX + 0.1, this.lastY + 0.1);
        this.ctx.strokeStyle = this.currentTool === 'eraser' ? '#FFFFFF' : this.currentColor;
        this.ctx.lineWidth = this.brushSize;
        this.ctx.stroke();

        this.sendDrawData({
            type: 'start',
            x: this.lastX,
            y: this.lastY,
            color: this.currentTool === 'eraser' ? '#FFFFFF' : this.currentColor,
            size: this.brushSize
        });
    }

    draw(e) {
        if (!this.isDrawing || !this.isEnabled || this.currentTool === 'fill') return;

        const coords = this.getCoordinates(e);

        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(coords.x, coords.y);
        this.ctx.strokeStyle = this.currentTool === 'eraser' ? '#FFFFFF' : this.currentColor;
        this.ctx.lineWidth = this.brushSize;
        this.ctx.stroke();

        this.sendDrawData({
            type: 'draw',
            fromX: this.lastX,
            fromY: this.lastY,
            toX: coords.x,
            toY: coords.y,
            color: this.currentTool === 'eraser' ? '#FFFFFF' : this.currentColor,
            size: this.brushSize
        });

        this.lastX = coords.x;
        this.lastY = coords.y;
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.sendDrawData({ type: 'end' });
        }
        this.isDrawing = false;
    }

    // Receive and apply drawing data from other players
    applyDrawData(data) {
        switch (data.type) {
            case 'start':
                this.ctx.beginPath();
                this.ctx.moveTo(data.x, data.y);
                this.ctx.lineTo(data.x + 0.1, data.y + 0.1);
                this.ctx.strokeStyle = data.color;
                this.ctx.lineWidth = data.size;
                this.ctx.stroke();
                break;

            case 'draw':
                this.ctx.beginPath();
                this.ctx.moveTo(data.fromX, data.fromY);
                this.ctx.lineTo(data.toX, data.toY);
                this.ctx.strokeStyle = data.color;
                this.ctx.lineWidth = data.size;
                this.ctx.stroke();
                break;

            case 'fill':
                this.fill(data.x, data.y, data.color);
                break;

            case 'clear':
                this.clear(false);
                break;

            case 'undo':
                if (data.imageData) {
                    const img = new Image();
                    img.onload = () => {
                        this.ctx.fillStyle = '#FFFFFF';
                        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                        this.ctx.drawImage(img, 0, 0);
                    };
                    img.src = data.imageData;
                }
                break;
        }
    }

    // Flood fill algorithm
    fill(x, y, fillColor) {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;
        const width = this.canvas.width;
        const height = this.canvas.height;

        x = Math.floor(x);
        y = Math.floor(y);

        const targetColor = this.getPixelColor(data, x, y, width);
        const fillRgb = this.hexToRgb(fillColor);

        if (this.colorsMatch(targetColor, fillRgb)) return;

        const stack = [[x, y]];
        const visited = new Set();

        while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            const key = `${cx},${cy}`;

            if (visited.has(key)) continue;
            if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;

            const currentColor = this.getPixelColor(data, cx, cy, width);
            if (!this.colorsMatch(currentColor, targetColor, 32)) continue;

            visited.add(key);
            this.setPixelColor(data, cx, cy, width, fillRgb);

            stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }

        this.ctx.putImageData(imageData, 0, 0);
    }

    getPixelColor(data, x, y, width) {
        const index = (y * width + x) * 4;
        return { r: data[index], g: data[index + 1], b: data[index + 2] };
    }

    setPixelColor(data, x, y, width, color) {
        const index = (y * width + x) * 4;
        data[index] = color.r;
        data[index + 1] = color.g;
        data[index + 2] = color.b;
        data[index + 3] = 255;
    }

    colorsMatch(a, b, tolerance = 0) {
        return Math.abs(a.r - b.r) <= tolerance &&
            Math.abs(a.g - b.g) <= tolerance &&
            Math.abs(a.b - b.b) <= tolerance;
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    // Save current state for undo
    saveState() {
        if (this.undoStack.length >= this.maxUndoSteps) {
            this.undoStack.shift();
        }
        this.undoStack.push(this.canvas.toDataURL());
    }

    // Undo last action
    undo() {
        if (this.undoStack.length === 0) return;

        const imageData = this.undoStack.pop();
        const img = new Image();
        img.onload = () => {
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        };
        img.src = imageData;

        this.sendDrawData({
            type: 'undo',
            imageData: imageData
        });
    }

    // Clear canvas
    clear(sendEvent = true) {
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.undoStack = [];

        if (sendEvent) {
            this.sendDrawData({ type: 'clear' });
        }
    }

    // Set drawing color
    setColor(color) {
        this.currentColor = color;
    }

    // Set brush size
    setBrushSize(size) {
        this.brushSize = size;
    }

    // Set current tool
    setTool(tool) {
        this.currentTool = tool;
        this.canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
    }

    // Enable/disable drawing
    setEnabled(enabled) {
        this.isEnabled = enabled;
        this.canvas.style.cursor = enabled ? 'crosshair' : 'default';
    }

    // Send draw data callback
    sendDrawData(data) {
        if (this.onDraw) {
            this.onDraw(data);
        }
    }

    // Get canvas as image
    getImage() {
        return this.canvas.toDataURL();
    }
}

export default CanvasManager;
