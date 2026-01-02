# Skribbl Clone

A multiplayer drawing and guessing game similar to skribbl.io. Built with vanilla HTML, CSS, and JavaScript using PeerJS for real-time peer-to-peer communication.

## Features

- 🎨 Real-time drawing canvas with multiple tools
- 👥 Multiplayer support (2-8 players)
- 💬 Live chat and guessing system  
- 🏆 Scoring system with leaderboard
- 📱 Responsive design (mobile & desktop)
- 🔗 Shareable room links
- 🌍 Multiple language word lists
- ⚙️ Customizable game settings

## How to Play

1. **Create a Room**: Enter your name and click "Create Room"
2. **Configure Settings**: Set draw time, rounds, hints, etc.
3. **Invite Friends**: Share the room link or code
4. **Start Game**: Once 2+ players join, click "Start Game"
5. **Take Turns**: 
   - Drawer selects a word and draws
   - Others guess in the chat
   - Correct guesses earn points!

## Game Settings

| Setting | Options | Default |
|---------|---------|---------|
| Players | 2-8 | 8 |
| Draw Time | 30-120 seconds | 80 |
| Rounds | 1-10 | 3 |
| Hints | 0-5 | 2 |
| Word Count | 1-5 | 3 |

## Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Real-time**: PeerJS (WebRTC)
- **Hosting**: GitHub Pages (static)

## Running Locally

```bash
# Using any static server
npx serve .

# Or Python
python -m http.server 8000
```

Then open `http://localhost:8000` (or `:3000` for serve)

## Deployment

Hosted on GitHub Pages at: [your-username.github.io/skribbl-clone](https://your-username.github.io/skribbl-clone)

## Architecture

The game uses a peer-to-peer architecture where the room host acts as the game server:

```
Host (Room Creator)
  ├── Manages game state
  ├── Validates guesses
  └── Relays messages

Players (Guests)
  └── Connect directly to host via WebRTC
```

## License

MIT
