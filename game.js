'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// colores por skin; índice = tipo de pieza (I, O, T, S, Z, J, L, P, N)
const SKIN_COLORS = {
  retro:  [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#90caf9', '#ffb74d', '#f06292', '#b0bec5'],
  neon:   [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff073a', '#2979ff', '#ff9100', '#ff2bd6', '#c0c8ff'],
  pastel: [null, '#a8e6ef', '#fdf1a8', '#d7b8f3', '#b9e8c1', '#f7b2b7', '#b8d4f5', '#fcd5a5', '#f9c0d9', '#d3d9df'],
  pixel:  [null, '#29adff', '#ffec27', '#a35ad8', '#00e436', '#ff004d', '#3a5fcd', '#ffa300', '#ff77a8', '#83769c'],
};

let COLORS = SKIN_COLORS.retro;

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
const MAX_START_LEVEL = 10;

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
const menuMain = pauseMenu.querySelector('.menu-main');
const menuControls = document.getElementById('menu-controls');
const controlsBtn = pauseMenu.querySelector('[data-action="controls"]');
const startLevelSelect = document.getElementById('start-level');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('player-name');
const recordsEl = document.getElementById('records');
const recordsBody = document.getElementById('records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records');

const RECORDS_KEY = 'tetris-records';
const NAME_KEY = 'tetris-player-name';
const MAX_RECORDS = 5;

const themeToggle = document.getElementById('theme-toggle');
const themeColors = { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)' };

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let startLevel = 1;
// teclas pulsadas con el menú abierto: se ignoran hasta soltarlas para no mover la pieza al volver
const heldKeys = new Set();
let combo, gameBestCombo;
// pendingRank: puesto en el top que espera nombre (-1 si no hay)
let pendingRank = -1, newBest = { combo: false, lines: false };
let records = loadRecords();

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
  if (!cleared) {
    combo = 0;
    return;
  }
  // combo: piezas seguidas que limpian líneas
  combo++;
  gameBestCombo = Math.max(gameBestCombo, combo);
  lines += cleared;
  score += (LINE_SCORES[cleared] || 0) * level;
  level = Math.max(startLevel, Math.floor(lines / 10) + 1);
  dropInterval = intervalFor(level);
  updateHUD();
}

function intervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
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
  clearLines();
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

function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

const SKINS = {
  // bloques cuadrados, colores planos
  retro: {
    label: 'Retro',
    drawBlock(context, px, py, size, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      context.fillStyle = themeColors.highlight;
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  // fondo negro + glow con shadowBlur
  neon: {
    label: 'Neon',
    background: '#000',
    grid: '#111122',
    drawBlock(context, px, py, size, color) {
      context.shadowColor = color;
      context.shadowBlur = size * 0.5;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px + 3, py + 3, size - 6, size - 6);
      context.shadowBlur = size * 0.25;
      context.fillStyle = color;
      context.globalAlpha *= 0.35;
      context.fillRect(px + 5, py + 5, size - 10, size - 10);
      context.shadowBlur = 0;
    },
  },
  // colores suaves, esquinas redondeadas
  pastel: {
    label: 'Pastel',
    drawBlock(context, px, py, size, color) {
      roundRectPath(context, px + 2, py + 2, size - 4, size - 4, size * 0.25);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,0.6)';
      context.lineWidth = 1.5;
      context.stroke();
      roundRectPath(context, px + 6, py + 5, size * 0.35, size * 0.15, size * 0.07);
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fill();
    },
  },
  // textura pixelada: bisel claro/oscuro + puntos
  pixel: {
    label: 'Pixel art',
    drawBlock(context, px, py, size, color) {
      const p = size / 10; // tamaño de "pixel"
      context.fillStyle = color;
      context.fillRect(px, py, size, size);
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fillRect(px, py, size - p, p);
      context.fillRect(px, py, p, size - p);
      context.fillStyle = 'rgba(0,0,0,0.4)';
      context.fillRect(px + p, py + size - p, size - p, p);
      context.fillRect(px + size - p, py + p, p, size - p);
      context.fillStyle = 'rgba(255,255,255,0.7)';
      context.fillRect(px + 2 * p, py + 2 * p, p, p);
      context.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 3; i < 8; i += 2)
        for (let j = 3; j < 8; j += 2)
          if ((i + j) % 4 === 2) context.fillRect(px + i * p, py + j * p, p, p);
    },
  },
};

let skin = SKINS.retro;

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.save();
  context.globalAlpha = alpha ?? 1;
  skin.drawBlock(context, x * size, y * size, size, COLORS[colorIndex]);
  context.restore();
}

function clearCanvas(context, cv) {
  context.clearRect(0, 0, cv.width, cv.height);
  if (skin.background) {
    context.fillStyle = skin.background;
    context.fillRect(0, 0, cv.width, cv.height);
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
  if (!next) return;
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

/* ---- Récords (localStorage) ---- */
function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (data && Array.isArray(data.scores)) {
      return {
        scores: data.scores.slice(0, MAX_RECORDS),
        bestCombo: data.bestCombo || 0,
        maxLines: data.maxLines || 0,
      };
    }
  } catch {}
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function saveRecords() {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch {}
}

function rankFor(value) {
  if (value <= 0) return -1;
  const i = records.scores.findIndex(r => value > r.score);
  const rank = i === -1 ? records.scores.length : i;
  return rank < MAX_RECORDS ? rank : -1;
}

function renderRecords(list, highlight) {
  const rows = [];
  for (let i = 0; i < MAX_RECORDS; i++) {
    const entry = list[i];
    const tr = document.createElement('tr');
    if (i === highlight) tr.className = 'current';
    for (const text of [`${i + 1}.`, entry ? entry.name : '---', entry ? entry.score.toLocaleString() : '']) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    rows.push(tr);
  }
  recordsBody.replaceChildren(...rows);
  bestComboEl.textContent = records.bestCombo;
  maxLinesEl.textContent = records.maxLines;
  bestComboEl.parentElement.classList.toggle('new', newBest.combo);
  maxLinesEl.parentElement.classList.toggle('new', newBest.lines);
}

function pendingEntry(name) {
  return { name, score, lines, combo: gameBestCombo };
}

// inserta la puntuación pendiente en el top; devuelve el puesto
function commitRecord() {
  if (pendingRank === -1) return -1;
  const name = nameInput.value.trim() || 'Anónimo';
  const rank = Math.min(pendingRank, records.scores.length);
  records.scores.splice(rank, 0, pendingEntry(name));
  records.scores.length = Math.min(records.scores.length, MAX_RECORDS);
  saveRecords();
  try { localStorage.setItem(NAME_KEY, name); } catch {}
  pendingRank = -1;
  return rank;
}

function showOverlay(mode, highlight = -1) {
  overlay.dataset.mode = mode;
  overlayTitle.textContent = { start: '¿LISTO?', pause: 'PAUSA', gameover: 'GAME OVER' }[mode];
  overlayScore.textContent = mode === 'gameover' ? `Puntuación: ${score.toLocaleString()}` : '';
  restartBtn.textContent = mode === 'start' ? 'Jugar' : 'Reiniciar';
  recordsEl.classList.toggle('hidden', mode === 'pause');
  const pending = mode === 'gameover' && pendingRank !== -1;
  nameForm.classList.toggle('hidden', !pending);

  if (pending) {
    // vista previa: la puntuación actual resaltada en su puesto
    const rank = Math.min(pendingRank, records.scores.length);
    const preview = [...records.scores];
    preview.splice(rank, 0, pendingEntry('???'));
    renderRecords(preview, rank);
  } else {
    renderRecords(records.scores, highlight);
  }

  overlay.classList.remove('hidden');
  if (pending) {
    nameInput.focus();
    nameInput.select();
  } else if (mode !== 'pause') {
    restartBtn.focus();
  }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  newBest = { combo: gameBestCombo > records.bestCombo, lines: lines > records.maxLines };
  records.bestCombo = Math.max(records.bestCombo, gameBestCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords();
  pendingRank = rankFor(score);
  try { nameInput.value = localStorage.getItem(NAME_KEY) || ''; } catch {}
  showOverlay('gameover');
}

function openPauseMenu() {
  if (gameOver || paused) return;
  paused = true;
  cancelAnimationFrame(animId);
  showControls(false);
  pauseMenu.classList.remove('hidden');
  pauseMenu.querySelector('[data-action="resume"]').focus();
}

function closePauseMenu() {
  if (!paused) return;
  paused = false;
  pauseMenu.classList.add('hidden');
  // evita que Space/Enter vuelvan a activar un botón del menú
  if (document.activeElement) document.activeElement.blur();
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function togglePause() {
  if (paused) closePauseMenu(); else openPauseMenu();
}

function showControls(show) {
  menuControls.classList.toggle('hidden', !show);
  menuMain.classList.toggle('hidden', show);
  controlsBtn.setAttribute('aria-expanded', String(show));
  (show ? menuControls.querySelector('.menu-btn') : controlsBtn).focus();
}

function menuItems() {
  const panel = menuControls.classList.contains('hidden') ? menuMain : menuControls;
  return [...panel.querySelectorAll('button, select')];
}

function handleMenuKey(e) {
  heldKeys.add(e.code);
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    // Escape desde "Ver controles" vuelve al menú principal
    if (e.code === 'Escape' && !menuControls.classList.contains('hidden')) showControls(false);
    else closePauseMenu();
    return;
  }
  if (e.target === startLevelSelect && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) return;
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    e.preventDefault();
    const items = menuItems();
    const i = items.indexOf(document.activeElement);
    const step = e.code === 'ArrowDown' ? 1 : -1;
    items[(i + step + items.length) % items.length].focus();
  }
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
  commitRecord(); // si reinicia sin guardar, el récord queda como 'Anónimo' o el último nombre
  newBest = { combo: false, lines: false };
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = 0;
  gameBestCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = intervalFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (document.activeElement) document.activeElement.blur();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === nameInput) return;
  if (paused) { handleMenuKey(e); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { openPauseMenu(); return; }
  if (gameOver) return;
  if (heldKeys.has(e.code)) { e.preventDefault(); return; }
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
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

document.addEventListener('keyup', e => heldKeys.delete(e.code));
window.addEventListener('blur', () => heldKeys.clear());

restartBtn.addEventListener('click', () => {
  init();
  restartBtn.blur(); // evita que Space vuelva a pulsar el botón durante la partida
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  const rank = commitRecord();
  showOverlay('gameover', rank);
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los récords?')) return;
  records = { scores: [], bestCombo: 0, maxLines: 0 };
  newBest = { combo: false, lines: false };
  saveRecords();
  showOverlay(overlay.dataset.mode);
});

pauseMenu.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  switch (btn.dataset.action) {
    case 'resume': closePauseMenu(); break;
    case 'restart': init(); break;
    case 'controls': showControls(true); break;
    case 'back': showControls(false); break;
  }
});

for (let i = 1; i <= MAX_START_LEVEL; i++) startLevelSelect.add(new Option(String(i), String(i)));
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
  if (board) { draw(); drawNext(); }
}

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur(); // evita que el botón capture Space y las teclas del juego
});

applyTheme('dark');

const skinSelect = document.getElementById('skin-select');
const SKIN_KEY = 'tetris-skin';

function applySkin(name) {
  if (!SKINS[name]) name = 'retro';
  skin = SKINS[name];
  COLORS = SKIN_COLORS[name];
  skinSelect.value = name;
  document.documentElement.dataset.skin = name;
  try { localStorage.setItem(SKIN_KEY, name); } catch {}
  if (board) { draw(); drawNext(); }
}

for (const [name, def] of Object.entries(SKINS)) skinSelect.add(new Option(def.label, name));

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur(); // evita que las flechas cambien el skin en vez de mover la pieza
});

let savedSkin = null;
try { savedSkin = localStorage.getItem(SKIN_KEY); } catch {}
applySkin(savedSkin);

// pantalla de inicio: tablero vacío y récords hasta pulsar Jugar
board = createBoard();
score = 0;
gameOver = true;
draw();
showOverlay('start');
