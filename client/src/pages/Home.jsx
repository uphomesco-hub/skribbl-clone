import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

// Initial socket for creating/checking rooms. 
// Can be moved to context if needed later.
const socket = io('http://localhost:3001');

function Home() {
    const [username, setUsername] = useState('');
    const [roomId, setRoomId] = useState('');
    const navigate = useNavigate();

    const createRoom = () => {
        if (!username) return alert('Please enter a username');
        socket.emit('create_room', { username });
    };

    const joinRoom = () => {
        if (!username || !roomId) return alert('Please enter username and room ID');
        navigate(`/room/${roomId}?name=${username}`);
    };

    React.useEffect(() => {
        socket.on('room_created', ({ roomId }) => {
            navigate(`/room/${roomId}?name=${username}`);
        });

        return () => {
            socket.off('room_created');
        };
    }, [navigate, username]);

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-blue-500">
            <div className="bg-white p-8 rounded-lg shadow-lg text-center w-96">
                <h1 className="text-4xl font-bold mb-6 text-yellow-500">Skribbl Clone</h1>

                <input
                    type="text"
                    placeholder="Enter your name"
                    className="w-full p-2 mb-4 border-2 border-gray-300 rounded"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                />

                <div className="flex flex-col gap-4">
                    <button
                        onClick={createRoom}
                        className="w-full bg-green-500 text-white font-bold py-2 rounded hover:bg-green-600"
                    >
                        Create Private Room
                    </button>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Room ID"
                            className="w-full p-2 border-2 border-gray-300 rounded"
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value)}
                        />
                        <button
                            onClick={joinRoom}
                            className="bg-yellow-500 text-white font-bold py-2 px-4 rounded hover:bg-yellow-600"
                        >
                            Join
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Home;
