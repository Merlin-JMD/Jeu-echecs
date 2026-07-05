// Rendu de l'échiquier en grille de <div>, façon prototype, mais modularisé
// et prêt à gérer l'orientation (jouer les blancs ou les noirs).

const UNICODE = {
  p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
  P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔'
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function idFromBoardCoords(boardRow, boardCol) {
  // boardRow/boardCol suivent l'indexation de chess.js .board() : 0 = rangée 8, 0 = colonne a
  return FILES[boardCol] + (8 - boardRow);
}

export class BoardView {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.boardEl
   * @param {HTMLElement} [opts.coordsEl]
   * @param {(squareId: string) => void} opts.onSquareClick
   */
  constructor({ boardEl, coordsEl, onSquareClick }) {
    this.boardEl = boardEl;
    this.coordsEl = coordsEl;
    this.onSquareClick = onSquareClick;
    this.flipped = false;
  }

  setFlipped(flipped) {
    this.flipped = flipped;
    if (this.coordsEl) {
      const files = this.flipped ? [...FILES].reverse() : FILES;
      this.coordsEl.textContent = files.join('   ');
    }
  }

  /**
   * @param {Object} state
   * @param {import('chess.js').Chess} state.game
   * @param {string|null} state.selected
   * @param {string[]} state.legalTargets
   * @param {{from:string,to:string}|null} state.lastMove
   */
  render(state) {
    const { game, selected, legalTargets, lastMove } = state;
    this.boardEl.innerHTML = '';
    const boardState = game.board();
    const checkSquare = this.getCheckSquare(game);

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
          const symbol = piece.color === 'w' ? UNICODE[piece.type.toUpperCase()] : UNICODE[piece.type];
          sq.textContent = symbol;
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

export { UNICODE };
