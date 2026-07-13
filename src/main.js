import { Chess } from 'chess.js';
import { BoardView } from './board.js';
import { Engine } from './engine.js';
import './styles.css';
import { playMoveSound, isSoundEnabled, toggleSound } from './sound.js';

const LEVELS = [
  { key: 'debutant', label: 'D\u00E9butant', hint: '\u2248 800 Elo', elo: 800, skillLevel: 0, moveTime: 300, limitStrength: true },
  { key: 'intermediaire', label: 'Interm\u00E9diaire', hint: '\u2248 1300 Elo', elo: 1300, skillLevel: 5, moveTime: 500, limitStrength: true },
  { key: 'avance', label: 'Avanc\u00E9', hint: '\u2248 1800 Elo', elo: 1800, skillLevel: 12, moveTime: 900, limitStrength: true },
  { key: 'expert', label: 'Expert', hint: 'Force maximale', elo: 2850, skillLevel: 20, moveTime: 1500, limitStrength: false }
];

const game = new Chess();
let currentLevel = LEVELS[1];
let playerColor = 'w';
let pendingPromotion = null;
let colorChosen = false;
let gameStarted = false;
let selected = null;
let legalTargets = [];
let lastMove = null;
let aiThinking = false;
let lastAiMove = null;
let engineReady = false;
let engineError = null;
let colorLocked = false;
let resigned = false;

const boardEl = document.getElementById('board');
const coordsEl = document.getElementById('coords');
const ranksEl = document.getElementById('ranks');
const statusEl = document.getElementById('status');
const levelSelect = document.getElementById('levelSelect');
const colorWhiteBtn = document.getElementById('colorWhiteBtn');
const colorBlackBtn = document.getElementById('colorBlackBtn');
const colorsNote = document.getElementById('colorsNote');
const capturedWhiteEl = document.getElementById('capturedWhite');
const capturedBlackEl = document.getElementById('capturedBlack');
const resetBtn = document.getElementById('resetBtn');
const undoBtn = document.getElementById('undoBtn');
const resignBtn = document.getElementById('resignBtn');
const rulesBtn = document.getElementById('rulesBtn');
const welcomeOverlay = document.getElementById('welcomeOverlay');
const welcomeCloseBtn = document.getElementById('welcomeCloseBtn');
const promotionOverlay = document.getElementById('promotionOverlay');

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

function colorLabel(key) {
  return key === 'w' ? 'Blancs' : 'Noirs';
}

function revealActionButtons() {
  gameStarted = true;
  undoBtn.classList.remove('hidden-ingame');
  resignBtn.classList.remove('hidden-ingame');
}

function showGameOverButtons() {
  undoBtn.classList.add('hidden-ingame');
  resignBtn.classList.add('hidden-ingame');
  resetBtn.classList.remove('hidden-ingame');
}

function renderLevels() {
  levelSelect.disabled = aiThinking;
  levelSelect.value = currentLevel.key;
}

function sendLevelToEngine() {
  if (!engineReady) return;
  engine.setLevel(currentLevel);
}

levelSelect.addEventListener('change', () => {
  const lvl = LEVELS.find((l) => l.key === levelSelect.value);
  if (lvl) {
    currentLevel = lvl;
    sendLevelToEngine();
  }
});

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

function chooseColor(key) {
  playerColor = key;
  colorChosen = true;
  colorLocked = true;
  boardView.setFlipped(playerColor === 'b');
  updateStatus();
  renderColors();
  maybeTriggerEngineOpeningMove();
}
colorWhiteBtn.addEventListener('click', () => chooseColor('w'));
colorBlackBtn.addEventListener('click', () => chooseColor('b'));

function renderColors() {
  if (colorLocked) {
    colorWhiteBtn.classList.add('hidden-ingame');
    colorBlackBtn.classList.add('hidden-ingame');
    colorsNote.innerHTML = `Vous jouez actuellement les <strong>${colorLabel(playerColor)}</strong>. La couleur alterne automatiquement \u00E0 chaque nouvelle partie.`;
  } else {
    colorWhiteBtn.classList.remove('hidden-ingame');
    colorBlackBtn.classList.remove('hidden-ingame');
    colorWhiteBtn.disabled = aiThinking;
    colorBlackBtn.disabled = aiThinking;
    colorsNote.innerHTML = '';
  }
}
function onSquareClick(id) {
  if (pendingPromotion) return;
  if (!colorChosen || !engineReady || aiThinking || game.isGameOver() || resigned) return;
  if (game.turn() !== playerColor) return;

  if (selected) {
    if (legalTargets.includes(id)) {
      const moves = game.moves({ square: selected, verbose: true });
      const promoMove = moves.find((m) => m.to === id && m.promotion);
      if (promoMove) {
        pendingPromotion = { from: selected, to: id };
        selected = null;
        legalTargets = [];
        render();
        showPromotionDialog();
        return;
      }
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

function makeHumanMove(from, to, promotion) {
  const moveObj = { from, to };
  if (promotion) moveObj.promotion = promotion;
  const result = game.move(moveObj);
  if (result) {
    lastMove = { from: result.from, to: result.to };
    playMoveSound();
  }
  if (result && !gameStarted) revealActionButtons();
  return result;
}
function afterPlyPlayed() {
  updateStatus();
  if (game.isGameOver()) {
    showGameOverButtons();
    return;
  }
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
    lastAiMove = { from: result.from, to: result.to };
    playMoveSound();
    if (replayBtn) replayBtn.disabled = false;
  } else {
    engineError = `Coup re\u00E7u du moteur invalide (${msg.from}${msg.to}) \u2014 position d\u00E9synchronis\u00E9e.`;
  }
  if (result && !gameStarted) revealActionButtons();
  render();
  renderLevels();
  renderColors();
  updateStatus();
  if (game.isGameOver()) showGameOverButtons();
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
  if (resigned) {
    const winner = playerColor === 'w' ? 'Stockfish' : 'Vous';
    statusEl.innerHTML = `<span class="turn">Vous avez abandonn\u00E9.</span> ${winner} gagne${winner === 'Vous' ? 'z' : ''}.`;
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
  resigned = false;
  resetBtn.classList.add('hidden-ingame');
  undoBtn.classList.remove('hidden-ingame');
  resignBtn.classList.remove('hidden-ingame');
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

function resignGame() {
  if (!gameStarted || game.isGameOver() || resigned) return;
  engine.stop();
  resigned = true;
  aiThinking = false;
  render();
  showGameOverButtons();
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
resignBtn.addEventListener('click', resignGame);

boardView.setFlipped(false);
renderLevels();
renderColors();
render();
updateStatus();

// --- Ajustement automatique de la taille de l'echiquier ---
function maxCellForViewport() {
  const horizontalOverhead = 80;
  const verticalOverhead = 200;
  const maxByWidth = (window.innerWidth - horizontalOverhead) / 8;
  const maxByHeight = (window.innerHeight - verticalOverhead) / 8;
  return Math.max(38, Math.min(135, maxByWidth, maxByHeight));
}

let cellSizeBeforeFullscreen = null;

function applyResponsiveCellSize() {
  if (document.fullscreenElement) return;
  const optimalSize = maxCellForViewport();
  document.documentElement.style.setProperty('--cell-size', optimalSize + 'px');
}

window.addEventListener('resize', applyResponsiveCellSize);
applyResponsiveCellSize();

// --- Bouton plein ecran ---
const fullscreenBtn = document.getElementById('fullscreenBtn');
if (fullscreenBtn) {
  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      cellSizeBeforeFullscreen = getComputedStyle(document.documentElement).getPropertyValue('--cell-size').trim();
      document.documentElement.requestFullscreen().then(() => {
        const optimalSize = maxCellForViewport();
        document.documentElement.style.setProperty('--cell-size', optimalSize + 'px');
      });
    } else {
      document.exitFullscreen();
    }
  });
}
document.addEventListener('fullscreenchange', () => {
  if (fullscreenBtn) {
    fullscreenBtn.textContent = document.fullscreenElement ? 'Retour affichage normal' : 'Plein ecran';
  }
  if (!document.fullscreenElement) {
    if (cellSizeBeforeFullscreen) {
      document.documentElement.style.setProperty('--cell-size', cellSizeBeforeFullscreen);
    } else {
      applyResponsiveCellSize();
    }
  }
});

// --- Bouton son ---
const soundBtn = document.getElementById('soundBtn');
if (soundBtn) {
  soundBtn.textContent = isSoundEnabled() ? 'Son : On' : 'Son : Off';
  soundBtn.addEventListener('click', () => {
    const nowEnabled = toggleSound();
    soundBtn.textContent = nowEnabled ? 'Son : On' : 'Son : Off';
  });
}

// --- Bouton rejouer le dernier coup IA ---
const replayBtn = document.getElementById('replayBtn');
if (replayBtn) {
  replayBtn.disabled = true;
  replayBtn.addEventListener('click', () => {
    if (!lastAiMove) return;
    const fromEl = boardEl.querySelector('[data-sq="' + lastAiMove.from + '"]');
    const toEl = boardEl.querySelector('[data-sq="' + lastAiMove.to + '"]');
    [fromEl, toEl].forEach((el) => {
      if (!el) return;
      el.classList.add('replay-highlight');
      setTimeout(() => el.classList.remove('replay-highlight'), 1800);
    });
  });
}

// --- Fenetre de choix de promotion ---
function showPromotionDialog() {
  const colorName = playerColor === 'w' ? 'white' : 'black';
  const iconNames = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };
  const basePath = import.meta.env.BASE_URL + 'assets/pieces/';
  document.querySelectorAll('.promotion-choice').forEach((btn) => {
    const piece = btn.dataset.piece;
    const img = btn.querySelector('img');
    const suffix = piece === 'n' ? '-right' : '';
    img.src = basePath + iconNames[piece] + '-' + colorName + suffix + '.png';
  });
  promotionOverlay.classList.add('visible');
}

document.querySelectorAll('.promotion-choice').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!pendingPromotion) return;
    const piece = btn.dataset.piece;
    const { from, to } = pendingPromotion;
    pendingPromotion = null;
    promotionOverlay.classList.remove('visible');
    makeHumanMove(from, to, piece);
    render();
    afterPlyPlayed();
  });
});