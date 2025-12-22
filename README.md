# Skribbl Clone

A simple multiplayer drawing game clone using React, Node.js, and Socket.io.

## Prerequisites
- Node.js (v14 or higher)

## Setup

1. **Install Dependencies**
   ```bash
   # Server
   cd server
   npm install

   # Client
   cd ../client
   npm install
   ```

2. **Run the Application**
   You need two terminals.

   **Terminal 1 (Server):**
   ```bash
   cd server
   node index.js
   ```
   Server runs on http://localhost:3001

   **Terminal 2 (Client):**
   ```bash
   cd client
   npm run dev
   ```
   Client runs on http://localhost:5173

3. **How to Play**
   - Open http://localhost:5173
   - Enter your name and click "Create Private Room".
   - Copy the URL (e.g., `http://localhost:5173/room/ABCD...`).
   - Share the URL with a friend (or open in a new tab/window).
   - Both players can draw on the white canvas!

## Features
- Create/Join Rooms
- Real-time Drawing Sync
- Multiplayer Lobby
