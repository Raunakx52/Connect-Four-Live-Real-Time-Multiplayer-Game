const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const ROWS = 6;
const COLS = 7;
const rooms = new Map();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.json({ ok: true }));

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function sanitizeName(name) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 18);
  return clean || 'Player';
}

function publicRoomState(room) {
  return {
    code: room.code,
    board: room.board,
    currentTurn: room.currentTurn,
    status: room.status,
    winner: room.winner,
    players: room.players.map(({ id, name, color }) => ({ id, name, color }))
  };
}

function emitRoom(room) {
  io.to(room.code).emit('roomState', publicRoomState(room));
}

function resetGame(room) {
  room.board = emptyBoard();
  room.currentTurn = 0;
  room.status = room.players.length === 2 ? 'playing' : 'waiting';
  room.winner = null;
  room.rematchVotes = new Set();
}

function getDropRow(board, col) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === null) return row;
  }
  return -1;
}

function isWinningMove(board, row, col, playerIndex) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];

  for (const [dr, dc] of directions) {
    let count = 1;

    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (
        r >= 0 && r < ROWS &&
        c >= 0 && c < COLS &&
        board[r][c] === playerIndex
      ) {
        count++;
        r += dr * sign;
        c += dc * sign;
      }
    }

    if (count >= 4) return true;
  }
  return false;
}

function isBoardFull(board) {
  return board[0].every(cell => cell !== null);
}

function leaveCurrentRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;

  const room = rooms.get(code);
  socket.leave(code);
  delete socket.data.roomCode;

  if (!room) return;

  room.players = room.players.filter(player => player.id !== socket.id);
  room.rematchVotes.delete(socket.id);

  if (room.players.length === 0) {
    rooms.delete(code);
    return;
  }

  resetGame(room);
  emitRoom(room);
}

io.on('connection', socket => {
  socket.on('createRoom', ({ name } = {}, callback = () => {}) => {
    leaveCurrentRoom(socket);

    const code = makeRoomCode();
    const room = {
      code,
      players: [{ id: socket.id, name: sanitizeName(name), color: 'red' }],
      board: emptyBoard(),
      currentTurn: 0,
      status: 'waiting',
      winner: null,
      rematchVotes: new Set()
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    callback({ ok: true, code, playerIndex: 0 });
    emitRoom(room);
  });

  socket.on('joinRoom', ({ code, name } = {}, callback = () => {}) => {
    leaveCurrentRoom(socket);

    const normalizedCode = String(code || '').trim().toUpperCase();
    const room = rooms.get(normalizedCode);

    if (!room) return callback({ ok: false, error: 'Room not found.' });
    if (room.players.length >= 2) return callback({ ok: false, error: 'Room is full.' });

    room.players.push({ id: socket.id, name: sanitizeName(name), color: 'yellow' });
    socket.join(normalizedCode);
    socket.data.roomCode = normalizedCode;
    resetGame(room);

    callback({ ok: true, code: normalizedCode, playerIndex: 1 });
    emitRoom(room);
  });

  socket.on('dropPiece', ({ column } = {}, callback = () => {}) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return callback({ ok: false, error: 'Room no longer exists.' });
    if (room.status !== 'playing') return callback({ ok: false, error: 'Game is not active.' });

    const playerIndex = room.players.findIndex(player => player.id === socket.id);
    if (playerIndex === -1) return callback({ ok: false, error: 'You are not a player in this room.' });
    if (playerIndex !== room.currentTurn) return callback({ ok: false, error: 'It is not your turn.' });

    const col = Number(column);
    if (!Number.isInteger(col) || col < 0 || col >= COLS) {
      return callback({ ok: false, error: 'Invalid column.' });
    }

    const row = getDropRow(room.board, col);
    if (row === -1) return callback({ ok: false, error: 'That column is full.' });

    room.board[row][col] = playerIndex;

    if (isWinningMove(room.board, row, col, playerIndex)) {
      room.status = 'finished';
      room.winner = playerIndex;
    } else if (isBoardFull(room.board)) {
      room.status = 'draw';
      room.winner = null;
    } else {
      room.currentTurn = room.currentTurn === 0 ? 1 : 0;
    }

    callback({ ok: true });
    emitRoom(room);
  });

  socket.on('requestRematch', (_payload, callback = () => {}) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.players.length !== 2) {
      return callback({ ok: false, error: 'Both players must be connected.' });
    }
    if (!['finished', 'draw'].includes(room.status)) {
      return callback({ ok: false, error: 'Finish the current game first.' });
    }

    room.rematchVotes.add(socket.id);
    callback({ ok: true, votes: room.rematchVotes.size });

    if (room.rematchVotes.size === 2) {
      // Alternate who starts each completed game.
      room.players.reverse();
      room.players[0].color = 'red';
      room.players[1].color = 'yellow';
      resetGame(room);
    }
    emitRoom(room);
  });

  socket.on('leaveRoom', () => leaveCurrentRoom(socket));
  socket.on('disconnect', () => leaveCurrentRoom(socket));
});

server.listen(PORT, () => {
  console.log(`Connect Four Live running on port ${PORT}`);
});
