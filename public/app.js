const socket = io();

const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const createName = document.getElementById('createName');
const joinName = document.getElementById('joinName');
const roomCodeInput = document.getElementById('roomCode');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const copyCodeBtn = document.getElementById('copyCode');
const leaveBtn = document.getElementById('leaveBtn');
const rematchBtn = document.getElementById('rematchBtn');
const playersEl = document.getElementById('players');
const boardEl = document.getElementById('board');
const columnButtonsEl = document.getElementById('columnButtons');
const statusText = document.getElementById('statusText');
const messageEl = document.getElementById('message');
const connectionBadge = document.getElementById('connectionBadge');

let myPlayerIndex = null;
let currentState = null;

for (let col = 0; col < 7; col++) {
  const button = document.createElement('button');
  button.className = 'column-button';
  button.textContent = `▼ ${col + 1}`;
  button.setAttribute('aria-label', `Drop disc in column ${col + 1}`);
  button.addEventListener('click', () => dropPiece(col));
  columnButtonsEl.appendChild(button);
}

function showMessage(text = '') {
  messageEl.textContent = text;
}

function enterGame(code, playerIndex) {
  myPlayerIndex = playerIndex;
  copyCodeBtn.textContent = code;
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
  showMessage('');
}

function exitGame() {
  myPlayerIndex = null;
  currentState = null;
  game.classList.add('hidden');
  lobby.classList.remove('hidden');
  showMessage('');
}

function playerLabel(index) {
  if (!currentState?.players[index]) return 'Player';
  const player = currentState.players[index];
  const isMe = player.id === socket.id;
  return `${player.name}${isMe ? ' (you)' : ''}`;
}

function renderPlayers() {
  playersEl.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    const player = currentState.players[i];
    const card = document.createElement('div');
    card.className = 'player-card';
    if (currentState.status === 'playing' && currentState.currentTurn === i) card.classList.add('active');

    const dot = document.createElement('span');
    dot.className = `dot ${i === 0 ? 'red' : 'yellow'}`;

    const meta = document.createElement('div');
    meta.className = 'player-meta';

    const name = document.createElement('div');
    name.className = 'player-name';
    name.textContent = player ? `${player.name}${player.id === socket.id ? ' (you)' : ''}` : 'Waiting…';

    const role = document.createElement('div');
    role.className = 'player-role';
    role.textContent = i === 0 ? 'Red discs' : 'Yellow discs';

    meta.append(name, role);
    card.append(dot, meta);
    playersEl.appendChild(card);
  }
}

function renderBoard() {
  boardEl.innerHTML = '';
  currentState.board.flat().forEach(value => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    if (value === 0) cell.classList.add('red');
    if (value === 1) cell.classList.add('yellow');
    boardEl.appendChild(cell);
  });
}

function renderStatus() {
  const { status, currentTurn, winner, players } = currentState;
  const myTurn = status === 'playing' && currentTurn === myPlayerIndex;

  if (status === 'waiting') {
    statusText.textContent = 'Waiting for opponent…';
  } else if (status === 'playing') {
    statusText.textContent = myTurn ? 'Your turn' : `${playerLabel(currentTurn)}'s turn`;
  } else if (status === 'finished') {
    statusText.textContent = winner === myPlayerIndex ? 'You won! 🎉' : `${playerLabel(winner)} won`;
  } else if (status === 'draw') {
    statusText.textContent = 'Draw game';
  }

  rematchBtn.classList.toggle('hidden', !['finished', 'draw'].includes(status));

  const buttons = [...columnButtonsEl.children];
  buttons.forEach((button, col) => {
    const columnFull = currentState.board[0][col] !== null;
    button.disabled = !myTurn || columnFull || players.length < 2;
  });
}

function render() {
  if (!currentState) return;
  copyCodeBtn.textContent = currentState.code;
  renderPlayers();
  renderBoard();
  renderStatus();
}

function createRoom() {
  showMessage('');
  socket.emit('createRoom', { name: createName.value }, response => {
    if (!response.ok) return showMessage(response.error || 'Could not create room.');
    enterGame(response.code, response.playerIndex);
  });
}

function joinRoom() {
  showMessage('');
  socket.emit('joinRoom', {
    name: joinName.value,
    code: roomCodeInput.value
  }, response => {
    if (!response.ok) return showMessage(response.error || 'Could not join room.');
    enterGame(response.code, response.playerIndex);
  });
}

function dropPiece(column) {
  showMessage('');
  socket.emit('dropPiece', { column }, response => {
    if (!response.ok) showMessage(response.error || 'Move rejected.');
  });
}

createBtn.addEventListener('click', createRoom);
joinBtn.addEventListener('click', joinRoom);
roomCodeInput.addEventListener('input', () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
});
roomCodeInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') joinRoom();
});

copyCodeBtn.addEventListener('click', async () => {
  const code = currentState?.code;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    showMessage('Room code copied.');
  } catch {
    showMessage(`Room code: ${code}`);
  }
});

leaveBtn.addEventListener('click', () => {
  socket.emit('leaveRoom');
  exitGame();
});

rematchBtn.addEventListener('click', () => {
  socket.emit('requestRematch', {}, response => {
    if (!response.ok) return showMessage(response.error || 'Could not request rematch.');
    showMessage(response.votes === 1 ? 'Rematch requested. Waiting for the other player…' : 'Rematch starting…');
  });
});

socket.on('roomState', state => {
  currentState = state;
  const index = state.players.findIndex(player => player.id === socket.id);
  if (index !== -1) myPlayerIndex = index;
  render();
});

socket.on('connect', () => {
  connectionBadge.textContent = '● Online';
  connectionBadge.classList.add('online');
});

socket.on('disconnect', () => {
  connectionBadge.textContent = 'Offline';
  connectionBadge.classList.remove('online');
  showMessage('Connection lost. Trying to reconnect…');
});
