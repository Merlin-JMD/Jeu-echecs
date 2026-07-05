// Enveloppe autour du moteur Stockfish.
//
// Le fichier téléchargé dans public/engine/ (voir scripts/fetch-engine.mjs)
// N'EXPOSE PAS de fonction globale "Stockfish()" façon usine — il utilise le
// format historique de Stockfish.js (documenté depuis la version 6) : le
// fichier moteur est utilisé DIRECTEMENT comme script d'un Worker, et on lui
// parle en UCI texte brut via postMessage/onmessage :
//
//   const engine = new Worker('stockfish.js');
//   engine.postMessage('uci');
//   engine.onmessage = (e) => console.log(e.data);
//
// Ce module encapsule ce dialogue UCI (poignée de main uci/isready, réglage
// des options de niveau, envoi de position + recherche, parsing de
// "bestmove ..."), tout en laissant le calcul se faire dans le Worker (donc
// sans jamais bloquer l'interface).

const ENGINE_URL = import.meta.env.BASE_URL + 'engine/stockfish-18-lite-single.js';

export class Engine {
  /**
   * @param {Object} callbacks
   * @param {() => void} [callbacks.onReady]
   * @param {(move: {from:string, to:string, promotion?:string}) => void} [callbacks.onBestmove]
   * @param {(message: string) => void} [callbacks.onError]
   */
  constructor({ onReady, onBestmove, onError } = {}) {
    this.onReady = onReady || (() => {});
    this.onBestmove = onBestmove || (() => {});
    this.onError = onError || (() => {});

    this.ready = false;
    this.pendingFen = null;
    this.moveTime = 600;

    this.worker = new Worker(ENGINE_URL);

    this.worker.onmessage = (event) => {
      // Les Web Workers "encapsulent" parfois la donnée ; on gère les deux cas.
      const line = typeof event.data === 'string' ? event.data : event.data && event.data.data;
      this._handleLine(line);
    };

    this.worker.onerror = (event) => {
      this.onError(
        `Erreur lors du chargement du Worker moteur (${ENGINE_URL}) : ` +
        `${event.message || 'erreur inconnue'}. Vérifie que "npm install" (ou ` +
        `"npm run fetch-engine") a bien préparé le dossier public/engine/.`
      );
    };

    this.worker.postMessage('uci');
  }

  _handleLine(line) {
    if (typeof line !== 'string' || !line) return;

    if (line === 'uciok') {
      this.worker.postMessage('isready');
      return;
    }

    if (line === 'readyok') {
      if (!this.ready) {
        this.ready = true;
        this.onReady();
      }
      if (this.pendingFen) {
        const fen = this.pendingFen;
        this.pendingFen = null;
        this._sendGo(fen);
      }
      return;
    }

    if (line.startsWith('bestmove')) {
      const parts = line.split(' ');
      const uciMove = parts[1];
      if (!uciMove || uciMove === '(none)') {
        this.onError('Le moteur ne trouve aucun coup légal (partie déjà terminée ?).');
        return;
      }
      const from = uciMove.slice(0, 2);
      const to = uciMove.slice(2, 4);
      const promotion = uciMove.length > 4 ? uciMove[4] : undefined;
      this.onBestmove({ from, to, promotion });
      return;
    }

    // Lignes "info ..." (profondeur, évaluation, etc.) ignorées pour l'instant —
    // réservé pour un futur affichage d'évaluation en direct.
  }

  /**
   * @param {{elo:number, skillLevel:number, moveTime:number, limitStrength:boolean}} level
   */
  setLevel(level) {
    const { limitStrength, elo, skillLevel, moveTime } = level;
    if (moveTime) this.moveTime = moveTime;

    this.worker.postMessage(`setoption name UCI_LimitStrength value ${limitStrength ? 'true' : 'false'}`);
    if (limitStrength) {
      this.worker.postMessage(`setoption name UCI_Elo value ${elo}`);
    }
    if (typeof skillLevel === 'number') {
      this.worker.postMessage(`setoption name Skill Level value ${skillLevel}`);
    }
  }

  go(fen) {
    if (!this.ready) {
      this.onError("Le moteur n'est pas encore prêt (position envoyée trop tôt).");
      return;
    }
    // On repasse par isready avant chaque recherche, pour être sûr que les
    // éventuels setoption précédents ont bien été pris en compte.
    this.pendingFen = fen;
    this.worker.postMessage('isready');
  }

  _sendGo(fen) {
    this.worker.postMessage('position fen ' + fen);
    this.worker.postMessage(`go movetime ${this.moveTime}`);
  }

  stop() {
    this.worker.postMessage('stop');
  }
}