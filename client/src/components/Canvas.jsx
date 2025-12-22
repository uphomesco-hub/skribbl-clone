import React, { useRef, useEffect, useState } from 'react';

function Canvas({ socket, roomId, isDrawer }) {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const contextRef = useRef(null);
    const color = '#000000'; // Hardcoded for now, can extend
    const lineWidth = 5;

    useEffect(() => {
        const canvas = canvasRef.current;
        canvas.width = 800;
        canvas.height = 600;

        const ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        contextRef.current = ctx;

        // Listen for drawing events from server
        socket.on('draw_line', ({ x0, y0, x1, y1, color, width }) => {
            const ctx = contextRef.current;
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
            ctx.closePath();
        });

        // Listen for clear
        socket.on('clear_canvas', () => {
            const ctx = contextRef.current;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });

        return () => {
            socket.off('draw_line');
            socket.off('clear_canvas');
        };
    }, [socket]);

    const startDrawing = ({ nativeEvent }) => {
        if (!isDrawer) return;
        const { offsetX, offsetY } = nativeEvent;
        setIsDrawing(true);
        // Just set starting point, don't draw yet or standard line logic
        // We typically track "last position"
        contextRef.current.lastX = offsetX;
        contextRef.current.lastY = offsetY;
    };

    const draw = ({ nativeEvent }) => {
        if (!isDrawing || !isDrawer) return;

        const { offsetX, offsetY } = nativeEvent;

        // Draw locally
        const ctx = contextRef.current;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(ctx.lastX, ctx.lastY);
        ctx.lineTo(offsetX, offsetY);
        ctx.stroke();
        ctx.closePath();

        // Emit
        socket.emit('draw_line', {
            roomId,
            x0: ctx.lastX,
            y0: ctx.lastY,
            x1: offsetX,
            y1: offsetY,
            color,
            width: lineWidth
        });

        ctx.lastX = offsetX;
        ctx.lastY = offsetY;
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        contextRef.current.clearRect(0, 0, canvas.width, canvas.height);
        socket.emit('clear_canvas', { roomId });
    };

    return (
        <div className="flex flex-col items-center">
            <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="border-2 border-black bg-white cursor-crosshair"
                style={{ width: '800px', height: '600px', touchAction: 'none' }}
            />
            {isDrawer && (
                <button
                    onClick={clearCanvas}
                    className="mt-2 bg-red-500 text-white px-4 py-2 rounded"
                >
                    Clear Canvas
                </button>
            )}
        </div>
    );
}

export default Canvas;
