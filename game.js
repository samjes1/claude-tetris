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

const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');
const themeColors = { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)' };

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
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
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
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
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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

restartBtn.addEventListener('click', init);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const style = getComputedStyle(document.documentElement);
  themeColors.grid = style.getPropertyValue('--grid').trim();
  themeColors.highlight = style.getPropertyValue('--block-highlight').trim();
  themeToggle.setAttribute('aria-checked', String(theme === 'light'));
  // repintar aunque el juego esté en pausa o terminado
  if (current) { draw(); drawNext(); }
}

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur(); // evita que el botón capture Space y las teclas del juego
});

applyTheme('dark');

function applySkin(name) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, name)) name = 'retro';
  skin = SKINS[name];
  skinSelect.value = name;
  // repintar aunque el juego esté en pausa o terminado
  if (current) { draw(); drawNext(); }
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

init();
