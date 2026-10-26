'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#f06292', // P - pink (punto)
  '#b0bec5', // N - gris acero (tuerca)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8]],                                       // P (punto)
  [[9,9,9],[9,0,9],[9,9,9]],                  // N (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');

const MAX_START_LEVEL = 10;
let startLevel = 1;     // selección del menú (se aplica en la próxima partida)
let gameStartLevel = 1; // nivel inicial de la partida en curso
const pressedKeys = new Set();    // teclas actualmente pulsadas
let suppressedKeys = new Set();   // teclas mantenidas al reanudar/reiniciar: se ignoran hasta soltarlas

const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');
const themeColors = { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)' };

const startScreen = document.getElementById('start-screen');
const startRecordsEl = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const overlayRecordsEl = document.getElementById('overlay-records');
const nameEntry = document.getElementById('name-entry');
const newRecordMsg = document.getElementById('new-record-msg');
const nameInput = document.getElementById('name-input');
const saveBtn = document.getElementById('save-btn');
const startResetBtn = document.getElementById('start-reset-btn');
const overlayResetBtn = document.getElementById('overlay-reset-btn');

const RECORDS_KEY = 'tetris.records';
const MAX_RECORDS = 5;
const DEFAULT_NAME = 'Jugador';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo; // combo = piezas consecutivas que limpian al menos una línea
let records;         // { scores: [{name, score, lines, level, date}], bestCombo, maxLines }
let pendingRecord = false; // la partida terminada entra en el top y aún no se ha guardado

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function intervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.max(gameStartLevel, Math.floor(lines / 10) + 1);
    dropInterval = intervalFor(level);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  if (clearLines()) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
  } else {
    combo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Skins: cada una define paleta, fondo/rejilla opcionales y su propio drawBlock ----

// Retro: bloques cuadrados y colores planos (estilo original)
function drawRetroBlock(context, x, y, color, size) {
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = themeColors.highlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

// Neon: contorno brillante con glow (shadowBlur) y relleno translúcido
function drawNeonBlock(context, x, y, color, size) {
  const px = x * size, py = y * size;
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 3, py + 3, size - 6, size - 6);
  context.shadowBlur = 0;
  const a = context.globalAlpha;
  context.globalAlpha = a * 0.25;
  context.fillStyle = color;
  context.fillRect(px + 4, py + 4, size - 8, size - 8);
  context.globalAlpha = a;
}

// Pastel: colores suaves con esquinas redondeadas
function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, r);
    return;
  }
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawPastelBlock(context, x, y, color, size) {
  const px = x * size + 2, py = y * size + 2, s = size - 4, r = size * 0.22;
  roundRectPath(context, px, py, s, s, r);
  context.fillStyle = color;
  context.fill();
  // borde sutil para que los tonos claros se distingan sobre el fondo del tema claro
  context.strokeStyle = 'rgba(0,0,0,0.18)';
  context.lineWidth = 1;
  context.stroke();
  // brillo suave en la parte superior
  roundRectPath(context, px + 3, py + 3, s - 6, s * 0.3, r * 0.6);
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fill();
}

// Pixel art: bisel + textura de sub-celdas con tramado claro/oscuro
const PIXEL_PATTERN = [
  [1, 0, 0, 0, 0],
  [0, 0, 1, 0, 0],
  [0, 0, 0, 0, 2],
  [0, 2, 0, 0, 0],
  [0, 0, 0, 2, 0],
];

function drawPixelBlock(context, x, y, color, size) {
  const px = x * size, py = y * size;
  const b = Math.max(2, Math.round(size / 10)); // grosor del bisel
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  // bisel: claro arriba/izquierda, oscuro abajo/derecha
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.fillRect(px, py, size, b);
  context.fillRect(px, py, b, size);
  context.fillStyle = 'rgba(0,0,0,0.4)';
  context.fillRect(px, py + size - b, size, b);
  context.fillRect(px + size - b, py, b, size);
  // textura interior
  const inner = size - b * 2;
  const n = PIXEL_PATTERN.length;
  const cell = inner / n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = PIXEL_PATTERN[r][c];
      if (!v) continue;
      context.fillStyle = v === 1 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.22)';
      context.fillRect(Math.round(px + b + c * cell), Math.round(py + b + r * cell),
        Math.ceil(cell), Math.ceil(cell));
    }
  }
}

const SKINS = {
  retro: { colors: COLORS, drawBlock: drawRetroBlock },
  neon: {
    colors: [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff073a', '#2979ff', '#ff8c00', '#ff2fd6', '#e0e0ff'],
    bg: '#000000',
    grid: '#101018',
    drawBlock: drawNeonBlock,
  },
  pastel: {
    colors: [null, '#a8e6ef', '#fdf1a8', '#d7bde2', '#b8e6c1', '#f5b7b1', '#bcd4f6', '#fad7a0', '#f8c8dc', '#d5dbe0'],
    drawBlock: drawPastelBlock,
  },
  pixel: {
    colors: [null, '#29adff', '#ffec27', '#a35fd1', '#00e436', '#ff004d', '#3a5fcd', '#ffa300', '#ff77a8', '#8f9ba8'],
    drawBlock: drawPixelBlock,
  },
};

const SKIN_KEY = 'tetris.skin';
let skin = SKINS.retro;

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  // si una paleta no cubre una pieza nueva, usar el color base
  skin.drawBlock(context, x, y, skin.colors[colorIndex] ?? COLORS[colorIndex], size);
  context.globalAlpha = 1;
  context.shadowBlur = 0;
}

// Limpia un canvas; las skins con fondo propio (neon) lo rellenan
function clearCanvas(context, c) {
  if (skin.bg) {
    context.fillStyle = skin.bg;
    context.fillRect(0, 0, c.width, c.height);
  } else {
    context.clearRect(0, 0, c.width, c.height);
  }
}

function drawGrid() {
  ctx.strokeStyle = skin.grid || themeColors.grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  clearCanvas(ctx, canvas);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // antes de la primera partida no hay pieza activa
  if (!current) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  clearCanvas(nextCtx, nextCanvas);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()} · Combo máx: ${maxCombo}`;

  // las estadísticas globales se actualizan siempre
  records.bestCombo = Math.max(records.bestCombo, maxCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords();

  const pos = recordPosition(score);
  pendingRecord = pos !== -1;
  if (pendingRecord) {
    newRecordMsg.textContent = `¡Entras en el top ${MAX_RECORDS}! Puesto #${pos + 1}`;
    nameInput.value = '';
    nameEntry.classList.remove('hidden');
  } else {
    nameEntry.classList.add('hidden');
  }
  renderRecords(overlayRecordsEl, -1);
  overlayRecordsEl.classList.remove('hidden');
  overlayResetBtn.classList.remove('hidden');
  overlay.classList.remove('hidden');
  if (pendingRecord) nameInput.focus();
}

/* ---- Records (localStorage) ---- */

function emptyRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function toCount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || typeof data !== 'object') return emptyRecords();
    const scores = Array.isArray(data.scores) ? data.scores : [];
    return {
      scores: scores
        .filter(s => s && typeof s === 'object')
        .map(s => ({
          name: String(s.name ?? DEFAULT_NAME).slice(0, 12) || DEFAULT_NAME,
          score: toCount(s.score),
          lines: toCount(s.lines),
          level: toCount(s.level) || 1,
          date: String(s.date ?? ''),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RECORDS),
      bestCombo: toCount(data.bestCombo),
      maxLines: toCount(data.maxLines),
    };
  } catch {
    // almacenamiento no disponible o datos corruptos: empezar de cero
    return emptyRecords();
  }
}

function saveRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // sin almacenamiento: los records solo duran esta sesión
  }
}

// posición (0-based) que ocuparía la puntuación en el top, o -1 si no entra
function recordPosition(value) {
  if (value <= 0) return -1;
  const idx = records.scores.findIndex(s => value > s.score);
  if (idx !== -1) return idx;
  return records.scores.length < MAX_RECORDS ? records.scores.length : -1;
}

function savePendingRecord() {
  if (!pendingRecord) return;
  pendingRecord = false;
  const name = nameInput.value.trim().slice(0, 12) || DEFAULT_NAME;
  const pos = recordPosition(score);
  if (pos === -1) return;
  records.scores.splice(pos, 0, { name, score, lines, level, date: new Date().toISOString() });
  records.scores.length = Math.min(records.scores.length, MAX_RECORDS);
  saveRecords();
  nameEntry.classList.add('hidden');
  renderRecords(overlayRecordsEl, pos);
}

function makeStat(label, value) {
  const stat = document.createElement('div');
  stat.className = 'stat';
  const l = document.createElement('span');
  l.className = 'label';
  l.textContent = label;
  const v = document.createElement('span');
  v.className = 'value';
  v.textContent = value;
  stat.append(l, v);
  return stat;
}

// pinta la tabla de records; los nombres siempre vía textContent
function renderRecords(container, highlightIdx) {
  container.replaceChildren();
  if (records.scores.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'records-empty';
    empty.textContent = 'Aún no hay records';
    container.append(empty);
  } else {
    const table = document.createElement('table');
    table.className = 'records-table';
    const head = table.createTHead().insertRow();
    for (const h of ['#', 'NOMBRE', 'PUNTOS', 'LÍNEAS']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.append(th);
    }
    const body = table.createTBody();
    records.scores.forEach((s, i) => {
      const row = body.insertRow();
      if (i === highlightIdx) row.className = 'highlight';
      for (const text of [i + 1, s.name, s.score.toLocaleString(), s.lines]) {
        row.insertCell().textContent = text;
      }
    });
    container.append(table);
  }
  const stats = document.createElement('div');
  stats.className = 'records-stats';
  stats.append(makeStat('MEJOR COMBO', records.bestCombo), makeStat('LÍNEAS MÁX', records.maxLines));
  container.append(stats);
}

function resetRecords(btn) {
  btn.blur();
  if (!confirm('¿Borrar todos los records?')) return;
  records = emptyRecords();
  saveRecords();
  renderRecords(startRecordsEl, -1);
  renderRecords(overlayRecordsEl, -1);
}

function setControlsVisible(visible) {
  pauseControls.classList.toggle('hidden', !visible);
  controlsBtn.setAttribute('aria-expanded', String(visible));
  controlsBtn.textContent = visible ? 'Ocultar controles' : 'Ver controles';
}

function openPauseMenu() {
  if (gameOver || paused) return;
  paused = true;
  cancelAnimationFrame(animId);
  startLevelSelect.value = String(startLevel);
  setControlsVisible(false);
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function closePauseMenu() {
  pauseMenu.classList.add('hidden');
  // quita el foco de los controles del menú para que no capturen teclas del juego
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
}

function resume() {
  if (!paused || gameOver) return;
  closePauseMenu();
  paused = false;
  suppressedKeys = new Set(pressedKeys);
  // dropAccum se conserva: pausar/reanudar no debe permitir frenar la gravedad
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() no puede cancelar el frame en curso: no reprogramar tras game over
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  gameStartLevel = startLevel;
  level = gameStartLevel;
  paused = false;
  gameOver = false;
  suppressedKeys = new Set(pressedKeys);
  combo = 0;
  maxCombo = 0;
  pendingRecord = false;
  dropInterval = intervalFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  hideRecordsUI();
  overlay.classList.add('hidden');
  closePauseMenu();
  startScreen.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function hideRecordsUI() {
  nameEntry.classList.add('hidden');
  overlayRecordsEl.classList.add('hidden');
  overlayResetBtn.classList.add('hidden');
}

const PAUSE_KEYS = ['KeyP', 'Escape'];
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'KeyX', 'Space'];

function menuFocusables() {
  return [...pauseMenu.querySelectorAll('button, select')];
}

document.addEventListener('keydown', e => {
  // escribir el nombre no debe mover piezas ni pausar
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  pressedKeys.add(e.code);
  if (!current) return; // pantalla de inicio: aún no hay partida
  if (paused) {
    // menú abierto: P/Esc reanudan; el resto solo sirve para navegar el menú
    // (Esc sobre el selector se deja al navegador para cerrar su desplegable)
    if (PAUSE_KEYS.includes(e.code) && !(e.code === 'Escape' && e.target === startLevelSelect)) {
      e.preventDefault();
      if (!e.repeat) resume();
      return;
    }
    // atrapa el foco dentro del menú
    if (e.code === 'Tab') {
      const items = menuFocusables();
      const idx = items.indexOf(document.activeElement);
      const nextIdx = idx === -1 ? 0 : (idx + (e.shiftKey ? -1 : 1) + items.length) % items.length;
      e.preventDefault();
      items[nextIdx].focus();
      return;
    }
    // flechas solo para el selector; Space solo para activar botones del menú
    const onSelect = document.activeElement === startLevelSelect;
    const onMenuBtn = document.activeElement instanceof HTMLButtonElement && pauseMenu.contains(document.activeElement);
    if (GAME_KEYS.includes(e.code) && !onSelect && !(e.code === 'Space' && onMenuBtn)) e.preventDefault();
    return;
  }
  if (gameOver) return;
  if (PAUSE_KEYS.includes(e.code)) {
    if (!e.repeat) openPauseMenu();
    return;
  }
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  // ignora teclas que se mantenían pulsadas al salir del menú/reiniciar
  if (suppressedKeys.has(e.code)) {
    if (e.repeat) return;
    suppressedKeys.delete(e.code);
  }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      hardDrop();
      break;
  }
  updateHUD();
});

document.addEventListener('keyup', e => {
  pressedKeys.delete(e.code);
  suppressedKeys.delete(e.code);
});

// al perder el foco de la ventana no llegan los keyup: olvidar teclas pulsadas
window.addEventListener('blur', () => pressedKeys.clear());

restartBtn.addEventListener('click', () => { restartBtn.blur(); init(); });
playBtn.addEventListener('click', () => { playBtn.blur(); init(); });
saveBtn.addEventListener('click', () => { saveBtn.blur(); savePendingRecord(); });
nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    savePendingRecord();
    nameInput.blur();
  }
});
startResetBtn.addEventListener('click', () => resetRecords(startResetBtn));
overlayResetBtn.addEventListener('click', () => resetRecords(overlayResetBtn));

// ---- Menú de pausa ----
for (let l = 1; l <= MAX_START_LEVEL; l++) {
  const opt = document.createElement('option');
  opt.value = String(l);
  opt.textContent = String(l);
  startLevelSelect.appendChild(opt);
}

resumeBtn.addEventListener('click', resume);
pauseRestartBtn.addEventListener('click', init);
controlsBtn.addEventListener('click', () => {
  setControlsVisible(pauseControls.classList.contains('hidden'));
});
startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value);
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const style = getComputedStyle(document.documentElement);
  themeColors.grid = style.getPropertyValue('--grid').trim();
  themeColors.highlight = style.getPropertyValue('--block-highlight').trim();
  themeToggle.setAttribute('aria-checked', String(theme === 'light'));
  // repintar aunque el juego esté en pausa o terminado
  if (board) draw();
  if (next) drawNext();
}

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur(); // evita que el botón capture Space y las teclas del juego
});

// estado inicial: tablero vacío tras la pantalla de inicio; la partida empieza con "Jugar"
board = createBoard();
gameOver = true;
paused = false;
records = loadRecords();
renderRecords(startRecordsEl, -1);

applyTheme('dark');

function applySkin(name) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, name)) name = 'retro';
  skin = SKINS[name];
  skinSelect.value = name;
  // repintar aunque el juego esté en pausa o terminado
  if (board) draw();
  if (next) drawNext();
  else clearCanvas(nextCtx, nextCanvas);
}

function loadSkin() {
  try { return localStorage.getItem(SKIN_KEY); } catch (e) { return null; }
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  try { localStorage.setItem(SKIN_KEY, skinSelect.value); } catch (e) { /* storage no disponible */ }
  skinSelect.blur(); // evita que las flechas cambien de skin en vez de mover la pieza
});

// si el select sigue enfocado (p. ej. se cerró sin elegir), las teclas del juego
// no deben cambiar la skin: se sueltan el foco y el evento sigue al juego
skinSelect.addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
    e.preventDefault();
    skinSelect.blur();
  }
});

applySkin(loadSkin());
