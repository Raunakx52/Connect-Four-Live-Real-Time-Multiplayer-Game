# Connect Four Live

A real-time two-player Connect Four game that works across separate devices.

## Features

- Two players can join from different phones/computers.
- Shareable 5-character room codes.
- Real-time turns with Socket.IO.
- Server-side move validation.
- Horizontal, vertical, and diagonal win detection.
- Draw detection and rematches.
- Visible rules in the UI.
- Responsive layout for desktop and mobile.

## Rules

1. Two players take turns dropping one disc into any non-full column.
2. A disc falls to the lowest empty cell in that column.
3. The first player to connect four discs horizontally, vertically, or diagonally wins.
4. If the board fills without a winner, the game is a draw.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

To test multiplayer locally, open the site in two browser windows. For separate physical devices on the same Wi-Fi, use your computer's LAN IP, such as `http://192.168.1.10:3000`, and allow the port through your firewall if needed.

## Deploy to Render

1. Put this folder in a GitHub repository.
2. In Render, choose **New > Blueprint** (or **Web Service**).
3. Connect the repository.
4. Render will detect `render.yaml`, install dependencies, and run `npm start`.
5. Open the public `https://...onrender.com` URL on two different devices.

No database is required. Rooms live in server memory and disappear when the server restarts, which is fine for this project/demo.

## Suggested submission demo

- Device 1 creates a room.
- Device 2 opens the same public URL and joins with the room code.
- Show alternating moves from both devices.
- Complete a four-in-a-row and show the win state.
- Use the rematch button.
