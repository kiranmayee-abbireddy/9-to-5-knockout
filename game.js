// Office War: Paperclip Royale - Game Core
// All code is self-contained for offline play

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function getGameWidth() { return canvas.width; }
function getGameHeight() { return canvas.height; }

// Game state
let gameState = {
  bots: [],
  player: null,
  items: [],
  obstacles: [],
  effects: [],
  kills: 0,
  roundTime: 0,
  eventTime: 30,
  currentEvent: null,
  running: true,
  coffeeFlood: false,
  fireDrill: false,
  hauntedPrinter: null,
  particles: [],
  gameOver: false,
  eventCountdown: 30,
  roundTimer: 0,
  manager: null, // Manager boss
  managerSpawnTimer: randInt(600,1200), // frames until manager spawns
  managerDefeated: false
};

// --- SOUND SETUP ---
const bgm = new Audio('game.mp3');
bgm.loop = true;
bgm.volume = 0.5;
let bgmStarted = false;

const sfxKill = new Audio('kill.wav');
const sfxDead = new Audio('dead.mp3');
const sfxCheer = new Audio('cheer.wav');
sfxCheer.volume = 0.75;
let cheerPlayed = false;

function startBGM() {
  if (!bgmStarted) {
    bgm.play().catch(()=>{});
    bgmStarted = true;
  }
}
function stopBGM() {
  bgm.pause();
  bgm.currentTime = 0;
  bgmStarted = false;
}

// Start BGM on first interaction (autoplay policy)
window.addEventListener('pointerdown', startBGM, {once:true});
window.addEventListener('keydown', startBGM, {once:true});

// Utility
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function clamp(x, min, max) { return Math.max(min, Math.min(max, x)); }

// --- MOBILE TOUCH CONTROLS ---
const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
let joystickActive = false;
let joystickCenter = {x: 0, y: 0};
let joystickVector = {x: 0, y: 0};
let joystickRadius = 40;

function setupMobileControls() {
  if (!isMobile) return;
  const joystick = document.getElementById('joystick');
  const throwBtn = document.getElementById('throw-btn');
  const pickupBtn = document.getElementById('pickup-btn');
  const mobileControls = document.getElementById('mobile-controls');
  mobileControls.style.display = 'flex';

  // Joystick touch events
  joystick.addEventListener('touchstart', function(e) {
    joystickActive = true;
    const rect = joystick.getBoundingClientRect();
    const t = e.touches[0];
    joystickCenter = {x: rect.left + rect.width/2, y: rect.top + rect.height/2};
    joystickVector = {x: 0, y: 0};
    e.preventDefault();
  });
  joystick.addEventListener('touchmove', function(e) {
    if (!joystickActive) return;
    const t = e.touches[0];
    let dx = t.clientX - joystickCenter.x;
    let dy = t.clientY - joystickCenter.y;
    let dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > joystickRadius) {
      dx *= joystickRadius/dist;
      dy *= joystickRadius/dist;
    }
    joystickVector = {x: dx/joystickRadius, y: dy/joystickRadius};
    e.preventDefault();
  });
  joystick.addEventListener('touchend', function(e) {
    joystickActive = false;
    joystickVector = {x: 0, y: 0};
    e.preventDefault();
  });

  // Action buttons
  throwBtn.addEventListener('touchstart', function(e) {
    tryThrow(gameState.player);
    e.preventDefault();
  });
  // Also support click for desktop debug
  throwBtn.addEventListener('click', function(e) { tryThrow(gameState.player); });
}

// Integrate joystick movement into game update
function getMobileInput() {
  if (!isMobile) return {x: 0, y: 0};
  return joystickVector;
}

document.addEventListener('DOMContentLoaded', setupMobileControls);

// Entity base
class Entity {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = 18;
    this.health = 100;
    this.maxHealth = 100;
    this.inventory = [];
    this.wobble = 0;
    this.name = '';
    this.color = '#888';
    this.isBot = false;
    this.alive = true;
    this.speed = 2.5;
    this.knockback = {x:0, y:0, t:0};
  }
  draw() {
    // Draw circle (placeholder for pixel art)
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.wobble > 0) {
      ctx.rotate(Math.sin(Date.now()/60) * 0.18);
    }
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, 2 * Math.PI);
    ctx.fillStyle = this.color;
    ctx.shadowColor = '#2226';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Draw face/eyes
    ctx.beginPath();
    ctx.arc(-6, -4, 3, 0, 2*Math.PI);
    ctx.arc(6, -4, 3, 0, 2*Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-6, -4, 1, 0, 2*Math.PI);
    ctx.arc(6, -4, 1, 0, 2*Math.PI);
    ctx.fillStyle = '#222';
    ctx.fill();
    ctx.restore();
    // Draw health bar
    this.drawHealthBar();
    // Draw inventory
    if (!this.isBot && this.inventory.length > 0) {
      ctx.save();
      ctx.font = '20px Segoe UI Emoji, Arial';
      ctx.globalAlpha = 0.90;
      ctx.textAlign = 'center';
      for (let i=0; i<this.inventory.length; ++i) {
        ctx.fillText(this.inventory[i].label, this.x + (i-0.5)*22, this.y + this.radius+18);
      }
      ctx.restore();
    }
  }
  drawHealthBar() {
    const barW = 36;
    const barH = 6;
    const healthPct = clamp(this.health / this.maxHealth, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(this.x - barW/2, this.y - this.radius - 18, barW, barH);
    ctx.fillStyle = '#66bb6a';
    ctx.fillRect(this.x - barW/2, this.y - this.radius - 18, barW * healthPct, barH);
    ctx.strokeStyle = '#222';
    ctx.strokeRect(this.x - barW/2, this.y - this.radius - 18, barW, barH);
    ctx.restore();
  }
}

// Player and Bot classes
class Player extends Entity {
  constructor(x, y) {
    super(x, y);
    this.name = 'You';
    this.color = '#1976d2';
    this.isBot = false;
    this.speed = 2.8;
  }
}
class Bot extends Entity {
  constructor(x, y, name) {
    super(x, y);
    this.name = name;
    this.color = `hsl(${randInt(0, 360)}, 60%, 55%)`;
    this.isBot = true;
    this.speed = 2.1 + Math.random()*0.8;
    this.aiState = 'wander';
    this.aiTimer = randInt(30, 120);
    this.target = null;
  }
}

// --- Obstacle types ---
const OBSTACLE_TYPES = [
  { w: 120, h: 40, color: '#bdbdbd', name: 'Desk' },
  { w: 80, h: 80, color: '#90caf9', name: 'Cubicle' },
  { w: 40, h: 40, color: '#ffe082', name: 'Water Cooler' },
];

// --- Item types ---
const ITEM_TYPES = [
  { type: 'paperclip', color: '#90caf9', radius: 8, label: '📎', damage: 20, speed: 9 },
  { type: 'mug', color: '#a1887f', radius: 14, label: '☕', damage: 15, splash: 1, speed: 6 },
  { type: 'stapler', color: '#e57373', radius: 12, label: '📎', damage: 35, speed: 5 },
];

// Game initialization
function layoutObstacles() {
  const w = getGameWidth();
  const h = getGameHeight();
  let obs = [];
  // Desks: 1 row every 220px, 1 desk every 320px
  for (let row = 0; row < Math.floor(h/220); ++row) {
    for (let col = 0; col < Math.floor(w/320); ++col) {
      obs.push({
        x: 60 + col*320,
        y: 40 + row*220,
        w: 120, h: 40, ...OBSTACLE_TYPES[0]
      });
    }
  }
  // Cubicles: grid, every 320x260px
  for (let row = 0; row < Math.floor(h/260); ++row) {
    for (let col = 0; col < Math.floor(w/320); ++col) {
      obs.push({
        x: 180 + col*320,
        y: 120 + row*260,
        w: 80, h: 80, ...OBSTACLE_TYPES[1]
      });
    }
  }
  // Water coolers: corners
  obs.push({ x: 40, y: 40, w: 40, h: 40, ...OBSTACLE_TYPES[2] });
  obs.push({ x: w-80, y: 40, w: 40, h: 40, ...OBSTACLE_TYPES[2] });
  obs.push({ x: 40, y: h-80, w: 40, h: 40, ...OBSTACLE_TYPES[2] });
  obs.push({ x: w-80, y: h-80, w: 40, h: 40, ...OBSTACLE_TYPES[2] });
  gameState.obstacles = obs;
}

function layoutItemSpots() {
  // Place item spots in a grid, avoiding obstacles
  let spots = [];
  for (let x = 120; x < getGameWidth()-120; x += 220) {
    for (let y = 120; y < getGameHeight()-120; y += 200) {
      spots.push({x, y});
    }
  }
  gameState.itemSpots = spots.filter(pt =>
    !gameState.obstacles.some(obs =>
      pt.x > obs.x-30 && pt.x < obs.x+obs.w+30 && pt.y > obs.y-30 && pt.y < obs.y+obs.h+30
    )
  );
}

function initGame() {
  layoutObstacles();
  layoutItemSpots();

  // Filter spawn points so none overlap obstacles
  let allSpawnPoints = [
    {x: 100, y: 80}, {x: 860, y: 80}, {x: 100, y: 520}, {x: 860, y: 520},
    {x: 500, y: 80}, {x: 500, y: 520}, {x: 500, y: 300},
    {x: 220, y: 220}, {x: 760, y: 220}, {x: 220, y: 420}, {x: 760, y: 420}
  ];
  let validSpawnPoints = allSpawnPoints.filter(pt =>
    !gameState.obstacles.some(obs => circleRectCollide(pt.x, pt.y, 20, obs.x, obs.y, obs.w, obs.h))
  );
  // Shuffle spawn points
  for (let i = validSpawnPoints.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [validSpawnPoints[i], validSpawnPoints[j]] = [validSpawnPoints[j], validSpawnPoints[i]];
  }
  // Create player
  gameState.player = new Player(validSpawnPoints[0].x, validSpawnPoints[0].y);
  // Create 6 bots
  gameState.bots = [];
  for (let i = 1; i < 7; ++i) {
    gameState.bots.push(new Bot(validSpawnPoints[i].x, validSpawnPoints[i].y, `Bot${i}`));
  }

  // More item spawn points, spread out and not on obstacles
  gameState.itemSpots = [
    {x: 230, y: 140}, {x: 470, y: 140}, {x: 710, y: 140},
    {x: 240, y: 310}, {x: 740, y: 310},
    {x: 90, y: 500}, {x: 870, y: 500},
    {x: 480, y: 370}, {x: 480, y: 410},
    {x: 350, y: 250}, {x: 650, y: 250},
    {x: 350, y: 450}, {x: 650, y: 450},
    {x: 160, y: 400}, {x: 840, y: 400},
    {x: 300, y: 340}, {x: 700, y: 340},
    {x: 500, y: 200}, {x: 500, y: 480},
    {x: 120, y: 320}, {x: 880, y: 320}
  ];
  // Initial item spawn (one per spot)
  gameState.items = [];
  for (let i = 0; i < gameState.itemSpots.length; ++i) {
    spawnNewItem(i);
  }
  // Projectiles
  gameState.projectiles = [];
}

// Helper: Spawn a new item at a given spot index
function spawnNewItem(spotIndex) {
  let t = ITEM_TYPES[randInt(0, ITEM_TYPES.length-1)];
  let spot = gameState.itemSpots[spotIndex];
  gameState.items.push({type: t.type, color: t.color, radius: t.radius, label: t.label, x: spot.x, y: spot.y, held: null, spotIndex});
}


// --- Player Movement ---
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false };
document.addEventListener('keydown', e => {
  if (e.key in keys) keys[e.key] = true;
});
document.addEventListener('keyup', e => {
  if (e.key in keys) keys[e.key] = false;
});

// Main game loop
function gameLoop() {
  updateGame();
  renderGame();
  if (gameState.running) {
    requestAnimationFrame(gameLoop);
  }
}

function circleRectCollide(cx, cy, cr, rx, ry, rw, rh) {
  // Clamp circle center to rectangle bounds
  let closestX = clamp(cx, rx, rx + rw);
  let closestY = clamp(cy, ry, ry + rh);
  let dx = cx - closestX;
  let dy = cy - closestY;
  return (dx*dx + dy*dy) < (cr*cr);
}

function moveWithObstacles(entity, dx, dy) {
  let newX = clamp(entity.x + dx, entity.radius, getGameWidth() - entity.radius);
  let newY = clamp(entity.y + dy, entity.radius, getGameHeight() - entity.radius);
  // Check collision with obstacles
  for (let obs of gameState.obstacles) {
    if (circleRectCollide(newX, newY, entity.radius, obs.x, obs.y, obs.w, obs.h)) {
      // Try sliding along x or y
      if (!circleRectCollide(entity.x, newY, entity.radius, obs.x, obs.y, obs.w, obs.h)) {
        newX = entity.x;
      } else if (!circleRectCollide(newX, entity.y, entity.radius, obs.x, obs.y, obs.w, obs.h)) {
        newY = entity.y;
      } else {
        newX = entity.x;
        newY = entity.y;
      }
    }
  }
  entity.x = newX;
  entity.y = newY;
}

// --- Item pickup and throw (player) ---
document.addEventListener('keydown', e => {
  if (e.key === ' ' && !e.repeat) tryThrow(gameState.player);
});
canvas.addEventListener('mousedown', e => { tryThrow(gameState.player, e); });

function tryPickup(entity) {
  if (entity.inventory.length >= 2) return;
  for (let item of gameState.items) {
    if (!item.held && Math.hypot(entity.x - item.x, entity.y - item.y) < entity.radius + item.radius + 8) {
      item.held = entity;
      entity.inventory.push(item);
      break;
    }
  }
}
function tryThrow(entity, mouseEvt) {
  if (entity.inventory.length === 0) return;
  let item = entity.inventory.shift();
  item.held = null;
  // Determine throw direction
  let angle = 0;
  if (!entity.isBot) {
    // Player: always auto-aim at nearest alive bot
    let botsAlive = gameState.bots.filter(b=>b.alive);
    if (botsAlive.length > 0) {
      let nearest = botsAlive[0];
      let minDist = Math.hypot(nearest.x-entity.x, nearest.y-entity.y);
      for (let b of botsAlive) {
        let d = Math.hypot(b.x-entity.x, b.y-entity.y);
        if (d < minDist) { minDist = d; nearest = b; }
      }
      angle = Math.atan2(nearest.y-entity.y, nearest.x-entity.x);
    } else {
      angle = -Math.PI/2;
    }
  } else if (mouseEvt) {
    // (Bots never use mouseEvt, but keep for completeness)
    const rect = canvas.getBoundingClientRect();
    const cx = entity.x, cy = entity.y;
    const mx = (mouseEvt.clientX - rect.left) * (canvas.width/rect.width);
    const my = (mouseEvt.clientY - rect.top) * (canvas.height/rect.height);
    angle = Math.atan2(my - cy, mx - cx);
  } else {
    angle = -Math.PI/2;
  }
  // Get item type properties
  let t = ITEM_TYPES.find(t => t.type === item.type);
  gameState.projectiles.push({
    type: item.type, color: item.color, radius: item.radius, label: item.label,
    x: entity.x, y: entity.y, vx: Math.cos(angle)*t.speed, vy: Math.sin(angle)*t.speed,
    owner: entity, damage: t.damage, splash: t.splash || 0, life: 90
  });
}

function spawnManager() {
  // Place manager at random edge
  let edge = randInt(0,3);
  let x = edge < 2 ? (edge===0?40:getGameWidth()-40) : randInt(60,getGameWidth()-60);
  let y = edge >= 2 ? (edge===2?40:getGameHeight()-40) : randInt(60,getGameHeight()-60);
  gameState.manager = {
    x, y,
    vx: 0, vy: 0,
    health: 8, maxHealth: 8,
    alive: true,
    tag: 'Manager',
    escapeTimer: 0
  };
}

function updateManager() {
  if (!gameState.manager || !gameState.manager.alive) return;
  let mgr = gameState.manager;
  // Move away from player and props
  let px = gameState.player ? gameState.player.x : getGameWidth()/2;
  let py = gameState.player ? gameState.player.y : getGameHeight()/2;
  let dx = mgr.x - px, dy = mgr.y - py;
  let len = Math.sqrt(dx*dx+dy*dy);
  if (len < 320) { dx/=len; dy/=len; mgr.vx += dx*0.18; mgr.vy += dy*0.18; }
  // Avoid obstacles
  for (let obs of gameState.obstacles) {
    let ox = mgr.x-obs.x-obs.w/2, oy = mgr.y-obs.y-obs.h/2;
    let d = Math.sqrt(ox*ox+oy*oy);
    if (d < 64) { mgr.vx += ox/d*0.12; mgr.vy += oy/d*0.12; }
  }
  // Clamp speed
  let speed = Math.sqrt(mgr.vx*mgr.vx+mgr.vy*mgr.vy);
  if (speed > 3) { mgr.vx *= 0.85; mgr.vy *= 0.85; }
  mgr.x += mgr.vx; mgr.y += mgr.vy;
  mgr.vx *= 0.91; mgr.vy *= 0.91;
  // Stay in bounds
  mgr.x = clamp(mgr.x, 30, getGameWidth()-30);
  mgr.y = clamp(mgr.y, 30, getGameHeight()-30);
}

function drawManager(ctx, mgr) {
  ctx.save();
  ctx.translate(mgr.x, mgr.y);
  // Body
  ctx.fillStyle = mgr.alive ? '#222' : '#444';
  ctx.fillRect(-12, -24, 24, 28);
  // Head
  ctx.fillStyle = '#fbc16a';
  ctx.fillRect(-10, -38, 20, 16);
  // Eyes
  ctx.fillStyle = '#333';
  ctx.fillRect(-5, -32, 4, 4); ctx.fillRect(1, -32, 4, 4);
  // Arms
  ctx.fillStyle = '#222';
  ctx.fillRect(-16, -18, 6, 16); ctx.fillRect(10, -18, 6, 16);
  // Legs
  ctx.fillStyle = mgr.alive ? '#222' : '#888';
  ctx.fillRect(-8, 4, 6, 14); ctx.fillRect(2, 4, 6, 14);
  // Tag
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3;
  ctx.strokeText('Manager', 0, -48);
  ctx.fillStyle = '#ffe082';
  ctx.fillText('Manager', 0, -48);
  // Health bar
  ctx.fillStyle = '#d32f2f';
  ctx.fillRect(-14, -42, 28, 4);
  ctx.fillStyle = '#66bb6a';
  ctx.fillRect(-14, -42, 28*(mgr.health/mgr.maxHealth), 4);
  ctx.restore();
}

function updateGame() {
  // --- Kill count UI update ---
  document.getElementById('score').textContent = 'Kills: ' + gameState.kills;

  // --- Flying Paper Particle Logic ---
  if (!gameState.papers) gameState.papers = [];
  // Only update & clean up papers (no random spawn here)
  for (let p of gameState.papers) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05; // gravity
    p.angle += p.spin;
    p.alpha -= 0.015;
    p.lifetime++;
  }
  // Remove faded papers
  gameState.papers = gameState.papers.filter(p => p.alpha > 0.1 && p.lifetime < 120);

// Function to spawn flying paper at (x, y)
function spawnPaperEffect(x, y) {
  if (!gameState.papers) gameState.papers = [];
  for (let i=0; i<2+Math.floor(Math.random()*2); ++i) {
    gameState.papers.push({
      x: x+randInt(-6,6),
      y: y+randInt(-6,6),
      vx: (Math.random()-0.5)*1.8,
      vy: -Math.random()*1.2-0.2,
      angle: Math.random()*Math.PI*2,
      spin: (Math.random()-0.5)*0.16,
      alpha: 1,
      size: randInt(6,10),
      lifetime: 0
    });
  }
}

  // --- Manager hit detection (only player can hit) ---
  if (gameState.manager && gameState.manager.alive && gameState.player) {
    // Projectile hit
    for (let proj of gameState.projectiles||[]) {
      if (!proj.hit && proj.owner === 'player') {
        let dx = proj.x - gameState.manager.x, dy = proj.y - gameState.manager.y;
        if (Math.abs(dx)<18 && Math.abs(dy)<22) {
          gameState.manager.health--;
          proj.hit = true;
          if (gameState.manager.health <= 0) {
            gameState.manager.alive = false;
            setTimeout(()=>{ gameState.managerDefeated = true; gameState.running = false; }, 800);
          }
        }
      }
    }
    // Melee hit when player is near
    if (!gameState.managerMeleeCooldown) gameState.managerMeleeCooldown = 0;
    if (gameState.managerMeleeCooldown > 0) gameState.managerMeleeCooldown--;
    let pdx = gameState.player.x - gameState.manager.x, pdy = gameState.player.y - gameState.manager.y;
    if (Math.abs(pdx)<28 && Math.abs(pdy)<32 && gameState.managerMeleeCooldown === 0) {
      gameState.manager.health--;
      gameState.managerMeleeCooldown = 40; // ~0.7s cooldown
      spawnPaperEffect(gameState.manager.x, gameState.manager.y);
      if (gameState.manager.health <= 0) {
        gameState.manager.alive = false;
        setTimeout(()=>{ gameState.managerDefeated = true; gameState.running = false; }, 800);
      }
    }
  }

  // --- SOUND & EFFECT: Bot KO ---
  if (!gameState.bloodStains) gameState.bloodStains = [];
  for (let bot of gameState.bots) {
    if (bot._wasAlive === undefined) bot._wasAlive = bot.alive;
    if (bot._wasAlive && !bot.alive) {
      playKillSFX();
      spawnPaperEffect(bot.x, bot.y);
      // Add blood stain
      // Generate static amoeba points
      let points = [];
      let n = 16 + Math.floor(Math.random()*4); // More points for smoothness
      let baseR = randInt(13,19); // Larger base radius
      let baseY = randInt(7,11);
      for (let i=0; i<n; ++i) {
        let angle = (i/n)*Math.PI*2;
        let rad = baseR * (0.8 + Math.random()*0.3);
        let x = Math.cos(angle) * rad;
        let y = Math.sin(angle) * baseY * (0.8 + Math.random()*0.3);
        points.push([x, y]);
      }
      gameState.bloodStains.push({
        x: bot.x + randInt(-6,6),
        y: bot.y + randInt(-6,6),
        angle: Math.random()*Math.PI,
        alpha: 0.85+Math.random()*0.1,
        lifetime: 0,
        points
      });
    }
    bot._wasAlive = bot.alive;
  }

  // --- SOUND & EFFECT: Player Dead ---
  if (gameState.player) {
    if (gameState.player._wasAlive === undefined) gameState.player._wasAlive = gameState.player.alive;
    if (gameState.player._wasAlive && !gameState.player.alive) {
      playDeadSFX();
      spawnPaperEffect(gameState.player.x, gameState.player.y);
      // Add blood stain
      // Generate static amoeba points
      let points = [];
      let n = 16 + Math.floor(Math.random()*4); // More points for smoothness
      let baseR = randInt(15,22); // Larger base radius
      let baseY = randInt(8,13);
      for (let i=0; i<n; ++i) {
        let angle = (i/n)*Math.PI*2;
        let rad = baseR * (0.8 + Math.random()*0.3);
        let x = Math.cos(angle) * rad;
        let y = Math.sin(angle) * baseY * (0.8 + Math.random()*0.3);
        points.push([x, y]);
      }
      gameState.bloodStains.push({
        x: gameState.player.x + randInt(-6,6),
        y: gameState.player.y + randInt(-6,6),
        angle: Math.random()*Math.PI,
        alpha: 0.9+Math.random()*0.08,
        lifetime: 0,
        points
      });
    }
    gameState.player._wasAlive = gameState.player.alive;
  }

  // --- Manager spawn logic ---
  if (!gameState.manager && !gameState.managerDefeated) {
    gameState.managerSpawnTimer--;
    if (gameState.managerSpawnTimer <= 0) spawnManager();
  }
  if (gameState.manager && gameState.manager.alive) updateManager();

  // --- Player movement logic ---
  const player = gameState.player;
  if (player && player.alive) {
    let dx = 0, dy = 0;
    if (isMobile) {
      const mobileInput = getMobileInput();
      dx = mobileInput.x;
      dy = mobileInput.y;
      if (dx !== 0 || dy !== 0) {
        // Clamp to unit vector for diagonal movement
        const len = Math.sqrt(dx*dx + dy*dy);
        dx /= len; dy /= len;
        moveWithObstacles(player, dx * player.speed, dy * player.speed);
      }
    } else {
      if (keys.w || keys.ArrowUp) dy -= 1;
      if (keys.s || keys.ArrowDown) dy += 1;
      if (keys.a || keys.ArrowLeft) dx -= 1;
      if (keys.d || keys.ArrowRight) dx += 1;
      if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx*dx + dy*dy);
        dx /= len; dy /= len;
        moveWithObstacles(player, dx * player.speed, dy * player.speed);
      }
    }
    // --- Player auto-pickup items ---
    if (player.inventory.length < 2) {
      for (let item of gameState.items) {
        if (!item.held && Math.hypot(player.x - item.x, player.y - item.y) < player.radius + item.radius + 8) {
          item.held = player;
          player.inventory.push(item);
          if (player.inventory.length >= 2) break;
        }
      }
    }
  }
  // --- Bot AI movement and item logic ---
  for (let bot of gameState.bots) {
    if (!bot.alive) continue;
    // Pickup item if inventory not full and close to one
    // Strictly enforce 2-item inventory limit
    if (bot.inventory.length < 2) {
      for (let item of gameState.items) {
        if (!item.held && Math.hypot(bot.x - item.x, bot.y - item.y) < bot.radius + item.radius + 8) {
          if (bot.inventory.length < 2) {
            item.held = bot;
            bot.inventory.push(item);
          }
          if (bot.inventory.length >= 2) break;
        }
      }
    }
    // --- Bot Targeting ---
    // Every so often, pick a new target (player or another bot)
    if (!bot.target || bot.aiTimer <= 0 || !bot.target.alive) {
      let botsAlive = gameState.bots.filter(b=>b!==bot && b.alive);
      // Reduce chance of targeting player to 15%, and avoid too many bots on one target
      let allTargets = [gameState.player].concat(botsAlive);
      let targetCounts = {};
      for (let b of gameState.bots) {
        if (b.target && b.alive) {
          let id = b.target.name || 'player';
          targetCounts[id] = (targetCounts[id]||0)+1;
        }
      }
      let pickPlayer = Math.random() < 0.15 && gameState.player.alive && (targetCounts['player']||0)<2;
      if (pickPlayer) {
        bot.target = gameState.player;
        bot.aiState = 'chase';
      } else {
        // Prefer bots not already heavily targeted
        let botChoices = botsAlive.filter(b=> (targetCounts[b.name]||0)<2 );
        let choices = botChoices.length ? botChoices : botsAlive;
        bot.target = choices.length ? choices[randInt(0, choices.length-1)] : gameState.player;
        bot.aiState = (bot.target === gameState.player) ? 'chase' : 'botchase';
      }
      bot.aiTimer = randInt(60, 180); // 1-3 seconds
      if (Math.random() < 0.2) bot.aiState = 'wander';
    } else {
      bot.aiTimer--;
    }
    // Throw at target if close and has item
    let distToTarget = Math.hypot(bot.target.x - bot.x, bot.target.y - bot.y);
    if (bot.inventory.length > 0 && distToTarget < 150 && Math.random() < 0.03) {
      let dx = bot.target.x - bot.x, dy = bot.target.y - bot.y;
      let angle = Math.atan2(dy, dx);
      let item = bot.inventory.shift();
      item.held = null;
      let t = ITEM_TYPES.find(t => t.type === item.type);
      gameState.projectiles.push({
        type: item.type, color: item.color, radius: item.radius, label: item.label,
        x: bot.x, y: bot.y, vx: Math.cos(angle)*t.speed, vy: Math.sin(angle)*t.speed,
        owner: bot, damage: t.damage, splash: t.splash || 0, life: 90
      });
    }
    // Fire drill: bots run to edge
    if (gameState.fireDrill) {
      let tx = bot.x < getGameWidth()/2 ? 10 : getGameWidth()-10;
      let ty = bot.y < getGameHeight()/2 ? 10 : getGameHeight()-10;
      let dx = tx - bot.x, dy = ty - bot.y;
      let len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      moveWithObstacles(bot, dx * bot.speed * 1.2, dy * bot.speed * 1.2);
      continue;
    }
    // AI movement
    let bdx = 0, bdy = 0;
    let slow = gameState.coffeeFlood ? 0.55 : 1;
    if ((bot.aiState === 'chase' || bot.aiState === 'botchase') && bot.target) {
      let dx = bot.target.x - bot.x;
      let dy = bot.target.y - bot.y;
      let len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      bdx = dx * bot.speed * 0.95 * slow;
      bdy = dy * bot.speed * 0.95 * slow;
    } else if (bot.aiState === 'wander') {
      bdx = Math.cos(bot.wanderDir || 0) * bot.speed * 0.6 * slow;
      bdy = Math.sin(bot.wanderDir || 0) * bot.speed * 0.6 * slow;
      if (Math.random() < 0.03) bot.wanderDir = (bot.wanderDir || 0) + (Math.random() - 0.5) * 0.5;
    }
    // --- Bot avoidance: spread out if too close to other bots ---
    for (let other of gameState.bots) {
      if (other !== bot && other.alive) {
        let dist = Math.hypot(bot.x-other.x, bot.y-other.y);
        if (dist < 40) {
          let dx = bot.x-other.x, dy = bot.y-other.y;
          let len = Math.hypot(dx, dy)||1;
          bdx += (dx/len) * 0.6;
          bdy += (dy/len) * 0.6;
        }
      }
    }
    // Knockback
    if (bot.knockback.t > 0) {
      moveWithObstacles(bot, bot.knockback.x, bot.knockback.y);
      bot.knockback.t--;
    } else {
      moveWithObstacles(bot, bdx, bdy);
    }
  }
  // --- Projectiles ---
  for (let proj of gameState.projectiles) {
    proj.x += proj.vx;
    proj.y += proj.vy;
    proj.life--;
    // Collide with walls
    if (proj.x < proj.radius || proj.x > getGameWidth()-proj.radius || proj.y < proj.radius || proj.y > getGameHeight()-proj.radius) {
      proj.life = 0;
    }
    // Collide with obstacles
    for (let obs of gameState.obstacles) {
      if (circleRectCollide(proj.x, proj.y, proj.radius, obs.x, obs.y, obs.w, obs.h)) {
        proj.life = 0;
      }
    }
    // Collide with haunted printer
    if (gameState.hauntedPrinter && Math.hypot(proj.x - gameState.hauntedPrinter.x, proj.y - gameState.hauntedPrinter.y) < proj.radius + 30) {
      proj.life = 0;
    }
    // --- Projectile collision with bots/players ---
    let targets;
    if (proj.owner.isBot) {
      // Bot projectile: can hit player or other bots (not itself)
      targets = [gameState.player].concat(gameState.bots.filter(b=>b.alive && b !== proj.owner));
    } else {
      // Player projectile: can hit any alive bot
      targets = gameState.bots.filter(b=>b.alive);
    }
    for (let target of targets) {
      if (!target.alive) continue;
      if (Math.hypot(proj.x - target.x, proj.y - target.y) < proj.radius + target.radius) {
        // Hit!
        target.health -= proj.damage;
        target.wobble = 8;
        spawnParticle(proj.x, proj.y, proj.color);
        proj.life = 0;
        // Scoring
        if (target.health <= 0 && !proj.owner.isBot && target.isBot) gameState.kills += 1; // Only count KOs as kills
        // Knockback
        let ang = Math.atan2(target.y-proj.y, target.x-proj.x);
        target.knockback = {x: Math.cos(ang)*5, y: Math.sin(ang)*5, t: 7};
        break;
      }
    }
  }
  // Remove dead projectiles
  gameState.projectiles = gameState.projectiles.filter(p => p.life > 0);
  // Remove picked up items and respawn new ones at the same spot
  let removedItems = gameState.items.filter(i => i.held);
  for (let item of removedItems) {
    if (typeof item.spotIndex === 'number') {
      spawnNewItem(item.spotIndex);
    }
  }
  gameState.items = gameState.items.filter(i => !i.held);

  // --- Haunted Printer ---
  if (gameState.hauntedPrinter) {
    let hp = gameState.hauntedPrinter;
    // Collide with player and bots
    let allEntities = [gameState.player].concat(gameState.bots);
    for (let ent of allEntities) {
      if (!ent.alive) continue;
      if (Math.hypot(hp.x - ent.x, hp.y - ent.y) < 40) {
        ent.health -= 1.5;
        ent.wobble = 8;
        spawnParticle(ent.x, ent.y, '#cfd8dc');
      }
    }
  }

  // --- Effects & Particles ---
  for (let p of gameState.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
  }
  gameState.particles = gameState.particles.filter(p => p.life > 0);

  // --- Knockouts, scoring, game over ---
  for (let bot of gameState.bots) {
    if (bot.alive && bot.health <= 0) {
      bot.alive = false;
      gameState.score++;
      spawnParticle(bot.x, bot.y, '#bdbdbd');
      // Bot respawn after 4 seconds
      setTimeout(() => respawnBot(bot), 4000);
    }
  }
  if (player && player.alive && player.health <= 0) {
    player.alive = false;
    // Player respawn after 4 seconds
    setTimeout(() => respawnPlayer(), 4000);
  }
}

// Respawn player at random valid spawn point
function respawnPlayer() {
  let pts = getValidSpawnPoints();
  let pt = pts[randInt(0, pts.length-1)];
  let p = gameState.player;
  p.x = pt.x; p.y = pt.y;
  p.health = p.maxHealth;
  p.inventory = [];
  p.alive = true;
  p.wobble = 0;
  p.knockback = {x:0, y:0, t:0};
}
// Respawn bot at random valid spawn point
function respawnBot(bot) {
  let pts = getValidSpawnPoints();
  let pt = pts[randInt(0, pts.length-1)];
  bot.x = pt.x; bot.y = pt.y;
  bot.health = bot.maxHealth;
  bot.inventory = [];
  bot.alive = true;
  bot.wobble = 0;
  bot.knockback = {x:0, y:0, t:0};
  bot.target = null;
  bot.aiTimer = 0;
}
// Helper to get valid spawn points (not on obstacles or players/bots)
function getValidSpawnPoints() {
  // Only allow spawn points that are not on obstacles and not too close to other entities
  let used = [gameState.player].concat(gameState.bots).filter(e=>e.alive).map(e=>({x:e.x,y:e.y}));
  // Generate a dense grid of candidate spawn points
  let points = [];
  for (let x = 60; x < getGameWidth() - 60; x += 40) {
    for (let y = 60; y < getGameHeight() - 60; y += 40) {
      points.push({x, y});
    }
  }
  return points.filter(pt =>
    !gameState.obstacles.some(obs =>
      pt.x > obs.x-20 && pt.x < obs.x+obs.w+20 && pt.y > obs.y-20 && pt.y < obs.y+obs.h+20
    ) &&
    !used.some(u => Math.hypot(u.x-pt.x, u.y-pt.y) < 40)
  );
}


// --- Random Events ---
function triggerRandomEvent() {
  let eventType = ['coffee','fire','printer'][randInt(0,2)];
  if (eventType === 'coffee') {
    gameState.coffeeFlood = 8*60;
    gameState.currentEvent = 'Coffee Flood! Everyone moves slow!';
  } else if (eventType === 'fire') {
    gameState.fireDrill = 7*60;
    gameState.currentEvent = 'Fire Drill! Bots run for exits!';
  } else if (eventType === 'printer') {
    let angle = Math.random()*Math.PI*2;
    gameState.hauntedPrinter = {
      x: getGameWidth()/2, y: getGameHeight()/2,
      vx: Math.cos(angle)*4, vy: Math.sin(angle)*4,
      ticks: 7*60
    };
    gameState.currentEvent = 'Haunted Printer! Avoid the printer!';
  }
  setTimeout(()=>{gameState.currentEvent=null;}, 3000);
}

// --- Particles ---
function spawnParticle(x, y, color) {
  for (let i=0; i<8; ++i) {
    gameState.particles.push({x, y, vx: (Math.random()-0.5)*3, vy: (Math.random()-0.5)*3, color, life: 16});
  }
}

// --- Game Over & Restart ---
function showGameOver() {
  // Show overlay, update leaderboard, allow restart
  gameState.leaderboard.push({score: gameState.score, time: Math.floor(gameState.roundTimer/60)});
  gameState.leaderboard.sort((a,b)=>b.score-a.score);
  document.getElementById('game-over').style.display = 'block';
  document.getElementById('final-score').textContent = gameState.score;
  document.getElementById('restart-btn').onclick = () => {
    document.getElementById('game-over').style.display = 'none';
    resetGame();
  };
}

function resetGame() {
  initGame();
  gameState.kills = 0;
  document.getElementById('score').textContent = 'Kills: 0';
  gameState.roundTimer = 0;
  gameState.eventCountdown = 30*60;
  gameState.gameOver = false;
}

// Draw a pixelated office worker (bot or player)
function drawPixelWorker(entity) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // Bobbing animation
  let t = Date.now()/200 + (entity.isBot ? entity.x : 0);
  let bob = Math.floor(Math.abs(Math.sin(t))*2);
  // Body (shirt)
  ctx.fillStyle = entity.isBot ? entity.color : '#1976d2';
  ctx.fillRect(Math.round(entity.x-12), Math.round(entity.y-8+bob), 24, 18);
  // Head
  ctx.fillStyle = '#ffe0b2';
  ctx.fillRect(Math.round(entity.x-10), Math.round(entity.y-22+bob), 20, 14);
  // Eyes (pixel face)
  ctx.fillStyle = '#222';
  ctx.fillRect(Math.round(entity.x-5), Math.round(entity.y-18+bob), 3, 3);
  ctx.fillRect(Math.round(entity.x+2), Math.round(entity.y-18+bob), 3, 3);
  // Mouth
  ctx.fillStyle = '#a67c52';
  ctx.fillRect(Math.round(entity.x-2), Math.round(entity.y-12+bob), 5, 2);
  // Arms (simple block arms)
  ctx.fillStyle = entity.isBot ? entity.color : '#1976d2';
  ctx.fillRect(Math.round(entity.x-15), Math.round(entity.y-6+bob), 5, 13);
  ctx.fillRect(Math.round(entity.x+10), Math.round(entity.y-6+bob), 5, 13);
  // Legs
  ctx.fillStyle = '#444';
  ctx.fillRect(Math.round(entity.x-7), Math.round(entity.y+10+bob), 5, 10);
  ctx.fillRect(Math.round(entity.x+2), Math.round(entity.y+10+bob), 5, 10);
  // Health bar (pixel style)
  let hp = Math.max(0, entity.health/entity.maxHealth);
  ctx.fillStyle = '#d32f2f';
  ctx.fillRect(Math.round(entity.x-12), Math.round(entity.y-26+bob), 24, 4);
  ctx.fillStyle = '#66bb6a';
  ctx.fillRect(Math.round(entity.x-12), Math.round(entity.y-26+bob), Math.round(24*hp), 4);
  ctx.restore();
}

// --- STATIC RANDOM PASTEL FLOOR ---
let staticGameFloor = [];
function generateStaticGameFloor() {
  const tile = 16;
  const shades = ['#4eb18a', '#6fd1b2', '#8fdcc4', '#b7f3e3'];
  const w = Math.ceil(getGameWidth()/tile), h = Math.ceil(getGameHeight()/tile);
  staticGameFloor = [];
  for (let y = 0; y < h; ++y) {
    staticGameFloor[y] = [];
    for (let x = 0; x < w; ++x) {
      staticGameFloor[y][x] = shades[Math.floor(Math.random()*4)];
    }
  }
}

function renderGame() {
  ctx.clearRect(0, 0, getGameWidth(), getGameHeight());
  // Draw plain pastel teal background (logo-matching)
  ctx.fillStyle = '#6fd1b2';
  ctx.fillRect(0, 0, getGameWidth(), getGameHeight());
  // Draw obstacles (pixel art style)
  for (let obs of gameState.obstacles) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (obs.name === 'Desk') {
      drawDesk(ctx, obs);
    } else if (obs.name === 'Cubicle') {
      drawCubicle(ctx, obs);
    } else if (obs.name === 'Water Cooler') {
      drawWaterCooler(ctx, obs);
    }
    ctx.restore();
  } // ...rest unchanged...

// --- Enhanced Desk Drawing ---
function drawDesk(ctx, obs) {
  // Main desk body
  ctx.fillStyle = '#e7d2b7';
  ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
  // Desk top highlight
  ctx.fillStyle = '#fff7e0';
  ctx.fillRect(obs.x, obs.y, obs.w, 6);
  // Drawers
  ctx.fillStyle = '#f6e6c5';
  for (let i=0; i<3; ++i) ctx.fillRect(obs.x+12+i*32, obs.y+obs.h-16, 20, 10);
  // Handles
  ctx.fillStyle = '#bdbdbd';
  for (let i=0; i<3; ++i) ctx.fillRect(obs.x+20+i*32, obs.y+obs.h-12, 4, 4);
  // Legs
  ctx.fillStyle = '#a1887f';
  ctx.fillRect(obs.x+8, obs.y+obs.h, 8, 16);
  ctx.fillRect(obs.x+obs.w-16, obs.y+obs.h, 8, 16);

  // --- Mat/Rug below desk ---
  ctx.save();
  const matColors = ['#f7e7d2','#e0f7fa','#f3e5f5','#ffe082'];
  let matColor = matColors[(Math.abs(obs.x+obs.y))%matColors.length];
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = matColor;
  ctx.fillRect(obs.x-10, obs.y+obs.h+28, obs.w+20, 18);
  ctx.globalAlpha = 1;
  ctx.restore();

  // --- Chair (behind desk) ---
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#388e8e'; // teal chair
  ctx.fillRect(obs.x+obs.w/2-14, obs.y+obs.h+10, 28, 12); // seat
  ctx.fillStyle = '#1976d2'; // backrest
  ctx.fillRect(obs.x+obs.w/2-12, obs.y+obs.h-2, 24, 14);
  ctx.fillStyle = '#444'; // legs
  ctx.fillRect(obs.x+obs.w/2-10, obs.y+obs.h+22, 6, 8);
  ctx.fillRect(obs.x+obs.w/2+4, obs.y+obs.h+22, 6, 8);
  ctx.restore();

  // --- Monitor (centered on desk) ---
  ctx.save();
  ctx.fillStyle = '#222'; // monitor base
  ctx.fillRect(obs.x+obs.w/2-8, obs.y+8, 16, 12);
  ctx.fillStyle = '#90caf9'; // screen
  ctx.fillRect(obs.x+obs.w/2-6, obs.y+10, 12, 8);
  ctx.fillStyle = '#fff'; // screen shine
  ctx.globalAlpha = 0.3;
  ctx.fillRect(obs.x+obs.w/2-4, obs.y+12, 4, 4);
  ctx.globalAlpha = 1;
  ctx.restore();

  // --- Coffee cup or water bottle (randomly placed) ---
  ctx.save();
  let itemRand = (obs.x*obs.y)%2;
  if (itemRand === 0) {
    // Coffee cup
    ctx.fillStyle = '#fff';
    ctx.fillRect(obs.x+obs.w/2+24, obs.y+10, 7, 10);
    ctx.fillStyle = '#795548';
    ctx.fillRect(obs.x+obs.w/2+24, obs.y+18, 7, 3);
  } else {
    // Water bottle
    ctx.fillStyle = '#b3e5fc';
    ctx.fillRect(obs.x+obs.w/2+24, obs.y+10, 6, 14);
    ctx.fillStyle = '#1976d2';
    ctx.fillRect(obs.x+obs.w/2+24, obs.y+10, 6, 3);
  }
  ctx.restore();

  // --- File folders (stacked on desk) ---
  ctx.save();
  const fileColors = ['#ffe082','#90caf9','#f8c3d9','#c8e6c9'];
  for (let i=0; i<3; ++i) {
    ctx.fillStyle = fileColors[(i+itemRand)%fileColors.length];
    ctx.fillRect(obs.x+obs.w/2-32+i*10, obs.y+10+i*3, 14, 7);
    ctx.strokeStyle = '#bdbdbd';
    ctx.lineWidth = 1;
    ctx.strokeRect(obs.x+obs.w/2-32+i*10, obs.y+10+i*3, 14, 7);
  }
  ctx.restore();

  // Mug (left)
  ctx.fillStyle = '#fff';
  ctx.fillRect(obs.x+16, obs.y+6, 8, 10);
  ctx.fillStyle = '#90caf9'; ctx.fillRect(obs.x+16, obs.y+13, 8, 3);
  // Paper stack (right)
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(obs.x+obs.w-22, obs.y+8, 12, 6);
  ctx.strokeStyle = '#bdbdbd'; ctx.lineWidth = 1;
  ctx.strokeRect(obs.x+obs.w-22, obs.y+8, 12, 6);
  // Outline
  ctx.strokeStyle = '#7d5c36';
  ctx.lineWidth = 8;
  ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
}

// --- Enhanced Cubicle Drawing ---
function drawCubicle(ctx, obs) {
  // Main cubicle
  ctx.fillStyle = obs.color === '#90caf9' ? '#bfe9fa' : '#f8c3d9';
  ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
  // Shadow
  ctx.fillStyle = 'rgba(60,80,60,0.09)';
  ctx.fillRect(obs.x+6, obs.y+obs.h-8, obs.w-12, 8);
  // Window pattern
  ctx.fillStyle = '#fff';
  for (let i=0; i<2; ++i) for (let j=0; j<2; ++j) ctx.fillRect(obs.x+18+i*28, obs.y+18+j*28, 18, 18);
  // Glass shine
  ctx.fillStyle = 'rgba(200,255,255,0.25)';
  ctx.fillRect(obs.x+20, obs.y+20, 10, 8);
  // Monitor (left cubicle)
  if (obs.x % 2 === 0) {
    ctx.fillStyle = '#1976d2';
    ctx.fillRect(obs.x+10, obs.y+obs.h-28, 18, 10);
    ctx.fillStyle = '#222';
    ctx.fillRect(obs.x+10, obs.y+obs.h-18, 18, 2);
  } else {
    // Plant (right cubicle)
    ctx.fillStyle = '#388e3c';
    ctx.fillRect(obs.x+obs.w-20, obs.y+obs.h-22, 8, 10);
    ctx.fillStyle = '#795548';
    ctx.fillRect(obs.x+obs.w-18, obs.y+obs.h-12, 4, 4);
  }
  // Outline
  ctx.strokeStyle = '#3b5a7a';
  ctx.lineWidth = 8;
  ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
}

// --- Enhanced Water Cooler Drawing ---
function drawWaterCooler(ctx, obs) {
  // Body
  ctx.fillStyle = '#e3f2fd';
  ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
  // Water (lower half)
  ctx.fillStyle = '#b3e5fc';
  ctx.fillRect(obs.x+6, obs.y+obs.h/2, obs.w-12, obs.h/2-8);
  // Tap
  ctx.fillStyle = '#1976d2';
  ctx.fillRect(obs.x+obs.w/2-2, obs.y+obs.h-18, 4, 10);
  // Cup
  ctx.fillStyle = '#fff';
  ctx.fillRect(obs.x+obs.w/2+8, obs.y+obs.h-12, 6, 8);
  ctx.strokeStyle = '#bdbdbd'; ctx.lineWidth = 1;
  ctx.strokeRect(obs.x+obs.w/2+8, obs.y+obs.h-12, 6, 8);
  // Shadow
  ctx.fillStyle = 'rgba(60,80,60,0.10)';
  ctx.fillRect(obs.x+4, obs.y+obs.h-6, obs.w-8, 6);
  // Outline
  ctx.strokeStyle = '#1976d2';
  ctx.lineWidth = 6;
  ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
}

  // Draw items (pixel icons)
  for (let item of gameState.items) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#333';
    if (item.type === 'paperclip') {
      // Gray/blue paperclip with black outline
      ctx.fillStyle = '#b0c4cc';
      ctx.fillRect(item.x-6, item.y-3, 12, 6);
      ctx.strokeRect(item.x-6, item.y-3, 12, 6);
      ctx.fillStyle = '#4fc3f7';
      ctx.fillRect(item.x-4, item.y-1, 8, 2);
      ctx.strokeRect(item.x-4, item.y-1, 8, 2);
    } else if (item.type === 'mug') {
      // White/gray mug with black outline
      ctx.fillStyle = '#fff';
      ctx.fillRect(item.x-6, item.y-7, 12, 10);
      ctx.strokeRect(item.x-6, item.y-7, 12, 10);
      ctx.fillStyle = '#b0c4cc';
      ctx.fillRect(item.x+6, item.y-4, 3, 6); // handle
      ctx.strokeRect(item.x+6, item.y-4, 3, 6);
    } else if (item.type === 'stapler') {
      // Brown/green stapler with outline
      ctx.fillStyle = '#a9a77c';
      ctx.fillRect(item.x-8, item.y-4, 16, 7);
      ctx.strokeRect(item.x-8, item.y-4, 16, 7);
      ctx.fillStyle = '#7d5c36';
      ctx.fillRect(item.x-8, item.y+3, 16, 3);
      ctx.strokeRect(item.x-8, item.y+3, 16, 3);
      ctx.fillStyle = '#4fc3f7';
      ctx.fillRect(item.x-6, item.y+6, 12, 2);
      ctx.strokeRect(item.x-6, item.y+6, 12, 2);
    }
    ctx.restore();
  }
  // Draw projectiles (as pixel icons like items)
  for (let proj of gameState.projectiles) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (proj.type === 'paperclip') {
      ctx.fillStyle = '#90caf9';
      for (let i=0; i<4; ++i) ctx.fillRect(proj.x-6+i*3, proj.y-6+i*2, 2, 10-i*2);
      ctx.fillRect(proj.x-2, proj.y-7, 6, 2);
    } else if (proj.type === 'mug') {
      ctx.fillStyle = '#a1887f';
      ctx.fillRect(proj.x-7, proj.y-7, 14, 12);
      ctx.fillStyle = '#fff';
      ctx.fillRect(proj.x-5, proj.y-7, 10, 4);
      ctx.fillStyle = '#a1887f';
      ctx.fillRect(proj.x+6, proj.y-3, 3, 6);
    } else if (proj.type === 'stapler') {
      ctx.fillStyle = '#e57373';
      ctx.fillRect(proj.x-8, proj.y-4, 16, 7);
      ctx.fillStyle = '#b71c1c';
      ctx.fillRect(proj.x-8, proj.y+3, 16, 3);
      ctx.fillStyle = '#888';
      ctx.fillRect(proj.x-6, proj.y+6, 12, 2);
    }
    ctx.restore();
  }
  // Update and draw blood stains (marks that fade after 4s)
  if (gameState.bloodStains) {
    for (let s of gameState.bloodStains) s.lifetime++;
    // Remove after ~4s (240 frames)
    gameState.bloodStains = gameState.bloodStains.filter(s => s.lifetime < 240);
    for (let s of gameState.bloodStains) {
      ctx.save();
      let fade = Math.max(0, Math.min(1, s.alpha * (1 - s.lifetime/240)));
      ctx.globalAlpha = fade;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      // Draw streak/mark
      // Draw static amoeba shape
      ctx.beginPath();
      if (s.points && s.points.length) {
        for (let i=0; i<s.points.length; ++i) {
          let [x, y] = s.points[i];
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = '#b71c1c';
        ctx.shadowColor = '#880808';
        ctx.shadowBlur = 3;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#880808';
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Draw flying papers
  if (gameState.papers) {
    for (let p of gameState.papers) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-p.size/2, -p.size/4, p.size, p.size/2);
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      ctx.strokeRect(-p.size/2, -p.size/4, p.size, p.size/2);
      ctx.restore();
    }
  }

  // Draw manager
  if (gameState.manager) drawManager(ctx, gameState.manager);

  // Play cheer sound effect once when manager is defeated
  if (gameState.managerDefeated && !cheerPlayed) {
    sfxCheer.currentTime = 0;
    sfxCheer.play();
    cheerPlayed = true;
  }
  // Draw bots (pixel office workers)
  for (let bot of gameState.bots) {
    if (gameState.managerDefeated) {
      if (bot.jumpPhase === undefined) bot.jumpPhase = Math.random() * Math.PI * 2;
      bot.jumpPhase += 0.13; // advance jump phase
      let jumpOffset = -Math.abs(Math.sin(bot.jumpPhase)) * 18;
      let oldY = bot.y;
      bot.y = oldY + jumpOffset;
      drawPixelWorker(bot);
      bot.y = oldY;
    } else if (bot.alive) {
      bot.jumpPhase = undefined;
      drawPixelWorker(bot);
    }
  }
  // Draw player (pixel office worker)
  if (gameState.player && gameState.player.alive) {
    if (gameState.managerDefeated) {
      if (gameState.player.jumpPhase === undefined) gameState.player.jumpPhase = Math.random() * Math.PI * 2;
      gameState.player.jumpPhase += 0.13;
      let jumpOffset = -Math.abs(Math.sin(gameState.player.jumpPhase)) * 18;
      let oldY = gameState.player.y;
      gameState.player.y = oldY + jumpOffset;
      drawPixelWorker(gameState.player);
      gameState.player.y = oldY;
    } else {
      gameState.player.jumpPhase = undefined;
      drawPixelWorker(gameState.player);
    }
  }

  // Joyful animation and Play Again button
  if (gameState.managerDefeated) drawManagerVictoryScreen(ctx);
  // TODO: Effects, UI overlays
}

// (Removed broken drawJumpingWorker, now handled inline with y offset above)


let managerVictoryClickHandlerSet = false;
function drawManagerVictoryScreen(ctx) {
  // Joyful confetti
  for (let i=0; i<60; ++i) {
    let angle = (i/60)*Math.PI*2;
    let r = 120+Math.sin(Date.now()/400+i)*20;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = ['#ffe082','#90caf9','#f8c3d9','#c8e6c9'][i%4];
    ctx.beginPath();
    ctx.arc(getGameWidth()/2+Math.cos(angle)*r, getGameHeight()/2+Math.sin(angle)*r, 8, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
  // Manager dead pose with blood stains
  if (gameState.manager) {
    ctx.save();
    ctx.translate(gameState.manager.x, gameState.manager.y);
    ctx.rotate(-Math.PI/2);
    ctx.globalAlpha = 0.7;
    // Blood stains under manager
    for (let b=0; b<3; ++b) {
      ctx.save();
      ctx.translate(randInt(-8,8), randInt(16,28));
      ctx.rotate(Math.random()*Math.PI);
      ctx.beginPath();
      let n = 16;
      let baseR = randInt(13,19);
      let baseY = randInt(7,11);
      for (let i=0; i<n; ++i) {
        let angle = (i/n)*Math.PI*2;
        let rad = baseR * (0.8 + Math.random()*0.3);
        let x = Math.cos(angle) * rad;
        let y = Math.sin(angle) * baseY * (0.8 + Math.random()*0.3);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#b71c1c';
      ctx.shadowColor = '#880808';
      ctx.shadowBlur = 3;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#880808';
      ctx.stroke();
      ctx.restore();
    }
    // Manager body lying horizontally
    ctx.fillStyle = '#444';
    ctx.fillRect(-12, -24, 24, 28);
    ctx.fillStyle = '#fbc16a';
    ctx.fillRect(-10, -38, 20, 16);
    ctx.restore();
  }
  // Play Again button
  let btnW = 180, btnH = 54;
  let bx = getGameWidth()/2-btnW/2, by = getGameHeight()/2+110;
  ctx.save();
  ctx.globalAlpha = 0.96;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#1976d2';
  ctx.lineWidth = 4;
  ctx.fillRect(bx, by, btnW, btnH);
  ctx.strokeRect(bx, by, btnW, btnH);
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1976d2';
  ctx.fillText('Play Again', getGameWidth()/2, by+36);
  ctx.restore();
  // Mouse click handler (set only once)
  if (!managerVictoryClickHandlerSet) {
    canvas.onclick = function(e) {
      let mx = e.offsetX, my = e.offsetY;
      if (mx > bx && mx < bx+btnW && my > by && my < by+btnH) {
        window.location.reload();
      }
    };
    managerVictoryClickHandlerSet = true;
  }
}


// --- SOUND TRIGGERS ---
function playKillSFX() {
  sfxKill.currentTime = 0;
  sfxKill.play();
}
function playDeadSFX() {
  sfxDead.currentTime = 0;
  sfxDead.play();
}


// Loading overlay logic & animation
let loadingAnimId = null;
let loadingPlayers = [];
let loadingSparkles = [];

// --- STATIC RANDOM PASTEL LOADING FLOOR ---
let staticLoadingFloor = [];
function generateStaticLoadingFloor(width, height) {
  const tile = 16;
  const shades = ['#4eb18a', '#6fd1b2', '#8fdcc4', '#b7f3e3'];
  const w = Math.ceil(width/tile), h = Math.ceil(height/tile);
  staticLoadingFloor = [];
  for (let y = 0; y < h; ++y) {
    staticLoadingFloor[y] = [];
    for (let x = 0; x < w; ++x) {
      staticLoadingFloor[y][x] = shades[Math.floor(Math.random()*4)];
    }
  }
}

function drawLoadingAnim() {
  const overlay = document.getElementById('loading-overlay');
  const loadingCanvas = document.getElementById('loading-canvas');
  if (!overlay || !loadingCanvas || overlay.style.display === 'none') return;
  const ctx = loadingCanvas.getContext('2d');
  loadingCanvas.width = overlay.offsetWidth;
  loadingCanvas.height = overlay.offsetHeight;
  ctx.clearRect(0, 0, loadingCanvas.width, loadingCanvas.height);

  // Draw static random pastel floor
  const tile = 16;
  const w = Math.ceil(loadingCanvas.width/tile), h = Math.ceil(loadingCanvas.height/tile);
  if (staticLoadingFloor.length !== h || staticLoadingFloor[0]?.length !== w) generateStaticLoadingFloor(loadingCanvas.width, loadingCanvas.height);
  for (let y = 0; y < h; ++y) {
    for (let x = 0; x < w; ++x) {
      ctx.fillStyle = staticLoadingFloor[y][x];
      ctx.fillRect(x*tile, y*tile, tile, tile);
    }
  }

  // Animate sparkles
  for (const s of loadingSparkles) {
    ctx.save();
    ctx.globalAlpha = 0.7 + 0.3*Math.sin(Date.now()/400 + s.phase);
    ctx.fillStyle = '#ffe082';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y-10);
    for (let i=0; i<8; ++i) {
      const angle = i*Math.PI/4;
      ctx.lineTo(s.x + Math.cos(angle)*10, s.y + Math.sin(angle)*10);
      ctx.lineTo(s.x, s.y);
    }
    ctx.fill();
    ctx.restore();
  }

  // Animate players using actual player/bot design
  for (const p of loadingPlayers) {
    // Create a mock entity object for drawPixelWorker
    let entity = {
      x: p.x,
      y: p.y,
      color: p.color,
      isBot: p.isBot,
      health: 100,
      maxHealth: 100,
      name: p.isBot ? 'Bot' : 'You',
      wobble: 0,
      alive: true,
      inventory: [],
      radius: 18
    };
    // Use the same function as in the game
    drawPixelWorker(entity);
    // Move
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 24 || p.x > loadingCanvas.width-24) p.vx *= -1;
    if (p.y < 24 || p.y > loadingCanvas.height-24) p.vy *= -1;
  }

  loadingAnimId = requestAnimationFrame(drawLoadingAnim);
}

function startLoadingAnim() {
  // Init players
  const overlay = document.getElementById('loading-overlay');
  const loadingCanvas = document.getElementById('loading-canvas');
  if (!overlay || !loadingCanvas) return;
  loadingPlayers = [];
  const w = overlay.offsetWidth, h = overlay.offsetHeight;
  const colors = ['#90caf9','#f8c3d9','#bfe9fa','#e7d2b7','#a9a77c','#fffbe7'];
  for (let i=0;i<6;++i) {
    loadingPlayers.push({
      x: 60+Math.random()*(w-120),
      y: 60+Math.random()*(h-120),
      vx: (Math.random()*2+1)*(Math.random()<0.5?1:-1),
      vy: (Math.random()*2+1)*(Math.random()<0.5?1:-1),
      color: colors[i%colors.length],
      isBot: i !== 0 // first is player, rest are bots
    });
  }
  // Sparkles
  loadingSparkles = [];
  for (let i=0;i<8;++i) {
    loadingSparkles.push({
      x: Math.random()*w,
      y: Math.random()*h,
      phase: Math.random()*Math.PI*2
    });
  }
  drawLoadingAnim();
}
function stopLoadingAnim() {
  if (loadingAnimId) cancelAnimationFrame(loadingAnimId);
  loadingAnimId = null;
}

function showLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';
  if (canvas) canvas.style.pointerEvents = 'none';
  setTimeout(startLoadingAnim, 50);
}
function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
  if (canvas) canvas.style.pointerEvents = 'auto';
  stopLoadingAnim();
}

window.addEventListener('DOMContentLoaded', () => {
  showLoadingOverlay();
  const joinBtn = document.getElementById('join-btn');
  if (joinBtn) {
    joinBtn.onclick = () => {
      hideLoadingOverlay();
      // Start/restart game
      if (!gameState.running) {
        initGame();
        gameState.running = true;
      }
    };
  }
});

// Start
initGame();
gameLoop();
