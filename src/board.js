// Rendu de l'echiquier en grille de <div>, avec images 3D des pieces
// et gestion de l'orientation (jouer les blancs ou les noirs).

const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const PIECES_BASE_PATH = import.meta.env.BASE_URL + 'assets/pieces/';

function pieceImagePath(piece, screenCol) {
  const colorName = piece.color === 'w' ? 'white' : 'black';
  if (piece.type === 'n') {
    const side = screenCol < 4 ? 'right' : 'left';
    return PIECES_BASE_PATH + 'knight-' + colorName + '-' + side + '.png';
  }
  const typeName = PIECE_NAMES[piece.type];
  return PIECES_BASE_PATH + typeName + '-' + colorName + '.png';
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function idFromBoardCoords(boardRow, boardCol) {
  // boardRow/boardCol suivent l'indexation de chess.js .board() : 0 = rangee 8, 0 = colonne a
  return FILES[boardCol] + (8 - boardRow);
}

export class BoardView {
  constructor({ boardEl, coordsEl, ranksEl, onSquareClick }) {
    this.boardEl = boardEl;
    this.coordsEl = coordsEl;
    this.ranksEl = ranksEl;
    this.onSquareClick = onSquareClick;
    this.flipped = false;
  }

  setFlipped(flipped) {
    this.flipped = flipped;
    if (this.coordsEl) {
      const files = this.flipped ? [...FILES].reverse() : FILES;
      this.coordsEl.innerHTML = '';
      files.forEach((f) => {
        const span = document.createElement('span');
        span.textContent = f;
        this.coordsEl.appendChild(span);
      });
    }
    if (this.ranksEl) {
      const ranks = this.flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
      this.ranksEl.innerHTML = '';
      ranks.forEach((n) => {
        const span = document.createElement('span');
        span.textContent = String(n);
        this.ranksEl.appendChild(span);
      });
    }
  }
  render(state) {
    const { game, selected, legalTargets, lastMove } = state;
    this.boardEl.innerHTML = '';
    const boardState = game.board();
    const checkSquare = this.getCheckSquare(game);
    const isCheckmate = game.isCheckmate();

    for (let screenRow = 0; screenRow < 8; screenRow++) {
      for (let screenCol = 0; screenCol < 8; screenCol++) {
        const boardRow = this.flipped ? 7 - screenRow : screenRow;
        const boardCol = this.flipped ? 7 - screenCol : screenCol;
        const id = idFromBoardCoords(boardRow, boardCol);

        const sq = document.createElement('div');
        const isLight = (screenRow + screenCol) % 2 === 0;
        sq.className = 'sq ' + (isLight ? 'light' : 'dark');
        sq.dataset.sq = id;

        const piece = boardState[boardRow][boardCol];
        if (piece) {
          const img = document.createElement('img');
          img.src = pieceImagePath(piece, screenCol);
          img.alt = piece.type;
          let imgClass = 'piece-img ptype-' + piece.type;
          if (isCheckmate && piece.type === 'k' && id === checkSquare) {
            imgClass += ' king-fallen';
          }
          img.className = imgClass;
          img.draggable = false;
          sq.appendChild(img);
          sq.classList.add(piece.color === 'w' ? 'piece-w' : 'piece-b');
        }

        if (selected === id) sq.classList.add('selected');
        if (lastMove && lastMove.from === id) sq.classList.add('last-from');
        if (lastMove && lastMove.to === id) sq.classList.add('last-to');
        if (checkSquare === id) sq.classList.add('check');

        if (legalTargets && legalTargets.includes(id)) {
          sq.classList.add('dot');
          if (piece) sq.classList.add('capture');
        }

        sq.addEventListener('click', () => this.onSquareClick(id));
        this.boardEl.appendChild(sq);
      }
    }
  }

  getCheckSquare(game) {
    if (!game.inCheck()) return null;
    const turn = game.turn();
    const boardState = game.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = boardState[r][f];
        if (p && p.type === 'k' && p.color === turn) {
          return idFromBoardCoords(r, f);
        }
      }
    }
    return null;
  }
}