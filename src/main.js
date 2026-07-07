import { Chess } from 'chess.js';
import { BoardView } from './board.js';
import { Engine } from './engine.js';
import './styles.css';

const LEVELS = [
  { key: 'debutant', label: 'D\u00E9butant', hint: '\u2248 800 Elo', elo: 800, skillLevel: 0, moveTime: 300, limitStrength: true },
  { key: 'intermediaire', label: 'Interm\u00E9diaire', hint: '\u2248 1300 Elo', elo: 1300, skillLevel: 5, moveTime: 500, limitStrength: true },
  { key: 'avance', label: 'Avanc\u00E9', hint: '\u2248 1800 Elo', elo: 1800, skillLevel: 12, moveTime: 900, limitStrength: true },
  { key: 'expert', label: 'Expert', hint: 'Force maximale', elo: 2850, skillLevel: 20, moveTime: 1500, limitStrength: false }
];

const COLORS = [
  { key: 'w', label: 'Blancs', hint: 'Vous commencez' },
  { key: 'b', label: 'Noirs', hint: "L'IA commence" }
];

const game = new Chess();
let currentLevel = LEVELS[1];
let playerColor = 'w';
let colorChosen = false;
let gameStarted = false;
let selected = null;
let legalTargets = [];
let lastMove = null;
let aiThinking = false;
let engineReady = false;
let engineError = null;

const boardEl = document.getElementById('board');
const coordsEl = document.getElementById('coords');
const ranksEl = document.getElementById('ranks');
const statusEl = document.getElementById('status');
const levelsEl = document.getElementById('levels');
const colorsEl = document.getElementById('colors');
const capturedWhiteEl = document.getElementById('capturedWhite');
const capturedBlackEl = document.getElementById('capturedBlack');
const resetBtn = document.getElementById('resetBtn');
const undoBtn = document.getElementById('undoBtn');
const rulesBtn = document.getElementById('rulesBtn');
const welcomeOverlay = document.getElementById('welcomeOverlay');
const welcomeCloseBtn = document.getElementById('welcomeCloseBtn');

const boardView = new BoardView({ boardEl, coordsEl, ranksEl, onSquareClick });

const WELCOME_SEEN_KEY = 'echecs-welcome-seen';

function showWelcome() {
  welcomeOverlay.classList.add('visible');
}
function hideWelcome() {
  welcomeOverlay.classList.remove('visible');
  localStorage.setItem(WELCOME_SEEN_KEY, '1');
}
if (!localStorage.getItem(WELCOME_SEEN_KEY)) {
  showWelcome();
}
welcomeCloseBtn.addEventListener('click', hideWelcome);
rulesBtn.addEventListener('click', showWelcome);

let colorLocked = false;

function colorLabel(key) {
  return key === 'w' ? 'Blancs' : 'Noirs';
}

function revealActionButtons() {
  gameStarted = true;
  resetBtn.classList.remove('hidden-ingame');
  undoBtn.classList.remove('hidden-ingame');
}
function renderLevels() {
  levelsEl.innerHTML = '';
  LEVELS.forEach((lvl) => {
    const btn = document.createElement('button');
    btn.className = 'level-btn' + (lvl.key === currentLevel.key ? ' active' : '');
    btn.disabled = aiThinking;
    btn.innerHTML = `<span>${lvl.label}</span><small>${lvl.hint}</small>`;
    btn.onclick = () => {
      currentLevel = lvl;
      sendLevelToEngine();
      renderLevels();
    };
    levelsEl.appendChild(btn);
  });
}

function sendLevelToEngine() {
  if (!engineReady) return;
  engine.setLevel(currentLevel);
}

const engine = new Engine({
  onReady: () => {
    engineReady = true;
    engineError = null;
    sendLevelToEngine();
    updateStatus();
    maybeTriggerEngineOpeningMove();
  },
  onBestmove: (move) => {
    applyEngineMove(move);
  },
  onError: (message) => {
    engineError = message;
    aiThinking = false;
    updateStatus();
    console.error('[stockfish]', message);
  }
});

function renderColors() {
  if (colorLocked) {
    colorsEl.innerHTML = '';
    const note = document.createElement('div');
    note.className = 'colors-note';
    note.innerHTML = `Vous jouez actuellement les <strong>${colorLabel(playerColor)}</strong>. La couleur alterne automatiquement \u00E0 chaque nouvelle partie.`;
    colorsEl.appendChild(note);
    return;
  }
  colorsEl.innerHTML = '';
  COLORS.forEach((c) => {
    const btn = document.createElement('button');
    btn.className = 'level-btn' + (c.key === playerColor && colorChosen ? ' active' : '');
    btn.disabled = aiThinking;
    btn.innerHTML = `<span>${c.label}</span><small>${c.hint}</small>`;
    btn.onclick = () => {
      playerColor = c.key;
      colorChosen = true;
      colorLocked = true;
      boardView.setFlipped(playerColor === 'b');
      updateStatus();
      renderColors();
      maybeTriggerEngineOpeningMove();
    };
    colorsEl.appendChild(btn);
  });
}

function onSquareClick(id) {
  if (!colorChosen || !engineReady || aiThinking || game.isGameOver()) return;
  if (game.turn() !== playerColor) return;

  if (selected) {
    if (legalTargets.includes(id)) {
      makeHumanMove(selected, id);
      selected = null;
      legalTargets = [];
      render();
      afterPlyPlayed();
      return;
    }
    const piece = game.get(id);
    if (piece && piece.color === playerColor) {
      selectSquare(id);
    } else {
      selected = null;
      legalTargets = [];
      render();
    }
  } else {
    const piece = game.get(id);
    if (piece && piece.color === playerColor) {
      selectSquare(id);
    }
  }
}

function selectSquare(id) {
  selected = id;
  const moves = game.moves({ square: id, verbose: true });
  legalTargets = moves.map((m) => m.to);
  render();
}

function makeHumanMove(from, to) {
  const moves = game.moves({ square: from, verbose: true });
  const needsPromotion = moves.some((m) => m.to === to && m.promotion);
  const moveObj = { from, to };
  if (needsPromotion) moveObj.promotion = 'q';
  const result = game.move(moveObj);
  if (result) lastMove = { from: result.from, to: result.to };
  if (result && !gameStarted) revealActionButtons();
  return result;
}
function afterPlyPlayed() {
  updateStatus();
  if (game.isGameOver()) return;
  aiThinking = true;
  renderLevels();
  renderColors();
  updateStatus();
  engine.go(game.fen());
}

function applyEngineMove(msg) {
  const moveObj = { from: msg.from, to: msg.to };
  if (msg.promotion) moveObj.promotion = msg.promotion;
  const result = game.move(moveObj);
  aiThinking = false;
  if (result) {
    lastMove = { from: result.from, to: result.to };
  } else {
    engineError = `Coup re\u00E7u du moteur invalide (${msg.from}${msg.to}) \u2014 position d\u00E9synchronis\u00E9e.`;
  }
  if (result && !gameStarted) revealActionButtons();
  render();
  renderLevels();
  renderColors();
  updateStatus();
}

function maybeTriggerEngineOpeningMove() {
  if (colorChosen && playerColor === 'b' && game.turn() === 'w' && game.history().length === 0 && !aiThinking) {
    aiThinking = true;
    renderLevels();
    renderColors();
    updateStatus();
    engine.go(game.fen());
  }
}

function updateCaptured() {
  const history = game.history({ verbose: true });
  const byWhite = [];
  const byBlack = [];
  history.forEach((m) => {
    if (m.captured) {
      const sym = m.color === 'w' ? m.captured.toUpperCase() : m.captured;
      const symbolMap = { p: '\u265F', n: '\u265E', b: '\u265D', r: '\u265C', q: '\u265B', P: '\u2659', N: '\u2658', B: '\u2657', R: '\u2656', Q: '\u2655' };
      if (m.color === 'w') byWhite.push(symbolMap[sym]);
      else byBlack.push(symbolMap[sym]);
    }
  });
  capturedWhiteEl.textContent = byWhite.join(' ');
  capturedBlackEl.textContent = byBlack.join(' ');
}
function updateStatus() {
  if (!colorChosen) {
    statusEl.innerHTML = '';
    return;
  }
  if (engineError) {
    statusEl.innerHTML = `<span class="error">${engineError}</span>`;
    return;
  }
  if (!engineReady) {
    statusEl.innerHTML = `<span class="thinking">Chargement du moteur Stockfish\u2026</span>`;
    return;
  }
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'Les noirs' : 'Les blancs';
    const winnerIsPlayer = game.turn() !== playerColor;
    statusEl.innerHTML = `<span class="turn">\u00C9chec et mat.</span> ${winner} gagnent${winnerIsPlayer ? ' (vous)' : ' (Stockfish)'}.`;
    return;
  }
  if (game.isStalemate() || game.isThreefoldRepetition() || game.isDraw()) {
    statusEl.innerHTML = `<span class="turn">Partie nulle.</span>`;
    return;
  }
  if (aiThinking) {
    statusEl.innerHTML = `<span class="thinking">Stockfish (${currentLevel.label}) r\u00E9fl\u00E9chit\u2026</span>`;
    return;
  }
  if (game.history().length === 0) {
    const oppColor = playerColor === 'w' ? 'b' : 'w';
    statusEl.innerHTML = `<span class="turn">Vous jouez les ${colorLabel(playerColor)}</span> \u2014 Stockfish joue les ${colorLabel(oppColor)}`;
    return;
  }
  const isPlayerTurn = game.turn() === playerColor;
  const turnLabel = isPlayerTurn ? '\u00C0 vous de jouer' : 'Tour de Stockfish';
  const checkLabel = game.inCheck() ? ' \u2014 \u00E9chec !' : '';
  statusEl.innerHTML = `<span class="turn">${turnLabel}</span>${checkLabel}`;
}

function render() {
  boardView.render({ game, selected, legalTargets, lastMove, playerColor });
  updateCaptured();
}

function resetGame() {
  engine.stop();
  game.reset();
  selected = null;
  legalTargets = [];
  lastMove = null;
  aiThinking = false;
  engineError = null;
  render();
  updateStatus();
  maybeTriggerEngineOpeningMove();
}

function undoLastPlayerMove() {
  if (aiThinking || game.history().length === 0) return;
  engine.stop();
  const undoTwice = game.turn() === playerColor;
  game.undo();
  if (undoTwice && game.history().length > 0) game.undo();
  selected = null;
  legalTargets = [];
  const hist = game.history({ verbose: true });
  lastMove = hist.length ? { from: hist[hist.length - 1].from, to: hist[hist.length - 1].to } : null;
  aiThinking = false;
  engineError = null;
  render();
  renderLevels();
  renderColors();
  updateStatus();
}

function startNewGame() {
  if (colorLocked && colorChosen) {
    playerColor = playerColor === 'w' ? 'b' : 'w';
    boardView.setFlipped(playerColor === 'b');
  }
  renderColors();
  resetGame();
}

resetBtn.addEventListener('click', startNewGame);
undoBtn.addEventListener('click', undoLastPlayerMove);

boardView.setFlipped(false);
renderLevels();
renderColors();
render();
updateStatus();