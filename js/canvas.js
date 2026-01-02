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

        this.dpr = 1;
        this.logicalWidth = 0;
        this.logicalHeight = 0;

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

        // Save current canvas content (in device pixels) so we can redraw it after resize.
        const prevCanvas = document.createElement('canvas');
        prevCanvas.width = this.canvas.width;
        prevCanvas.height = this.canvas.height;
        const prevCtx = prevCanvas.getContext('2d');
        if (prevCtx && this.canvas.width > 0 && this.canvas.height > 0) {
            prevCtx.drawImage(this.canvas, 0, 0);
        }

        const dpr = window.devicePixelRatio || 1;
        const logicalWidth = Math.max(1, Math.floor(rect.width));
        const logicalHeight = Math.max(1, Math.floor(rect.height));
        const pixelWidth = Math.max(1, Math.floor(logicalWidth * dpr));
        const pixelHeight = Math.max(1, Math.floor(logicalHeight * dpr));

        this.dpr = dpr;
        this.logicalWidth = logicalWidth;
        this.logicalHeight = logicalHeight;

        // Set canvas buffer size in device pixels, keep CSS size in logical pixels.
        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;
        this.canvas.style.width = `${logicalWidth}px`;
        this.canvas.style.height = `${logicalHeight}px`;

        // Restore canvas settings
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        // Fill with white background
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);

        // Restore previous content (scaled to the new size).
        if (prevCanvas.width > 0 && prevCanvas.height > 0) {
            this.ctx.drawImage(
                prevCanvas,
                0, 0, prevCanvas.width, prevCanvas.height,
                0, 0, this.logicalWidth, this.logicalHeight
            );
        }

        console.log('Canvas resized to:', this.logicalWidth, 'x', this.logicalHeight, `(dpr ${this.dpr})`);
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
            x: Math.max(0, Math.min(this.logicalWidth || rect.width, e.clientX - rect.left)),
            y: Math.max(0, Math.min(this.logicalHeight || rect.height, e.clientY - rect.top))
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
        const denormalize = (x, y) => {
            if (!data.normalized) return { x, y };
            return {
                x: x * (this.logicalWidth || this.canvas.getBoundingClientRect().width),
                y: y * (this.logicalHeight || this.canvas.getBoundingClientRect().height)
            };
        };

        switch (data.type) {
            case 'start':
                {
                    const p = denormalize(data.x, data.y);
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p.x + 0.1, p.y + 0.1);
                    this.ctx.strokeStyle = data.color;
                    this.ctx.lineWidth = data.size;
                    this.ctx.stroke();
                }
                break;

            case 'draw':
                {
                    const from = denormalize(data.fromX, data.fromY);
                    const to = denormalize(data.toX, data.toY);
                    this.ctx.beginPath();
                    this.ctx.moveTo(from.x, from.y);
                    this.ctx.lineTo(to.x, to.y);
                    this.ctx.strokeStyle = data.color;
                    this.ctx.lineWidth = data.size;
                    this.ctx.stroke();
                }
                break;

            case 'fill':
                {
                    const p = denormalize(data.x, data.y);
                    this.fill(p.x, p.y, data.color);
                }
                break;

            case 'clear':
                this.clear(false);
                break;

            case 'undo':
                if (data.imageData) {
                    const img = new Image();
                    img.onload = () => {
                        this.ctx.fillStyle = '#FFFFFF';
                        this.ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
                        this.ctx.drawImage(img, 0, 0, this.logicalWidth, this.logicalHeight);
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

        const scale = this.dpr || 1;
        x = Math.floor(x * scale);
        y = Math.floor(y * scale);
        if (x < 0 || x >= width || y < 0 || y >= height) return;

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
            this.ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
            this.ctx.drawImage(img, 0, 0, this.logicalWidth, this.logicalHeight);
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
        const w = this.logicalWidth || this.canvas.getBoundingClientRect().width || this.canvas.width;
        const h = this.logicalHeight || this.canvas.getBoundingClientRect().height || this.canvas.height;
        this.ctx.fillRect(0, 0, w, h);
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
        // Normalize coordinate payloads so drawings render correctly across different canvas sizes.
        const normalize = (x, y) => ({
            x: x / (this.logicalWidth || 1),
            y: y / (this.logicalHeight || 1)
        });

        if (this.onDraw) {
            if (data.type === 'start') {
                const p = normalize(data.x, data.y);
                this.onDraw({ ...data, ...p, normalized: true });
                return;
            }
            if (data.type === 'draw') {
                const from = normalize(data.fromX, data.fromY);
                const to = normalize(data.toX, data.toY);
                this.onDraw({
                    ...data,
                    fromX: from.x,
                    fromY: from.y,
                    toX: to.x,
                    toY: to.y,
                    normalized: true
                });
                return;
            }
            if (data.type === 'fill') {
                const p = normalize(data.x, data.y);
                this.onDraw({ ...data, ...p, normalized: true });
                return;
            }

            this.onDraw(data);
        }
    }

    // Get canvas as image
    getImage() {
        return this.canvas.toDataURL();
    }
}

export default CanvasManager;
