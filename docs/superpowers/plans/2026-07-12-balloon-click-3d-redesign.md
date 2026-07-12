# Balloon Click 3D Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task.

**Goal:** Transform the existing 2D canvas balloon-shooting game into a click-to-pop 3D balloon game with Three.js, realistic physics, explosion effects, and HTML UI.

**Architecture:** Two-layer: Three.js scene (3D balloons, lights, particles, camera) + HTML overlay (all UI). Game logic state machine preserved from existing code. Raycaster handles click detection on 3D balloons.

**Tech Stack:** Three.js (CDN r160+), Web Audio API, HTML5/CSS3, localStorage

## Global Constraints

- Single file: `index.html` (rewrite existing)
- Three.js loaded via CDN `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r160/three.min.js">`
- All UI must be HTML/CSS overlay, not Canvas 2D
- No build step — open `index.html` directly in browser
- Preserve all game modes: Classic, Blitz, Marathon, Zen
- Keep existing localStorage schema (key `balloonAttack`)
- Keep all achievements, challenges, leaderboard, ghost replay
- Balloon radius: 40–55 (bigger than current 24–30)
- Balloon colors: rich variety (not blue-locked)
- Bomb click: score = max(0, score - 30), not game over
- Realistic pop sound: white noise burst with low-pass filter

---

### Task 1: Three.js Scene & Renderer Setup

**Files:**
- Rewrite: `index.html` (entire file)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `window.THREE` loaded, `Scene`, `Camera`, `Renderer`, `Lights` set up, canvas in DOM

- [ ] **Step 1: Add Three.js CDN and create HTML+CSS shell**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no">
<title>Balloon Score Attack</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r160/three.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box;user-select:none}
html,body{width:100%;height:100%;overflow:hidden;background:#1a1a2e;font-family:'Segoe UI',system-ui,-apple-system,sans-serif}
#gameContainer{position:relative;width:100%;height:100%}
#gameCanvas{display:block;width:100%;height:100%;touch-action:none}
#ui-overlay{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10}
#ui-overlay>*{pointer-events:auto}
</style>
</head>
<body>
<div id="gameContainer">
  <canvas id="gameCanvas"></canvas>
  <div id="ui-overlay"></div>
</div>
<script>/* game code here */</script>
</body>
</html>
```

- [ ] **Step 2: Initialize Three.js scene, camera, renderer**

```javascript
var container = document.getElementById('gameContainer');
var canvas = document.getElementById('gameCanvas');
var W = window.innerWidth, H = window.innerHeight;

var scene = new THREE.Scene();
scene.background = new THREE.Color(0x16213e);

var camera = new THREE.PerspectiveCamera(60, W / H, 1, 2000);
camera.position.set(0, 300, 700);
camera.lookAt(0, 200, 0);

var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
```

- [ ] **Step 3: Add lights**

```javascript
var ambient = new THREE.AmbientLight(0x404060, 0.6);
scene.add(ambient);
var hemi = new THREE.HemisphereLight(0x87ceeb, 0x362d59, 0.8);
scene.add(hemi);
var point = new THREE.PointLight(0xffeedd, 1.2, 1000);
point.position.set(300, 500, 400);
scene.add(point);
```

- [ ] **Step 4: Add responsive resize handler**

```javascript
window.addEventListener('resize', function() {
  var w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
```

- [ ] **Step 5: Verify in browser**

Run: Open `index.html` in browser
Expected: Dark blue fullscreen renders, no console errors, Three.js context created

- [ ] **Step 6: Commit**

```bash
git add index.html && git commit -m "feat: three.js scene with camera, lights, renderer"
```

---

### Task 2: Create HTML UI Overlay (Menu, HUD, All Panels)

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `#ui-overlay` div from Task 1
- Produces: All UI panels as HTML elements with CSS styling

- [ ] **Step 1: Add UI CSS styles to `<style>`**

```css
/* === UI Overlay === */
.ui-panel{position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);z-index:100}
.ui-hidden{display:none!important}
.ui-btn{background:rgba(74,144,217,0.2);border:1px solid rgba(74,144,217,0.5);border-radius:8px;color:#fff;cursor:pointer;font-size:16px;font-weight:bold;padding:10px 32px;margin:6px;transition:background .15s}
.ui-btn:hover{background:rgba(74,144,217,0.4)}
.ui-btn-sm{padding:6px 20px;font-size:14px}
.ui-title{color:#ffdd57;font-size:44px;font-weight:bold;margin-bottom:8px}
.ui-subtitle{color:rgba(255,255,255,0.5);font-size:16px;margin-bottom:24px}
/* HUD */
#hud{position:absolute;top:0;left:0;width:100%;padding:10px 16px;display:flex;justify-content:space-between;align-items:flex-start;pointer-events:none;z-index:50}
#hud>*{pointer-events:auto}
.hud-box{background:rgba(0,0,0,0.4);border-radius:8px;padding:4px 12px;color:#fff;font-size:18px;font-weight:bold}
.hud-timer{background:rgba(0,0,0,0.4);border-radius:8px;padding:4px 16px;font-size:22px;font-weight:bold;text-align:center}
.hud-timer.warning{color:#ff4444}
.hud-combo{background:rgba(0,0,0,0.4);border-radius:8px;padding:4px 12px;color:#ffdd57;font-size:18px;font-weight:bold}
#pauseBtn{background:rgba(0,0,0,0.4);border:none;border-radius:8px;color:rgba(255,255,255,0.8);font-size:20px;font-weight:bold;padding:4px 12px;cursor:pointer}
```

- [ ] **Step 2: Build HTML for all panels**

```html
<!-- HUD -->
<div id="hud" class="ui-hidden">
  <div class="hud-box" id="scoreDisplay">0</div>
  <div class="hud-timer" id="timerDisplay">15s</div>
  <div style="display:flex;align-items:center;gap:8px">
    <div class="hud-combo ui-hidden" id="comboDisplay">0x combo</div>
    <button id="pauseBtn">||</button>
  </div>
</div>

<!-- Menu Panel -->
<div class="ui-panel" id="menuPanel">
  <div class="ui-title">Balloon Attack</div>
  <div class="ui-subtitle">点击气球。刷新你的分数。</div>
  <div id="modeList">
    <button class="ui-btn" data-mode="classic" style="width:220px">Classic 15s</button>
    <button class="ui-btn" data-mode="blitz" style="width:220px">Blitz 10s</button>
    <button class="ui-btn" data-mode="marathon" style="width:220px">Marathon 30s</button>
    <button class="ui-btn" data-mode="zen" style="width:220px">Zen ∞</button>
  </div>
  <div style="margin-top:16px;display:flex;gap:8px">
    <button class="ui-btn ui-btn-sm" data-panel="leaderboard">排行榜</button>
    <button class="ui-btn ui-btn-sm" data-panel="achievements">成就</button>
    <button class="ui-btn ui-btn-sm" data-panel="challenges">挑战</button>
    <button class="ui-btn ui-btn-sm" data-panel="settings">设置</button>
  </div>
  <div style="position:absolute;bottom:15px;color:rgba(255,255,255,0.2);font-size:11px">Inspired by 大富翁4 QiCaiQiQiu</div>
</div>

<!-- Game Over Panel -->
<div class="ui-panel ui-hidden" id="gameOverPanel">
  <div class="ui-title" style="font-size:36px">Game Over</div>
  <div style="color:#fff;font-size:28px;font-weight:bold;margin:8px 0" id="finalScore">0</div>
  <div style="color:rgba(255,255,255,0.4);font-size:15px" id="finalStats"></div>
  <div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
    <button class="ui-btn" id="retryBtn">再来一局</button>
    <button class="ui-btn" id="replayBtn" style="display:none">观看回放</button>
    <button class="ui-btn" id="menuBtn">返回菜单</button>
  </div>
</div>

<!-- Pause Panel -->
<div class="ui-panel ui-hidden" id="pausePanel">
  <div style="color:#fff;font-size:32px;font-weight:bold;margin-bottom:24px">暂停</div>
  <button class="ui-btn" id="resumeBtn">继续</button>
  <button class="ui-btn" id="restartBtn">重新开始</button>
  <button class="ui-btn" id="quitBtn">退出</button>
</div>

<!-- Other panels (leaderboard, achievements, challenges, settings) -->
<!-- ... same structure as existing but as HTML ... -->
```

- [ ] **Step 3: Implement UI controller**

```javascript
var UI = {
  show: function(id) {
    document.querySelectorAll('.ui-panel').forEach(function(el) { el.classList.add('ui-hidden'); });
    var panel = document.getElementById(id);
    if (panel) panel.classList.remove('ui-hidden');
  },
  showHUD: function(show) {
    document.getElementById('hud').classList.toggle('ui-hidden', !show);
  },
  updateScore: function(s) { document.getElementById('scoreDisplay').textContent = s; },
  updateTimer: function(t) {
    var el = document.getElementById('timerDisplay');
    el.textContent = Math.ceil(t) + 's';
    el.classList.toggle('warning', t <= 3);
  },
  updateCombo: function(c) {
    var el = document.getElementById('comboDisplay');
    if (c >= 3) { el.textContent = c + 'x combo'; el.classList.remove('ui-hidden'); }
    else el.classList.add('ui-hidden');
  },
  updateFinalScore: function(score, totalPops, maxCombo, gameTime, best) {
    document.getElementById('finalScore').textContent = '得分: ' + score;
    var stats = '击中: ' + totalPops + '  最大连击: ' + maxCombo + '  时间: ' + Math.round(gameTime) + 's';
    document.getElementById('finalStats').textContent = stats;
    // show replay btn if ghost exists
    var hasGhost = !!Storage.getGhost(Game.getMode());
    document.getElementById('replayBtn').style.display = (Game.isDesktop && hasGhost) ? '' : 'none';
  }
};
```

- [ ] **Step 4: Wire event listeners**

```javascript
document.getElementById('modeList').addEventListener('click', function(e) {
  var btn = e.target.closest('[data-mode]');
  if (btn) { Game.startMode(btn.dataset.mode); }
});
document.querySelectorAll('[data-panel]').forEach(function(btn) {
  btn.addEventListener('click', function() { UI.show(this.dataset.panel + 'Panel'); });
});
document.getElementById('retryBtn').addEventListener('click', function() { Game.restart(); });
document.getElementById('menuBtn').addEventListener('click', function() { Game.goToMenu(); });
document.getElementById('pauseBtn').addEventListener('click', function() { Game.togglePause(); });
document.getElementById('resumeBtn').addEventListener('click', function() { Game.togglePause(); });
document.getElementById('restartBtn').addEventListener('click', function() { Game.restart(); });
document.getElementById('quitBtn').addEventListener('click', function() { Game.goToMenu(); });
// back buttons for sub-panels...
```

- [ ] **Step 5: Verify in browser**

Run: Open `index.html`
Expected: Menu panel shows, buttons respond to click

- [ ] **Step 6: Commit**

```bash
git add index.html && git commit -m "feat: html ui overlay with menu, hud, game over, pause"
```

---

### Task 3: Balloon 3D Model & Creation

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: Three.js scene from Task 1
- Produces: `createBalloonMesh(type, value, color)` → Three.js group with sphere + string + highlight

- [ ] **Step 1: Implement balloon mesh factory**

```javascript
var balloonMeshes = [];

function createBalloonMesh(type, value, hue) {
  var group = new THREE.Group();
  var radius = type === 'normal' ? 40 - value * 2 : (type === 'question' ? 38 : 36);
  radius = Math.max(28, radius);

  var geo = new THREE.SphereGeometry(radius, 24, 18);
  // stretch Y for egg/drop shape
  var pos = geo.attributes.position;
  for (var i = 0; i < pos.count; i++) {
    pos.setY(i, pos.getY(i) * 1.12);
  }
  geo.computeVertexNormals();

  var color;
  if (type === 'normal') {
    color = new THREE.Color().setHSL(hue / 360, 0.8, 0.55);
  } else if (type === 'question') {
    color = new THREE.Color(0xf5c842);
  } else {
    color = new THREE.Color(0x8b0000);
  }

  var mat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: type === 'bomb' ? 0.6 : 0.25,
    metalness: type === 'bomb' ? 0.0 : 0.1,
    emissive: type === 'bomb' ? new THREE.Color(0x440000) : new THREE.Color(0x000000),
    emissiveIntensity: 0.3
  });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  group.add(mesh);

  // specular highlight sprite
  var spriteMap = new THREE.CanvasTexture(generateHighlightCanvas());
  var spriteMat = new THREE.SpriteMaterial({ map: spriteMap, transparent: true, opacity: 0.6 });
  var sprite = new THREE.Sprite(spriteMat);
  sprite.position.set(radius * 0.35, radius * 0.35, radius * 0.7);
  sprite.scale.set(radius * 0.5, radius * 0.5, 1);
  group.add(sprite);

  // string
  var stringGeo = new THREE.CylinderGeometry(0.5, 0.5, 30, 4);
  var stringMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
  var string = new THREE.Mesh(stringGeo, stringMat);
  string.position.y = -radius * 1.12 - 15;
  group.add(string);

  return group;
}

function generateHighlightCanvas() {
  var c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  var ctx = c.getContext('2d');
  var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return c;
}
```

- [ ] **Step 2: Implement balloon data structure**

```javascript
// Each balloon object ties mesh to game data
function Balloon(type, value, hue, lane) {
  this.type = type;
  this.value = value;
  this.lane = lane;
  this.x = lane * LANE_W + LANE_W / 2;
  this.y = H + 60;
  this.radius = type === 'normal' ? Math.max(28, 40 - value * 2) : (type === 'question' ? 38 : 36);
  this.radius = Math.max(28, this.radius);
  this.active = true;
  this.popped = false;

  // physics
  this.vy = -(80 + Math.random() * 30);  // initial upward velocity
  this.accel = -15;  // upward acceleration (speeds up over time)
  this.swayAmp = 15 + Math.random() * 25;  // horizontal sway amplitude
  this.swayFreq = 0.6 + Math.random() * 0.8;  // sway frequency
  this.swayPhase = Math.random() * Math.PI * 2;
  this.rotSpeed = (Math.random() - 0.5) * 0.6;  // y-axis rotation

  // mesh
  var hueVal = hue !== undefined ? hue : Math.random() * 360;
  this.mesh = createBalloonMesh(type, value, hueVal);
  this.mesh.position.set(this.x, this.y, 0);
  this.mesh.userData.balloon = this;
  scene.add(this.mesh);
  balloonMeshes.push(this);
}
```

- [ ] **Step 3: Verify in browser**

Run: `index.html` with a simple test spawn (temporary)
Expected: 3D balloon with highlight and string renders in scene

- [ ] **Step 4: Commit**

```bash
git add index.html && git commit -m "feat: 3d balloon mesh with stretch, highlight, string"
```

---

### Task 4: Balloon Floating Animation

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `Balloon` objects, `scene`, `dt`
- Produces: `updateBalloons(dt)` — updates position, sway, rotation per balloon

- [ ] **Step 1: Implement balloon update loop**

```javascript
var LANE_W = 200; // 800/4

function updateBalloons(dt) {
  for (var i = balloonMeshes.length - 1; i >= 0; i--) {
    var b = balloonMeshes[i].userData.balloon;
    if (!b || !b.active) continue;

    // rising with acceleration
    b.vy += b.accel * dt;
    b.y += b.vy * dt;

    // horizontal sway
    b.x = b.lane * LANE_W + LANE_W / 2 + Math.sin(b.swayPhase + b.swayFreq * b.y * 0.01) * b.swayAmp;

    // y-axis rotation
    var mesh = b.mesh;
    mesh.rotation.y += b.rotSpeed * dt;
    // slight tilt based on sway
    mesh.rotation.z = Math.sin(b.swayPhase + b.swayFreq * b.y * 0.01) * 0.05;

    mesh.position.x = b.x - W / 2; // center origin
    mesh.position.y = b.y - H / 2;

    // remove when off top
    if (b.y > H + 100) {
      scene.remove(mesh);
      balloonMeshes.splice(i, 1);
    }
  }
}
```

- [ ] **Step 2: Create spawn system**

```javascript
var spawnTimer = 0;

function spawnBalloon() {
  var lane = Math.floor(Math.random() * 4);
  var r = Math.random();
  var type, value, hue;
  var mode = MODES[gameMode] || MODES.classic;
  if (mode.hasBombs && r < 0.1) {
    type = 'bomb'; value = 0; hue = 0;
  } else if (r < 0.2) {
    type = 'question'; value = 0; hue = 50;
  } else {
    type = 'normal'; value = Math.floor(Math.random() * 9) + 1;
    hue = Math.random() * 360; // rich colors
  }
  new Balloon(type, value, hue, lane);
}
```

- [ ] **Step 3: Integrate with game loop**

```javascript
function updatePlaying(dt) {
  gameTime += dt;
  // timer logic...
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnBalloon();
    spawnTimer = 1.0 + Math.random() * 0.6;
  }
  updateBalloons(dt);
}
```

- [ ] **Step 4: Verify in browser**

Run: `index.html`, start a game
Expected: Balloons float upward with acceleration, sway left/right, rotate slowly

- [ ] **Step 5: Commit**

```bash
git add index.html && git commit -m "feat: balloon floating with acceleration, sway, rotation"
```

---

### Task 5: Click Interaction via Raycaster

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `scene`, `camera`, mouse/touch events
- Produces: `onClick(x, y)` → raycaster detects balloon hit → calls `onBalloonPop(b)`

- [ ] **Step 1: Add raycaster and click handler**

```javascript
var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();

function onCanvasClick(clientX, clientY) {
  var rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  // collect all balloon meshes
  var meshes = [];
  balloonMeshes.forEach(function(g) {
    g.traverse(function(child) {
      if (child.isMesh && child.geometry.type === 'SphereGeometry') meshes.push(child);
    });
  });
  var intersects = raycaster.intersectObjects(meshes);
  if (intersects.length > 0) {
    var hit = intersects[0].object.parent.userData.balloon;
    if (hit && hit.active && !hit.popped) {
      onBalloonPop(hit);
    }
  }
}

// Mouse
renderer.domElement.addEventListener('click', function(e) { onCanvasClick(e.clientX, e.clientY); });
// Touch
renderer.domElement.addEventListener('touchstart', function(e) {
  e.preventDefault();
  var t = e.touches[0];
  onCanvasClick(t.clientX, t.clientY);
  // also handle touch for cannon movement (removed) — just click
}, { passive: false });
```

- [ ] **Step 2: Implement onBalloonPop**

```javascript
function onBalloonPop(b) {
  if (!b.active || b.popped) return;
  b.active = false;
  b.popped = true;
  totalPops++; combo++;
  if (combo > maxCombo) maxCombo = combo;

  playPopSound();

  if (b.type === 'normal') {
    var added = Math.round(b.value * scoreMultiplier);
    score += added;
    showFloatingText(b.x, b.y + 40, '+' + added, '#fff', b.value > 7 ? 24 : 18);
  } else if (b.type === 'question') {
    applyQuestionEffect();
  } else if (b.type === 'bomb') {
    score = Math.max(0, score - 30);
    screenShake = 0.3;
    showFloatingText(W / 2, H / 2, '-30', '#ff4444', 40);
  }

  triggerExplosion(b.mesh, b.type);
  scoreMultiplier = 1 + Math.floor(combo / 5) * 0.5; // combo multiplier
}
```

- [ ] **Step 3: Remove cannon and projectile code**

Delete all: `cannonX`, `CANNON_Y`, `createProjectile`, `drawCannon`, projectile rendering, cannon input handlers.

- [ ] **Step 4: Verify in browser**

Run: `index.html`, start game, click balloons
Expected: Clicking a balloon triggers pop, score updates, no cannon/projectile visible

- [ ] **Step 5: Commit**

```bash
git add index.html && git commit -m "feat: click interaction with raycaster, removed cannon"
```

---

### Task 6: Explosion Effects & Particles

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `scene`, `balloon mesh`, `type`
- Produces: `triggerExplosion(mesh, type)` — animation sequence + particle system

- [ ] **Step 1: Implement explosion animation sequence**

```javascript
var explosions = [];

function triggerExplosion(mesh, type) {
  var pos = mesh.position.clone();
  var color = mesh.children[0].material.color.clone();
  var isBomb = type === 'bomb';

  scene.remove(mesh);
  // remove from balloonMeshes
  for (var i = balloonMeshes.length - 1; i >= 0; i--) {
    if (balloonMeshes[i] === mesh) { balloonMeshes.splice(i, 1); break; }
  }

  // flash sprite
  var flashCanvas = document.createElement('canvas');
  flashCanvas.width = 128; flashCanvas.height = 128;
  var fctx = flashCanvas.getContext('2d');
  var grad = fctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  var c = isBomb ? '255,50,50' : '255,255,255';
  grad.addColorStop(0, 'rgba(' + c + ',1)');
  grad.addColorStop(0.3, 'rgba(' + c + ',0.6)');
  grad.addColorStop(1, 'rgba(' + c + ',0)');
  fctx.fillStyle = grad; fctx.fillRect(0, 0, 128, 128);

  var flashMap = new THREE.CanvasTexture(flashCanvas);
  var flashMat = new THREE.SpriteMaterial({ map: flashMap, transparent: true, opacity: 1 });
  var flash = new THREE.Sprite(flashMat);
  flash.position.copy(pos);
  flash.scale.set(isBomb ? 200 : 120, isBomb ? 200 : 120, 1);
  scene.add(flash);

  var pCount = isBomb ? 60 : 35;
  var particles = [];
  for (var i = 0; i < pCount; i++) {
    var theta = Math.random() * Math.PI * 2;
    var phi = Math.random() * Math.PI;
    var speed = 80 + Math.random() * 120;
    var pColor = color.clone();
    if (isBomb) pColor.lerp(new THREE.Color(0xff0000), Math.random() * 0.5);
    else pColor.offsetHSL((Math.random() - 0.5) * 0.1, 0, 0);

    var pGeo = new THREE.BoxGeometry(4 + Math.random() * 4, 4 + Math.random() * 4, 4 + Math.random() * 4);
    var pMat = new THREE.MeshBasicMaterial({ color: pColor, transparent: true, opacity: 1 });
    var pMesh = new THREE.Mesh(pGeo, pMat);
    pMesh.position.copy(pos);
    pMesh.userData = {
      vx: Math.sin(theta) * Math.cos(phi) * speed,
      vy: Math.sin(phi) * speed + 50,
      vz: Math.cos(theta) * Math.cos(phi) * speed,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 0.5 + Math.random() * 0.5
    };
    scene.add(pMesh);
    particles.push(pMesh);
  }

  explosions.push({
    flash: flash,
    flashLife: 0.1,
    particles: particles,
    timer: 0,
    duration: 1.0
  });
}
```

- [ ] **Step 2: Update explosion particles each frame**

```javascript
function updateExplosions(dt) {
  for (var i = explosions.length - 1; i >= 0; i--) {
    var e = explosions[i];
    e.timer += dt;

    // flash
    if (e.flash) {
      e.flashLife -= dt;
      if (e.flashLife <= 0) { scene.remove(e.flash); e.flash = null; }
      else e.flash.material.opacity = e.flashLife / 0.1;
    }

    // particles
    var allDead = true;
    for (var j = e.particles.length - 1; j >= 0; j--) {
      var p = e.particles[j];
      p.userData.vy -= 300 * dt; // gravity
      p.position.x += p.userData.vx * dt;
      p.position.y += p.userData.vy * dt;
      p.position.z += p.userData.vz * dt;
      p.userData.life -= dt;
      if (p.userData.life <= 0) {
        scene.remove(p);
        e.particles.splice(j, 1);
      } else {
        p.material.opacity = p.userData.life / p.userData.maxLife;
        p.scale.setScalar(p.userData.life / p.userData.maxLife);
        allDead = false;
      }
    }

    if (allDead && !e.flash) {
      explosions.splice(i, 1);
    }
  }
}
```

- [ ] **Step 3: Add to game loop**

```javascript
// in main loop
updateExplosions(dt);
```

- [ ] **Step 4: Verify in browser**

Run: Click balloons
Expected: Balloon expands → flash → disappears → particles burst out and fall with gravity

- [ ] **Step 5: Commit**

```bash
git add index.html && git commit -m "feat: explosion effects with flash and particles"
```

---

### Task 7: Realistic Pop Sound

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `AudioContext` from existing AudioEngine
- Produces: `playPopSound()` — white noise burst with low-pass filter

- [ ] **Step 1: Add realistic pop sound function**

```javascript
function playPopSound() {
  var actx = AudioEngine.getContext();
  if (!actx || !AudioEngine.getEnabled()) return;

  var bufferSize = actx.sampleRate * 0.15; // 150ms
  var buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
  var data = buffer.getChannelData(0);
  for (var i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
  }

  var source = actx.createBufferSource();
  source.buffer = buffer;

  var filter = actx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, actx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(400, actx.currentTime + 0.1);

  var gain = actx.createGain();
  gain.gain.setValueAtTime(0.5, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.15);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(actx.destination);
  source.start();
}

function playBombSound() {
  var actx = AudioEngine.getContext();
  if (!actx || !AudioEngine.getEnabled()) return;

  var bufferSize = actx.sampleRate * 0.3;
  var buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
  var data = buffer.getChannelData(0);
  for (var i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
  }

  var source = actx.createBufferSource();
  source.buffer = buffer;
  var filter = actx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, actx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(100, actx.currentTime + 0.2);
  var gain = actx.createGain();
  gain.gain.setValueAtTime(0.6, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.3);
  source.connect(filter); filter.connect(gain); gain.connect(actx.destination);
  source.start();
}
```

- [ ] **Step 2: Update AudioEngine to expose context**

```javascript
var AudioEngine = (function() {
  var actx = null;
  var enabled = false;
  function init() {
    if (actx) return;
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); enabled = false; } catch (e) { actx = null; }
  }
  return {
    init: init,
    getContext: function() { return actx; },
    getEnabled: function() { return enabled; },
    setEnabled: function(v) { enabled = v; },
    // keep existing oscillator-based sounds as fallback
    // ...
  };
})();
```

- [ ] **Step 3: Verify in browser**

Run: Click balloon → hear realistic pop sound
Expected: Short white-noise burst pop sound, bomb click = deeper longer burst

- [ ] **Step 4: Commit**

```bash
git add index.html && git commit -m "feat: realistic pop sound with white noise and lowpass filter"
```

---

### Task 8: Full Game Integration

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: All previous tasks
- Produces: Complete working game

- [ ] **Step 1: Wire all game state machine with new rendering**

Reuse existing state/update pattern from current code, but replace all Canvas 2D rendering with Three.js scene + HTML UI calls.

```javascript
var Game = (function() {
  var state = 'MENU';
  var stateTime = 0;
  var gameTime = 0;
  var timer = 15, timerMax = 15;
  var score = 0, combo = 0, maxCombo = 0, totalPops = 0;
  var scoreMultiplier = 1, speedMultiplier = 1;
  var screenShake = 0;
  var gameMode = 'classic';
  var isDesktop = true;
  // ... copy remaining state from existing code

  function enterState() {
    stateTime = 0;
    switch (state) {
      case 'MENU':
        UI.show('menuPanel');
        UI.showHUD(false);
        break;
      case 'PLAYING':
        UI.showHUD(true);
        UI.updateScore(0);
        UI.updateTimer(timerMax);
        UI.updateCombo(0);
        break;
      case 'GAME_OVER':
        UI.showHUD(false);
        UI.show('gameOverPanel');
        UI.updateFinalScore(score, totalPops, maxCombo, gameTime, bestScore);
        break;
      case 'PAUSED':
        UI.show('pausePanel');
        break;
    }
  }

  function update(dt) {
    // update particles, floating texts, screen shake
    updateExplosions(dt);
    // ...
    switch (state) {
      case 'PLAYING': updatePlaying(dt); break;
    }
  }

  function render() {
    // camera shake
    if (screenShake > 0) {
      camera.position.x = (Math.random() - 0.5) * screenShake * 20;
      camera.position.y = 300 + (Math.random() - 0.5) * screenShake * 20;
      screenShake = Math.max(0, screenShake - dt * 2);
    } else {
      camera.position.x = 0;
      camera.position.y = 300;
    }
    renderer.render(scene, camera);
  }

  return {
    init: function() { /* ... */ },
    startMode: function(mode) { /* ... */ },
    restart: function() { /* ... */ },
    goToMenu: function() { /* ... */ },
    togglePause: function() { /* ... */ },
    getMode: function() { return gameMode; },
    isDesktop: true
  };
})();
```

- [ ] **Step 2: Add floating text as HTML or Three.js sprite**

```javascript
var floatingTexts = [];

function showFloatingText(x, y, text, color, size) {
  // Use CSS2DRenderer or simple HTML div overlay
  var el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'position:absolute;color:' + color + ';font-size:' + size + 'px;font-weight:bold;pointer-events:none;z-index:60';
  el.style.left = ((x / W) * 100) + '%';
  el.style.top = ((y / H) * 100) + '%';
  document.getElementById('gameContainer').appendChild(el);
  floatingTexts.push({ el: el, life: 1, vy: -60, y: y });
}
```

- [ ] **Step 3: Handle screen shake in camera**

```javascript
// in render loop, before renderer.render
if (screenShake > 0) {
  var intensity = screenShake * 15;
  camera.position.x = (Math.random() - 0.5) * intensity;
  camera.lookAt(0, 200, 0);
}
```

- [ ] **Step 4: Verify in browser**

Run: Full game playable — menu → play → click balloons → score → timer → game over → retry
Expected: All UI works, balloons animate, click triggers pop+effect+sound

- [ ] **Step 5: Commit**

```bash
git add index.html && git commit -m "feat: full game integration with three.js and html ui"
```

---

### Task 9: Ghost Recording Update

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: Existing ghost replay system
- Produces: Record click positions (x, y) and timing instead of cannon positions

- [ ] **Step 1: Update ghost recording to record clicks**

```javascript
function recordGhostClick(x, y) {
  ghostRecording.push({ t: gameTime * 1000, x: x / W, y: y / H });
}

// in onBalloonPop:
if (isDesktop && MODES[gameMode] && MODES[gameMode].recordScore) {
  recordGhostClick(b.x, b.y);
}
```

```javascript
function updateReplay(dt) {
  gameTime += dt;
  ghostReplayTime += dt * 1000;
  var events = ghostReplayData.events;
  while (ghostReplayIndex < events.length && events[ghostReplayIndex].t <= ghostReplayTime) {
    var ev = events[ghostReplayIndex];
    // show indicator where click happened
    var indicator = document.createElement('div');
    indicator.style.cssText = 'position:absolute;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,0.5);pointer-events:none;z-index:55';
    indicator.style.left = (ev.x * 100) + '%';
    indicator.style.top = (ev.y * 100) + '%';
    document.getElementById('gameContainer').appendChild(indicator);
    setTimeout(function() { indicator.remove(); }, 300);
    ghostReplayIndex++;
  }
  timer = Math.max(0, timerMax - gameTime);
  if (ghostReplayIndex >= events.length) {
    state = 'GAME_OVER'; enterState();
  }
}
```

- [ ] **Step 2: Verify in browser**

Run: Complete a game, watch replay
Expected: Replay shows click indicators at recorded positions

- [ ] **Step 3: Commit**

```bash
git add index.html && git commit -m "feat: ghost records clicks instead of cannon positions"
```

---

### Task 10: Camera Positioning & Scene Polish

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `camera`, `scene`
- Produces: Properly positioned camera showing balloons at human-friendly view

- [ ] **Step 1: Adjust camera for best view**

```javascript
camera.position.set(0, 250, 600);
camera.lookAt(0, 300, 0);
```

The camera should see balloons from slightly below, so they appear to float upward and get bigger as they rise (perspective effect).

- [ ] **Step 2: Add subtle background stars or gradient**

```javascript
// Use a gradient background via scene.background (set to color already)
// or add distant star particles
var starGeo = new THREE.BufferGeometry();
var starCount = 200;
var starPos = new Float32Array(starCount * 3);
for (var i = 0; i < starCount; i++) {
  starPos[i * 3] = (Math.random() - 0.5) * 2000;
  starPos[i * 3 + 1] = Math.random() * 800;
  starPos[i * 3 + 2] = -500 + Math.random() * -200;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
var starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, transparent: true, opacity: 0.4 });
var stars = new THREE.Points(starGeo, starMat);
scene.add(stars);
```

- [ ] **Step 3: Verify in browser**

Run: Check visual quality
Expected: Beautiful 3D scene with balloons floating upward against starry background

- [ ] **Step 4: Commit**

```bash
git add index.html && git commit -m "feat: camera positioning and star background"
```

---

### Task 11: Remaining UI Panels (Leaderboard, Achievements, Challenges, Settings)

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `Storage` (existing), `UI` 
- Produces: All HTML panels fully functional

- [ ] **Step 1: Implement leaderboard panel HTML**

```html
<div class="ui-panel ui-hidden" id="leaderboardPanel">
  <div style="color:#fff;font-size:28px;font-weight:bold;margin-bottom:16px">排行榜</div>
  <div id="lbTabs" style="display:flex;gap:8px;margin-bottom:12px">
    <button class="ui-btn ui-btn-sm" data-lb="classic">Classic</button>
    <button class="ui-btn ui-btn-sm" data-lb="blitz">Blitz</button>
    <button class="ui-btn ui-btn-sm" data-lb="marathon">Marathon</button>
  </div>
  <div id="lbEntries" style="color:#fff;min-height:200px"></div>
  <button class="ui-btn" data-back style="margin-top:16px">返回</button>
</div>
```

- [ ] **Step 2: Wire leaderboard data**

```javascript
function renderLeaderboard(mode) {
  var entries = Storage.getLeaderboard(mode);
  var html = '<table style="width:100%;max-width:400px;margin:0 auto">';
  entries.forEach(function(e, i) {
    var d = new Date(e.date);
    html += '<tr><td style="color:#ffdd57;font-weight:bold">#' + (i + 1) + '</td>' +
      '<td style="text-align:right;font-weight:bold">' + e.score + '</td>' +
      '<td style="color:rgba(255,255,255,0.3);font-size:12px;text-align:right">' + d.toLocaleDateString() + '</td></tr>';
  });
  html += '</table>';
  document.getElementById('lbEntries').innerHTML = entries.length ? html : '<div style="color:rgba(255,255,255,0.3);text-align:center">暂无记录</div>';
}
```

- [ ] **Step 3: Repeat for achievements, challenges, settings panels (same pattern)**

- [ ] **Step 4: Verify in browser**

Run: Click through all panels
Expected: Data renders correctly, back buttons work

- [ ] **Step 5: Commit**

```bash
git add index.html && git commit -m "feat: leaderboard, achievements, challenges, settings panels"
```

---

### Task 12: Final Polish & Edge Cases

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: Complete game
- Produces: Polished, edge-case-free game

- [ ] **Step 1: Handle page visibility (pause on tab hide)**

```javascript
document.addEventListener('visibilitychange', function() {
  if (document.hidden && state === 'PLAYING') { isPaused = true; UI.show('pausePanel'); }
});
```

- [ ] **Step 2: Handle Three.js disposal (prevent memory leaks)**

```javascript
function cleanupBalloons() {
  balloonMeshes.forEach(function(m) { scene.remove(m); });
  balloonMeshes = [];
}
// Call on state change to PLAYING:
// cleanupBalloons();
```

- [ ] **Step 3: Audio context resume on click (autoplay policy)**

```javascript
renderer.domElement.addEventListener('click', function() {
  var actx = AudioEngine.getContext();
  if (actx && actx.state === 'suspended') actx.resume();
}, { once: true });
```

- [ ] **Step 4: Verify**

Run: Complete test across all modes
Expected: No console errors, no memory leaks, audio works, page visibility pause works

- [ ] **Step 5: Commit**

```bash
git add index.html && git commit -m "polish: cleanup, page visibility, audio resume"
```
