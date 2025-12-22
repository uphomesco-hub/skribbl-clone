import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import io from 'socket.io-client';
import Canvas from '../components/Canvas';

const socket = io('http://localhost:3001');

function Room() {
    const { roomId } = useParams();
    const [searchParams] = useSearchParams();
    const username = searchParams.get('name');

    // Simple "first player is drawer" logic for now, or just allow everyone to draw for prototype
    // Better: Store host/drawer in state. 
    // For this quick iteration: Everyone can draw to test sync easily.
    const [isDrawer, setIsDrawer] = useState(true);

    useEffect(() => {
        socket.emit('join_room', { roomId, username });

        // Cleanup
        return () => {
            socket.off('join_room');
        };
    }, [roomId, username]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
            <div className="flex justify-between w-full max-w-4xl mb-4">
                <div>
                    <h1 className="text-2xl font-bold">Room: {roomId}</h1>
                    <h2 className="text-xl">Player: {username}</h2>
                </div>
                <div className="text-right">
                    <p>Share this link to invite!</p>
                </div>
            </div>

            <div className="flex gap-4">
                <div className="bg-white p-2 rounded shadow">
                    <Canvas socket={socket} roomId={roomId} isDrawer={isDrawer} />
                </div>
            </div>
        </div>
    );
}

export default Room;
