import { Chess } from 'chess.js';
import { BoardView } from './board.js';
import { Engine } from './engine.js';
import './styles.css';

// --- Niveaux de difficulté, mappés sur les paramètres UCI de Stockfish ---
// (cf. brief : UCI_LimitStrength / UCI_Elo, avec Skill Level en complément
// pour mieux dégrader le jeu aux niveaux faibles, où Stockfish reste souvent
// trop fort même avec un Elo bas). Le moteur clampe lui-même UCI_Elo à sa
// plage supportée si on lui donne une valeur hors bornes.
const LEVELS = [
  { key: 'debutant', label: 'Débutant', hint: '≈ 800 Elo', elo: 800, skillLevel: 0, moveTime: 300, limitStrength: true },
  { key: 'intermediaire', label: 'Intermédiaire', hint: '≈ 1300 Elo', elo: 1300, skillLevel: 5, moveTime: 500, limitStrength: true },
  { key: 'avance', label: 'Avancé', hint: '≈ 1800 Elo', elo: 1800, skillLevel: 12, moveTime: 900, limitStrength: true },
  { key: 'expert', label: 'Expert', hint: 'Force maximale', elo: 2850, skillLevel: 20, moveTime: 1500, limitStrength: false }
];

const COLORS = [
  { key: 'w', label: 'Blancs', hint: 'Vous commencez' },
  { key: 'b', label: 'Noirs', hint: "L'IA commence" }
];

// --- État ---
const game = new Chess();
let currentLevel = LEVELS[1];
let playerColor = 'w';
let selected = null;
let legalTargets = [];
let lastMove = null;
let aiThinking = false;
let engineReady = false;
let engineError = null;

// --- DOM ---
const boardEl = document.getElementById('board');
const coordsEl = document.getElementById('coords');
const statusEl = document.getElementById('status');
const levelsEl = document.getElementById('levels');
const colorsEl = document.getElementById('colors');
const capturedWhiteEl = document.getElementById('capturedWhite');
const capturedBlackEl = document.getElementById('capturedBlack');
const historyEl = document.getElementById('history');
const subtitleEl = document.getElementById('subtitle');
const resetBtn = document.getElementById('resetBtn');
const undoBtn = document.getElementById('undoBtn');

const boardView = new BoardView({ boardEl, coordsEl, onSquareClick });

// --- Moteur Stockfish ---
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
    // eslint-disable-next-line no-console
    console.error('[stockfish]', message);
  }
});

function sendLevelToEngine() {
  if (!engineReady) return;
  engine.setLevel(currentLevel);
}

// --- Rendu des panneaux de niveau / couleur ---
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

function renderColors() {
  colorsEl.innerHTML = '';
  COLORS.forEach((c) => {
    const btn = document.createElement('button');
    btn.className = 'level-btn' + (c.key === playerColor ? ' active' : '');
    btn.disabled = aiThinking;
    btn.innerHTML = `<span>${c.label}</span><small>${c.hint}</small>`;
    btn.onclick = () => {
      if (c.key === playerColor) return;
      playerColor = c.key;
      boardView.setFlipped(playerColor === 'b');
      subtitleEl.textContent =
        playerColor === 'w'
          ? "Vous jouez les blancs — Stockfish joue les noirs"
          : "Vous jouez les noirs — Stockfish joue les blancs";
      resetGame();
      renderColors();
    };
    colorsEl.appendChild(btn);
  });
}

// --- Interaction plateau ---
function onSquareClick(id) {
  if (!engineReady || aiThinking || game.isGameOver()) return;
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
  if (needsPromotion) moveObj.promotion = 'q'; // simplification : promotion automatique en dame
  const result = game.move(moveObj);
  if (result) lastMove = { from: result.from, to: result.to };
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
    engineError = `Coup reçu du moteur invalide (${msg.from}${msg.to}) — position désynchronisée.`;
  }
  render();
  renderLevels();
  renderColors();
  updateStatus();
}

function maybeTriggerEngineOpeningMove() {
  // Si le joueur a choisi les noirs, Stockfish (blancs) doit jouer en premier.
  if (playerColor === 'b' && game.turn() === 'w' && game.history().length === 0 && !aiThinking) {
    aiThinking = true;
    renderLevels();
    renderColors();
    updateStatus();
    engine.go(game.fen());
  }
}

// --- Historique / captures ---
function updateCaptured() {
  const history = game.history({ verbose: true });
  const byWhite = [];
  const byBlack = [];
  history.forEach((m) => {
    if (m.captured) {
      const sym = m.color === 'w' ? m.captured.toUpperCase() : m.captured;
      const symbolMap = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕' };
      if (m.color === 'w') byWhite.push(symbolMap[sym]);
      else byBlack.push(symbolMap[sym]);
    }
  });
  capturedWhiteEl.textContent = byWhite.join(' ');
  capturedBlackEl.textContent = byBlack.join(' ');
}

function updateHistory() {
  const history = game.history();
  historyEl.innerHTML = '';
  for (let i = 0; i < history.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    const white = history[i] || '';
    const black = history[i + 1] || '';

    const numEl = document.createElement('div');
    numEl.className = 'num';
    numEl.textContent = `${num}.`;

    const whiteEl = document.createElement('div');
    whiteEl.textContent = white;

    const blackEl = document.createElement('div');
    blackEl.textContent = black;

    historyEl.appendChild(numEl);
    historyEl.appendChild(whiteEl);
    historyEl.appendChild(blackEl);
  }
  historyEl.scrollTop = historyEl.scrollHeight;
}

// --- Statut ---
function updateStatus() {
  if (engineError) {
    statusEl.innerHTML = `<span class="error">${engineError}</span>`;
    return;
  }
  if (!engineReady) {
    statusEl.innerHTML = `<span class="thinking">Chargement du moteur Stockfish…</span>`;
    return;
  }
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'Les noirs' : 'Les blancs';
    const winnerIsPlayer = game.turn() !== playerColor;
    statusEl.innerHTML = `<span class="turn">Échec et mat.</span> ${winner} gagnent${winnerIsPlayer ? ' (vous)' : ' (Stockfish)'}.`;
    return;
  }
  if (game.isStalemate() || game.isThreefoldRepetition() || game.isDraw()) {
    statusEl.innerHTML = `<span class="turn">Partie nulle.</span>`;
    return;
  }
  if (aiThinking) {
    statusEl.innerHTML = `<span class="thinking">Stockfish (${currentLevel.label}) réfléchit…</span>`;
    return;
  }
  const isPlayerTurn = game.turn() === playerColor;
  const turnLabel = isPlayerTurn ? 'À vous de jouer' : 'Tour de Stockfish';
  const checkLabel = game.inCheck() ? ' — échec !' : '';
  statusEl.innerHTML = `<span class="turn">${turnLabel}</span>${checkLabel}`;
}

// --- Rendu global ---
function render() {
  boardView.render({ game, selected, legalTargets, lastMove });
  updateCaptured();
  updateHistory();
}

// --- Actions ---
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
  // On annule jusqu'à revenir à un tour du joueur : un coup si c'est
  // actuellement à Stockfish de jouer (donc on annule juste le nôtre),
  // deux coups si Stockfish a déjà répondu.
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

resetBtn.addEventListener('click', resetGame);
undoBtn.addEventListener('click', undoLastPlayerMove);

// --- Démarrage ---
boardView.setFlipped(false);
renderLevels();
renderColors();
render();
updateStatus();
