import * as THREE from 'three';

var canvas = document.getElementById('gameCanvas');
var W, H;
var _z0vec = new THREE.Vector3(), _z0dir = new THREE.Vector3();

function intersectZ0(nx, ny) {
  _z0vec.set(nx, ny, 0.5).unproject(camera);
  _z0dir.copy(_z0vec).sub(camera.position);
  if (Math.abs(_z0dir.z) < 1e-8) return new THREE.Vector3();
  var t = -camera.position.z / _z0dir.z;
  return new THREE.Vector3().copy(camera.position).add(_z0dir.multiplyScalar(t));
}

function updateVisibleBounds() {
  camera.updateMatrixWorld();
  var bl = intersectZ0(-1, -1);
  var br = intersectZ0(1, -1);
  var tl = intersectZ0(-1, 1);
  W = br.x - bl.x;
  H = tl.y - bl.y;
}

var screenShake = 0;
var explosions = [];
var balloonMeshes = [];
var _geoCache = {};
var _labelCache = {};
var _rimCache = {};
var _specTexture = null;
var _rayTargets = [];

function _rebuildRayTargets() {
  _rayTargets.length = 0;
  for (var i = 0; i < balloonMeshes.length; i++) {
    balloonMeshes[i].traverse(function(child) {
      if (child.isMesh && child.geometry.type === 'SphereGeometry') _rayTargets.push(child);
    });
  }
}

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
    setEnabled: function(v) { enabled = v; }
  };
})();

var Storage = (function() {
  var KEY = 'balloonAttack';
  var data = null;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      data = raw ? JSON.parse(raw) : null;
    } catch (e) { data = null; }
    if (!data) {
      data = {
        leaderboard: {},
        achievements: [],
        stats: { totalGames: 0, totalPops: 0, bestScores: {}, totalTime: 0, modesPlayed: [], challenges: [] },
        settings: { soundEnabled: true, musicEnabled: true, ghostEnabled: true }
      };
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  load();

  return {
    getLeaderboard: function(mode) { return data.leaderboard[mode] || []; },
    addScore: function(mode, score) {
      if (!data.leaderboard[mode]) data.leaderboard[mode] = [];
      data.leaderboard[mode].push({ score: score, date: Date.now() });
      data.leaderboard[mode].sort(function(a, b) { return b.score - a.score; });
      if (data.leaderboard[mode].length > 10) data.leaderboard[mode] = data.leaderboard[mode].slice(0, 10);
      save();
    },
    getAchievements: function() { return data.achievements; },
    unlockAchievement: function(id) {
      if (data.achievements.indexOf(id) === -1) { data.achievements.push(id); save(); return true; }
      return false;
    },
    getStats: function() { return data.stats; },
    updateStats: function(s) { for (var k in s) data.stats[k] = s[k]; save(); },
    getSettings: function() { return data.settings; },
    updateSettings: function(s) { for (var k in s) data.settings[k] = s[k]; save(); }
  };
})();

var scene = new THREE.Scene();
var loader = new THREE.TextureLoader();
loader.crossOrigin = 'anonymous';
loader.load('https://assets.699pic.com/public/web/images/601/493/108.jpg!seo.v1', function(tex) {
  scene.background = tex;
});

var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 2000);
camera.position.set(0, 300, 700);
camera.lookAt(0, 200, 0);

var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
updateVisibleBounds();

function initAudio() {
  AudioEngine.init();
  var actx = AudioEngine.getContext();
  if (actx) {
    if (actx.state === 'suspended') actx.resume();
    AudioEngine.setEnabled(Storage.getSettings().soundEnabled);
  }
}
document.addEventListener('click', initAudio, { once: true });
document.addEventListener('touchstart', initAudio, { once: true });

var ambient = new THREE.AmbientLight(0xccccff, 0.9);
scene.add(ambient);
var hemi = new THREE.HemisphereLight(0xddeeff, 0xc8a87e, 1.2);
scene.add(hemi);
var point = new THREE.PointLight(0xffffff, 1.8, 1200);
point.position.set(300, 500, 450);
scene.add(point);
var fill = new THREE.PointLight(0x99ccff, 0.7, 900);
fill.position.set(-200, 300, 200);
scene.add(fill);

window.addEventListener('resize', function() {
  var w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  updateVisibleBounds();
});

var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();

var _soundCache = {};
var _soundKeys = [];

function playSound(spec) {
  var actx = AudioEngine.getContext();
  if (!actx || !AudioEngine.getEnabled()) return;
  if (!_soundCache[spec.key]) {
    if (_soundKeys.length >= 8) {
      var oldest = _soundKeys.shift();
      delete _soundCache[oldest];
    }
    _soundKeys.push(spec.key);
    var bufferSize = actx.sampleRate * spec.bufferDuration;
    _soundCache[spec.key] = actx.createBuffer(1, bufferSize, actx.sampleRate);
    var data = _soundCache[spec.key].getChannelData(0);
    for (var i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * spec.decayConst));
  }
  var source = actx.createBufferSource();
  source.buffer = _soundCache[spec.key];
  var filter = actx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(spec.freqStart, actx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(spec.freqEnd, actx.currentTime + spec.filterRamp);
  var gain = actx.createGain();
  gain.gain.setValueAtTime(spec.gain, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + spec.gainRamp);
  source.connect(filter); filter.connect(gain); gain.connect(actx.destination);
  source.start();
}

function playPopSound() {
  playSound({ key: 'pop', bufferDuration: 0.15, decayConst: 0.1, freqStart: 2000, freqEnd: 400, filterRamp: 0.1, gain: 0.5, gainRamp: 0.15 });
}

function playBombSound() {
  playSound({ key: 'bomb', bufferDuration: 0.3, decayConst: 0.15, freqStart: 800, freqEnd: 100, filterRamp: 0.2, gain: 0.6, gainRamp: 0.3 });
}

var floatingTexts = [];
var _ftPool = [];

function _allocFTDiv() {
  return _ftPool.length > 0 ? _ftPool.pop() : document.createElement('div');
}

function _freeFTDiv(el) {
  el.remove();
  el.textContent = '';
  el.style.cssText = '';
  _ftPool.push(el);
}

function showFloatingText(x, y, text, color, size) {
  var el = _allocFTDiv();
  el.textContent = text;
  el.style.cssText = 'position:absolute;color:' + color + ';font-size:' + size + 'px;font-weight:bold;pointer-events:none;z-index:60;transform:translate(-50%,-50%)';
  var rect = renderer.domElement.getBoundingClientRect();
  el.style.left = (rect.left + (x / W) * rect.width) + 'px';
  var yPos = (rect.top + (y / H) * rect.height);
  el.style.top = yPos + 'px';
  document.getElementById('gameContainer').appendChild(el);
  floatingTexts.push({ el: el, life: 1, vy: -40, y: yPos });
}

function updateFloatingTexts(dt) {
  for (var i = floatingTexts.length - 1; i >= 0; i--) {
    var ft = floatingTexts[i];
    ft.life -= dt * 0.5;
    ft.y += ft.vy * dt;
    ft.el.style.top = ft.y + 'px';
    ft.el.style.opacity = Math.max(0, ft.life);
    if (ft.life <= 0) { _freeFTDiv(ft.el); floatingTexts.splice(i, 1); }
  }
}

function playAchievementSound() {
  var actx = AudioEngine.getContext();
  if (!actx || !AudioEngine.getEnabled()) return;
  var osc = actx.createOscillator();
  var gain = actx.createGain();
  osc.connect(gain);
  gain.connect(actx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(523, actx.currentTime);
  osc.frequency.setValueAtTime(659, actx.currentTime + 0.1);
  osc.frequency.setValueAtTime(784, actx.currentTime + 0.2);
  gain.gain.setValueAtTime(0.25, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.35);
  osc.start();
  osc.stop(actx.currentTime + 0.35);
}

function triggerExplosion(mesh, type) {
  var pos = mesh.position.clone();
  var color = mesh.children[0].material.color.clone();
  var isBomb = type === 'bomb';

  for (var i = balloonMeshes.length - 1; i >= 0; i--) {
    if (balloonMeshes[i] === mesh) { balloonMeshes.splice(i, 1); _rebuildRayTargets(); break; }
  }

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
  var posArr = new Float32Array(pCount * 3);
  var colArr = new Float32Array(pCount * 3);
  var sizeArr = new Float32Array(pCount);
  var vels = new Float32Array(pCount * 3);
  var lives = new Float32Array(pCount);
  var maxLives = new Float32Array(pCount);

  for (var i = 0; i < pCount; i++) {
    var theta = Math.random() * Math.PI * 2;
    var phi = Math.random() * Math.PI;
    var speed = 80 + Math.random() * 120;

    posArr[i*3] = pos.x;
    posArr[i*3+1] = pos.y;
    posArr[i*3+2] = pos.z;

    vels[i*3] = Math.sin(theta) * Math.cos(phi) * speed;
    vels[i*3+1] = Math.sin(phi) * speed + 50;
    vels[i*3+2] = Math.cos(theta) * Math.cos(phi) * speed;

    var pColor = color.clone();
    if (isBomb) pColor.lerp(new THREE.Color(0xff0000), Math.random() * 0.5);
    else pColor.offsetHSL((Math.random() - 0.5) * 0.1, 0, 0);
    colArr[i*3] = pColor.r;
    colArr[i*3+1] = pColor.g;
    colArr[i*3+2] = pColor.b;

    sizeArr[i] = 4 + Math.random() * 4;
    lives[i] = 0.5 + Math.random() * 0.5;
    maxLives[i] = 0.5 + Math.random() * 0.5;
  }

  var pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  pGeo.setAttribute('size', new THREE.BufferAttribute(sizeArr, 1));

  var pMat = new THREE.PointsMaterial({
    size: 8, transparent: true, opacity: 1,
    vertexColors: true, sizeAttenuation: true
  });
  var points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  explosions.push({
    flash: flash, flashLife: 0.1,
    points: points, vels: vels, lives: lives, maxLives: maxLives,
    pCount: pCount, startSizes: new Float32Array(sizeArr),
    timer: 0, duration: 1.0,
    popMesh: mesh
  });
}

function updateExplosions(dt) {
  for (var i = explosions.length - 1; i >= 0; i--) {
    var e = explosions[i];
    e.timer += dt;
    if (e.popMesh) {
      var t = e.timer / 0.15;
      if (t < 0.5) {
        var s = 1 + 0.3 * (t * 2);
        e.popMesh.scale.set(s, s, s);
      } else if (t < 1) {
        var s = 1.3 * (1 - (t - 0.5) * 2);
        e.popMesh.scale.set(Math.max(0.01, s), Math.max(0.01, s), Math.max(0.01, s));
        e.popMesh.traverse(function(child) {
          if (child.material) {
            child.material.transparent = true;
            child.material.opacity = 1 - (t - 0.5) * 2;
          }
        });
      } else {
        scene.remove(e.popMesh);
        e.popMesh = null;
      }
    }
    if (e.flash) {
      e.flashLife -= dt;
      if (e.flashLife <= 0) { if (e.flash.material.map) e.flash.material.map.dispose(); scene.remove(e.flash); e.flash = null; }
      else e.flash.material.opacity = e.flashLife / 0.1;
    }
    var posArr = e.points.geometry.attributes.position.array;
    var sizeArr = e.points.geometry.attributes.size.array;
    var alive = 0, totalLife = 0, totalMax = 0;
    for (var j = 0; j < e.pCount; j++) {
      e.lives[j] -= dt;
      if (e.lives[j] > 0) {
        e.vels[j*3+1] -= 300 * dt;
        posArr[j*3] += e.vels[j*3] * dt;
        posArr[j*3+1] += e.vels[j*3+1] * dt;
        posArr[j*3+2] += e.vels[j*3+2] * dt;
        var r = e.lives[j] / e.maxLives[j];
        sizeArr[j] = e.startSizes[j] * r;
        totalLife += e.lives[j];
        totalMax += e.maxLives[j];
        alive++;
      } else {
        sizeArr[j] = 0;
      }
    }
    e.points.geometry.attributes.position.needsUpdate = true;
    e.points.geometry.attributes.size.needsUpdate = true;
    e.points.material.opacity = alive > 0 ? totalLife / totalMax : 0;
    if (alive === 0 && !e.flash) {
      scene.remove(e.points);
      explosions.splice(i, 1);
    }
  }
}

function getBalloonRadius(type, value) {
  return Math.max(28, type === 'normal' ? 40 - value * 2 : (type === 'question' ? 38 : 36));
}

// 参考图提取的真实气球色板
var BALLOON_PALETTE = [
  { h: 19, s: 0.97, l: 0.47 },
  { h: 31, s: 0.97, l: 0.50 },
  { h: 52, s: 1.00, l: 0.50 },
  { h: 102, s: 0.89, l: 0.31 },
  { h: 129, s: 1.00, l: 0.50 },
  { h: 189, s: 0.89, l: 0.45 },
  { h: 210, s: 0.98, l: 0.45 },
  { h: 246, s: 0.83, l: 0.60 },
  { h: 261, s: 0.82, l: 0.46 },
  { h: 288, s: 0.94, l: 0.48 },
  { h: 317, s: 0.91, l: 0.72 },
  { h: 337, s: 1.00, l: 0.50 },
  { h: 356, s: 1.00, l: 0.50 },
];

function pickBalloonColor() {
  var c = BALLOON_PALETTE[Math.floor(Math.random() * BALLOON_PALETTE.length)];
  return new THREE.Color().setHSL(c.h / 360, c.s, c.l);
}

function createBalloonMesh(type, value, hue) {
  var group = new THREE.Group();
  var radius = getBalloonRadius(type, value);

  function stretchSphereY(geo, factor) {
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) * factor);
    geo.computeVertexNormals();
  }

  var geoKey = 'outer:' + radius;
  var geo = _geoCache[geoKey];
  if (!geo) {
    geo = new THREE.SphereGeometry(radius, 32, 24);
    stretchSphereY(geo, 1.08);
    _geoCache[geoKey] = geo;
  }

  var color;
  if (type === 'normal') {
    if (hue !== undefined) {
      color = new THREE.Color().setHSL(hue / 360, 0.85, 0.55);
    } else {
      color = pickBalloonColor();
    }
  } else if (type === 'question') {
    color = new THREE.Color(0xf5c842);
  } else {
    color = new THREE.Color(0x8b0000);
  }

  var glassMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.13,
    metalness: 0.02,
    transparent: true,
    opacity: 0.88,
    emissive: new THREE.Color(color).multiplyScalar(0.18),
    emissiveIntensity: 0.15,
    envMapIntensity: 0.5
  });
  var outerMesh = new THREE.Mesh(geo, glassMat);
  outerMesh.castShadow = false;
  group.add(outerMesh);

  var innerKey = 'inner:' + Math.round(radius * 0.88);
  var innerGeo = _geoCache[innerKey];
  if (!innerGeo) {
    innerGeo = new THREE.SphereGeometry(radius * 0.88, 24, 18);
    stretchSphereY(innerGeo, 1.08);
    _geoCache[innerKey] = innerGeo;
  }
  var innerMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.25,
    metalness: 0.0,
    transparent: true,
    opacity: 0.25,
    emissive: new THREE.Color(color).multiplyScalar(0.12)
  });
  var innerMesh = new THREE.Mesh(innerGeo, innerMat);
  group.add(innerMesh);

  var actualHue = hue !== undefined ? Math.round(hue / 30) * 30 : 0;
  var rimKey = actualHue;
  var rimCanvas = _rimCache[rimKey];
  if (!rimCanvas) { rimCanvas = generateRimHighlight(rimKey); _rimCache[rimKey] = rimCanvas; }
  var rimMap = new THREE.CanvasTexture(rimCanvas);
  var rimMat = new THREE.SpriteMaterial({ map: rimMap, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  var rimSprite = new THREE.Sprite(rimMat);
  rimSprite.position.set(radius * 0.25, radius * 0.35, radius * 0.7);
  rimSprite.scale.set(radius * 1.4, radius * 1.4, 1);
  group.add(rimSprite);

  if (!_specTexture) _specTexture = new THREE.CanvasTexture(generateHighlightCanvas());
  var specMat = new THREE.SpriteMaterial({ map: _specTexture, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  var specSprite = new THREE.Sprite(specMat);
  specSprite.position.set(radius * 0.35, radius * 0.48, radius * 0.78);
  specSprite.scale.set(radius * 0.7, radius * 0.7, 1);
  group.add(specSprite);

  var labelText = type === 'normal' ? '' + value : (type === 'question' ? '?' : '✕');
  var labelKey = labelText + ':' + radius;
  var labelMap = _labelCache[labelKey];
  if (!labelMap) {
    labelMap = new THREE.CanvasTexture(generateBalloonLabel(labelText, radius));
    _labelCache[labelKey] = labelMap;
  }
  var labelMat = new THREE.SpriteMaterial({ map: labelMap, transparent: true, depthTest: false, depthWrite: false });
  var label = new THREE.Sprite(labelMat);
  label.position.set(0, 0, 0);
  var labelSize = radius * 1.4;
  label.scale.set(labelSize * 1.3, labelSize, 1);
  group.add(label);

  var knotMat = new THREE.MeshBasicMaterial({ color: 0xaa8866 });
  var knot = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 6), knotMat);
  knot.position.y = -radius * 1.08 - 3;
  group.add(knot);

  // 自然弯曲的绳子（参考图风格）
  var stringStartY = -radius * 1.08 - 6;
  var stringLength = 32 + Math.random() * 16;
  var swayOffset = (Math.random() - 0.5) * 8;
  var curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, stringStartY, 0),
    new THREE.Vector3(swayOffset * 0.3, stringStartY - stringLength * 0.2, 1),
    new THREE.Vector3(swayOffset * 0.8, stringStartY - stringLength * 0.55, 2),
    new THREE.Vector3(swayOffset * 0.5, stringStartY - stringLength * 0.8, 1),
    new THREE.Vector3(swayOffset * 0.15, stringStartY - stringLength, 0)
  ]);
  var tubeGeo = new THREE.TubeGeometry(curve, 16, 0.5, 6, false);
  var stringMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.8 });
  var string = new THREE.Mesh(tubeGeo, stringMat);
  group.add(string);

  return group;
}

function generateHighlightCanvas() {
  var c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  var ctx = c.getContext('2d');
  var g = ctx.createRadialGradient(128, 100, 4, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.05, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return c;
}

function generateRimHighlight(hue) {
  var c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  var ctx = c.getContext('2d');
  var col = 'hsla(' + hue + ', 85%, 65%, ';
  var g = ctx.createRadialGradient(220, 40, 0, 128, 128, 128);
  g.addColorStop(0, col + '0.85)');
  g.addColorStop(0.12, col + '0.55)');
  g.addColorStop(0.3, col + '0.25)');
  g.addColorStop(0.6, col + '0.06)');
  g.addColorStop(1, col + '0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  var g2 = ctx.createRadialGradient(40, 200, 0, 128, 128, 128);
  g2.addColorStop(0, 'rgba(255,255,255,0.45)');
  g2.addColorStop(0.3, 'rgba(255,255,255,0.1)');
  g2.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, 256, 256);
  return c;
}

function generateBalloonLabel(text, radius) {
  var size = radius * 3;
  size = Math.max(100, Math.min(180, size));
  var c = document.createElement('canvas');
  c.width = size; c.height = size;
  var ctx = c.getContext('2d');
  var cx = size / 2, cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  var fontSize = Math.round(size * 0.7);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = 'bold ' + fontSize + 'px "Arial Black", Arial, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = size * 0.1;
  ctx.shadowOffsetX = size * 0.03;
  ctx.shadowOffsetY = size * 0.03;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, cx, cy + 2);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, cx, cy);

  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 3;
  ctx.strokeText(text, cx, cy);

  return c;
}

class Balloon {
  constructor(type, value, hue, baseX, baseY) {
    this.type = type;
    this.value = value;
    this.baseX = baseX;
    this.x = baseX;
    this.y = baseY !== undefined ? baseY : Math.random() * (H + 160) - 60;
    this.radius = getBalloonRadius(type, value);
    this.active = true;
    this.popped = false;
    this.vy = 80 + Math.random() * 120;
    this.swayAmp = 15 + Math.random() * 25;
    this.swayFreq = 0.6 + Math.random() * 0.8;
    this.swayPhase = Math.random() * Math.PI * 2;
    this.mesh = createBalloonMesh(type, value, hue);
    this.mesh.position.set(this.x - W / 2, this.y - H / 2, 0);
    this.mesh.userData.balloon = this;
    scene.add(this.mesh);
    balloonMeshes.push(this.mesh);
    _rebuildRayTargets();
  }
}

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
    if (t === Infinity || !isFinite(t)) { el.textContent = '∞'; el.classList.remove('warning'); return; }
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
    if (best > 0) stats += '  最佳: ' + best;
    document.getElementById('finalStats').textContent = stats;
    document.getElementById('replayBtn').style.display = 'none';
  }
};

function renderLeaderboard(mode) {
  var entries = Storage.getLeaderboard(mode);
  var html = entries.length ? '' : '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:40px">暂无记录</div>';
  if (entries.length) {
    html = '<table style="width:100%;max-width:400px;margin:0 auto;border-collapse:collapse">';
    entries.forEach(function(e, i) {
      var d = new Date(e.date);
      html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">' +
        '<td style="color:#ffdd57;font-weight:bold;padding:8px;width:40px">#' + (i + 1) + '</td>' +
        '<td style="text-align:right;font-weight:bold;padding:8px">' + e.score + '</td>' +
        '<td style="color:rgba(255,255,255,0.3);font-size:12px;text-align:right;padding:8px">' + d.toLocaleDateString() + '</td></tr>';
    });
    html += '</table>';
  }
  document.getElementById('lbEntries').innerHTML = html;
}

function renderAchievements() {
  var ACHIEVEMENTS = [
    { id: 'first_blood', name: 'First Blood', desc: 'Pop your first balloon' },
    { id: 'century', name: 'Century', desc: 'Score 100 in one game' },
    { id: 'five_hundred', name: 'Five Hundred', desc: 'Score 500 in one game' },
    { id: 'combo10', name: 'Combo King', desc: 'Reach 10 combo' },
    { id: 'pop_100', name: 'Balloon Hunter', desc: 'Pop 100 balloons total' }
  ];
  var unlocked = Storage.getAchievements();
  var html = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;max-width:380px;margin:16px auto">';
  ACHIEVEMENTS.forEach(function(a) {
    var isUnlocked = unlocked.indexOf(a.id) !== -1;
    html += '<div style="background:' + (isUnlocked ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.03)') +
      ';border:1px solid ' + (isUnlocked ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.1)') +
      ';border-radius:6px;padding:8px;text-align:left">' +
      '<div style="color:' + (isUnlocked ? '#ffdd57' : 'rgba(255,255,255,0.4)') +
      ';font-size:12px;font-weight:bold">' + (isUnlocked ? '✓ ' : '') + a.name + '</div>' +
      '<div style="color:' + (isUnlocked ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)') +
      ';font-size:10px">' + a.desc + '</div></div>';
  });
  html += '</div>';
  document.getElementById('achGrid').innerHTML = html;
}

function renderChallenges() {
  var CHALLENGES = [
    { id: 'ch_500', name: 'Point Collector', desc: 'Score 500 points' },
    { id: 'ch_combo15', name: 'Sharpshooter', desc: 'Reach 15 combo' }
  ];
  var completed = Storage.getStats().challenges || [];
  var html = '<div style="max-width:380px;margin:16px auto">';
  CHALLENGES.forEach(function(c) {
    var done = completed.indexOf(c.id) !== -1;
    html += '<div style="background:' + (done ? 'rgba(0,255,136,0.08)' : 'rgba(255,255,255,0.03)') +
      ';border:1px solid ' + (done ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.1)') +
      ';border-radius:6px;padding:10px;margin-bottom:8px;text-align:left">' +
      '<div style="color:' + (done ? '#00ff88' : '#fff') + ';font-size:14px;font-weight:bold">' +
      (done ? '✓ ' : '') + c.name + '</div>' +
      '<div style="color:' + (done ? 'rgba(0,255,136,0.5)' : 'rgba(255,255,255,0.4)') +
      ';font-size:12px">' + c.desc + '</div></div>';
  });
  html += '</div>';
  document.getElementById('challengeList').innerHTML = html;
}

function renderSettings() {
  var sets = Storage.getSettings();
  document.getElementById('soundToggle').checked = sets.soundEnabled;
  document.getElementById('musicToggle').checked = sets.musicEnabled;
  document.getElementById('ghostToggle').checked = sets.ghostEnabled;
}

var _animId = null;
var _running = false;

function _startLoop() {
  if (_running) return;
  _running = true;
  lastTime = performance.now();
  _animId = requestAnimationFrame(animate);
}

function _stopLoop() {
  _running = false;
  if (_animId !== null) {
    cancelAnimationFrame(_animId);
    _animId = null;
  }
}

var lastTime = performance.now();

var Game = (function() {
  var STATE = { MENU: 'MENU', PLAYING: 'PLAYING', GAME_OVER: 'GAME_OVER', REPLAY: 'REPLAY', PAUSED: 'PAUSED' };
  var state = STATE.MENU;
  var gameTime = 0;
  var timer = 15, timerMax = 15;
  var score = 0, combo = 0, maxCombo = 0, totalPops = 0;
  var scoreMultiplier = 1, speedMultiplier = 1;
  var gameMode = 'classic';
  var isDesktop = !('ontouchstart' in window || navigator.maxTouchPoints > 0);
  var spawnTimer = 0;
  var ghostRecording = [];
  var ghostReplayData = null;
  var ghostReplayIndex = 0;
  var ghostReplayTime = 0;
  var lastGhost = null;
  var lastBest = 0;
  var maraMult = { speed: 1, spawn: 1 };

  var MAX_BALLOONS = 25;
  var MODES = {
    classic: { duration: 15, spawnInterval: 0.45, spawnVariance: 0.15, baseSpeed: 110, hasBombs: true, hasTimer: true, recordScore: true, name: 'Classic', desc: '15s score attack' },
    blitz: { duration: 10, spawnInterval: 0.3, spawnVariance: 0.1, baseSpeed: 130, hasBombs: true, hasTimer: true, recordScore: true, name: 'Blitz', desc: '10s frantic rush' },
    marathon: { duration: 30, spawnInterval: 0.4, spawnVariance: 0.12, baseSpeed: 100, hasBombs: true, hasTimer: true, recordScore: true, name: 'Marathon', desc: '30s escalating' },
    zen: { duration: Infinity, spawnInterval: 0.6, spawnVariance: 0.2, baseSpeed: 90, hasBombs: false, hasTimer: false, recordScore: false, name: 'Zen', desc: 'No timer, no bombs' }
  };

  function enterState() {
    switch (state) {
      case STATE.MENU:
        _stopLoop();
        UI.show('menuPanel');
        UI.showHUD(false);
        cleanupBalloons();
        break;
      case STATE.PLAYING:
        _startLoop();
        ghostRecording = [];
        ghostReplayData = null;
        var mode = MODES[gameMode] || MODES.classic;
        timer = mode.duration;
        timerMax = mode.duration;
        score = 0; combo = 0; maxCombo = 0; totalPops = 0;
        scoreMultiplier = 1; speedMultiplier = 1;
        spawnTimer = 0; gameTime = 0;
        cleanupBalloons();
        document.querySelectorAll('.ui-panel').forEach(function(el) { el.classList.add('ui-hidden'); });
        UI.showHUD(true);
        UI.updateScore(0);
        UI.updateTimer(timer);
        document.getElementById('timerDisplay').style.display = mode.hasTimer ? '' : 'none';
        UI.updateCombo(0);
        break;
      case STATE.GAME_OVER:
        if (ghostRecording.length > 0) {
          lastGhost = { events: ghostRecording.slice(), score: score, duration: gameTime };
          document.getElementById('replayBtn').style.display = '';
        }
        UI.showHUD(false);
        UI.show('gameOverPanel');
        UI.updateFinalScore(score, totalPops, maxCombo, gameTime, lastBest);
        break;
      case STATE.REPLAY:
        _startLoop();
        UI.showHUD(true);
        UI.updateTimer(timerMax);
        break;
      case STATE.PAUSED:
        UI.show('pausePanel');
        break;
    }
  }

  function cleanupBalloons() {
    for (var i = balloonMeshes.length - 1; i >= 0; i--) {
      scene.remove(balloonMeshes[i]);
    }
    balloonMeshes.length = 0;
    _rayTargets.length = 0;
    for (var i = explosions.length - 1; i >= 0; i--) {
      if (explosions[i].flash) scene.remove(explosions[i].flash);
      if (explosions[i].points) scene.remove(explosions[i].points);
    }
    explosions.length = 0;
  }

  function gameOver() {
    if (state !== STATE.PLAYING) return;
    var mode = MODES[gameMode] || MODES.classic;
    if (mode.recordScore && score > 0) {
      Storage.addScore(gameMode, score);
    }
    var stats = Storage.getStats();
    stats.totalGames = (stats.totalGames || 0) + 1;
    stats.totalPops = (stats.totalPops || 0) + totalPops;
    stats.totalTime = (stats.totalTime || 0) + Math.round(gameTime);
    if (!stats.bestScores) stats.bestScores = {};
    if (!stats.bestScores[gameMode] || score > stats.bestScores[gameMode]) stats.bestScores[gameMode] = score;
    if (!stats.modesPlayed) stats.modesPlayed = [];
    if (stats.modesPlayed.indexOf(gameMode) === -1) stats.modesPlayed.push(gameMode);
    if (totalPops > 0 && Storage.unlockAchievement('first_blood')) { playAchievementSound(); }
    if (score >= 100 && Storage.unlockAchievement('century')) { playAchievementSound(); }
    if (score >= 500 && Storage.unlockAchievement('five_hundred')) { playAchievementSound(); }
    if (maxCombo >= 10 && Storage.unlockAchievement('combo10')) { playAchievementSound(); }
    if ((stats.totalPops || 0) >= 100 && Storage.unlockAchievement('pop_100')) { playAchievementSound(); }
    Storage.updateStats(stats);
    var best = stats.bestScores[gameMode] || 0;
    state = STATE.GAME_OVER;
    lastBest = best;
    enterState();
  }

  function getMarathonMult() {
    if (gameMode !== 'marathon') return { speed: 1, spawn: 1 };
    var t = gameTime;
    if (t < 10) return { speed: 1.0, spawn: 1.0 };
    if (t < 20) return { speed: 1.15, spawn: 0.85 };
    return { speed: 1.3, spawn: 0.7 };
  }

  function updatePlaying(dt) {
    var mode = MODES[gameMode] || MODES.classic;
    gameTime += dt;
    maraMult = getMarathonMult();

    if (mode.hasTimer && timer > 0) {
      timer = Math.max(0, timer - dt);
      UI.updateTimer(timer);
      if (timer <= 3 && timer > 0 && Math.ceil(timer + dt) !== Math.ceil(timer)) {
        if (AudioEngine.getEnabled()) {
          var actx = AudioEngine.getContext();
          if (actx) {
            var osc = actx.createOscillator();
            var gain = actx.createGain();
            osc.connect(gain);
            gain.connect(actx.destination);
            osc.type = 'square';
            osc.frequency.value = 660;
            gain.gain.setValueAtTime(0.15, actx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.12);
            osc.start();
            osc.stop(actx.currentTime + 0.15);
          }
        }
      }
    }
    if (mode.hasTimer && timer <= 0) { gameOver(); return; }

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnBalloon();
      spawnTimer = ((mode.spawnInterval || 1.0) + Math.random() * (mode.spawnVariance || 0.3)) * maraMult.spawn;
    }

    updateBalloons(dt);
  }

  function updateBalloons(dt) {
    for (var i = balloonMeshes.length - 1; i >= 0; i--) {
      var mesh = balloonMeshes[i];
      var b = mesh.userData.balloon;
      if (!b || !b.active) continue;

      b.y += b.vy * speedMultiplier * maraMult.speed * dt;

      b.x = b.baseX + Math.sin(b.swayPhase + b.swayFreq * b.y * 0.01) * b.swayAmp;

      mesh.position.x = b.x - W / 2;
      mesh.position.y = b.y - H / 2;

      if (b.y > H + 100 || b.y < -200) {
        scene.remove(mesh);
        balloonMeshes.splice(i, 1);
        _rebuildRayTargets();
      }
    }
  }

  function spawnBalloon() {
    if (balloonMeshes.length >= MAX_BALLOONS) return;
    var r = Math.random();
    var type, value;
    var mode = MODES[gameMode] || MODES.classic;
    if (mode.hasBombs && r < 0.1) {
      type = 'bomb'; value = 0;
    } else if (r < 0.2) {
      type = 'question'; value = 0;
    } else {
      type = 'normal'; value = Math.floor(Math.random() * 9) + 1;
    }
    var baseX = Math.random() * W;
    new Balloon(type, value, undefined, baseX, -(20 + Math.random() * 40));
  }

  function onBalloonPop(b) {
    if (!b.active || b.popped) return;
    b.active = false;
    b.popped = true;
    totalPops++; combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (b.type === 'bomb') {
      playBombSound();
    } else {
      playPopSound();
    }
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
    if (isDesktop && MODES[gameMode] && MODES[gameMode].recordScore) {
      recordGhostClick(b.x, b.y);
    }
    triggerExplosion(b.mesh, b.type);
    scoreMultiplier = 1 + Math.floor(combo / 5) * 0.5;
    UI.updateScore(score);
    UI.updateCombo(combo);
  }

  function recordGhostClick(x, y) {
    ghostRecording.push({ t: gameTime * 1000, x: x / W, y: y / H });
  }

  function updateReplay(dt) {
    gameTime += dt;
    ghostReplayTime += dt * 1000;
    var events = ghostReplayData.events;
    while (ghostReplayIndex < events.length && events[ghostReplayIndex].t <= ghostReplayTime) {
      var ev = events[ghostReplayIndex];
      var indicator = document.createElement('div');
      indicator.style.cssText = 'position:absolute;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,0.5);pointer-events:none;z-index:55;transform:translate(-50%,-50%)';
      indicator.style.left = (ev.x * 100) + '%';
      indicator.style.top = (ev.y * 100) + '%';
      document.getElementById('gameContainer').appendChild(indicator);
      setTimeout(function() { indicator.remove(); }, 300);
      ghostReplayIndex++;
    }
    timer = Math.max(0, timerMax - gameTime);
    UI.updateTimer(timer);
    if (ghostReplayIndex >= events.length) {
      state = STATE.GAME_OVER;
      enterState();
    }
  }

  function applyQuestionEffect() {
    var effects = [
      function() { score *= 2; UI.updateScore(score); showFloatingText(W / 2, H / 2, '+x2!', '#ffa500', 36); },
      function() { score = Math.max(0, Math.floor(score / 2)); UI.updateScore(score); showFloatingText(W / 2, H / 2, '÷2!', '#6bcbff', 36); },
      function() { speedMultiplier *= 1.25; showFloatingText(W / 2, H / 2, '⇡ SPEED', '#ffa500', 36); },
      function() { speedMultiplier *= 0.8; showFloatingText(W / 2, H / 2, '⇣ SLOW', '#32cd32', 36); },
      function() { if (timer > 0) { timer = 0; showFloatingText(W / 2, H / 2, 'TIME OUT!', '#ff4444', 40); } },
      function() { score = 0; UI.updateScore(score); showFloatingText(W / 2, H / 2, 'SCORE → 0', '#dc143c', 36); }
    ];
    effects[Math.floor(Math.random() * effects.length)]();
  }

  function handleClick(clientX, clientY) {
    if (state !== STATE.PLAYING) return;
    var rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    var intersects = raycaster.intersectObjects(_rayTargets);
    if (intersects.length > 0) {
      var hit = intersects[0].object.parent.userData.balloon;
      if (hit && hit.active && !hit.popped) {
        onBalloonPop(hit);
      }
    }
  }

  return {
    init: function() {
      isDesktop = !('ontouchstart' in window || navigator.maxTouchPoints > 0);
      state = STATE.MENU;
      enterState();
    },
    startMode: function(mode) {
      gameMode = mode;
      state = STATE.PLAYING;
      enterState();
    },
    restart: function() {
      state = STATE.PLAYING;
      enterState();
    },
    goToMenu: function() {
      state = STATE.MENU;
      enterState();
    },
    togglePause: function() {
      if (state === STATE.PLAYING) { state = STATE.PAUSED; enterState(); }
      else if (state === STATE.PAUSED) {
        state = STATE.PLAYING;
        document.querySelectorAll('.ui-panel').forEach(function(el) { el.classList.add('ui-hidden'); });
        UI.showHUD(true);
        lastTime = performance.now();
      }
    },
    getMode: function() { return gameMode; },
    update: function(dt) {
      updateExplosions(dt);
      updateFloatingTexts(dt);
      switch (state) {
        case STATE.PLAYING: updatePlaying(dt); break;
        case STATE.REPLAY: updateReplay(dt); break;
      }
    },
    handleClick: handleClick,
    handleVisibility: function(hidden) {
      if (hidden && state === STATE.PLAYING) {
        state = STATE.PAUSED;
        enterState();
      }
    },
    isDesktop: function() { return isDesktop; },
    startReplay: function() {
      var ghost = lastGhost;
      if (!ghost) return;
      gameTime = 0;
      ghostReplayData = ghost;
      ghostReplayIndex = 0;
      ghostReplayTime = 0;
      timer = ghost.duration || timerMax;
      timerMax = timer;
      score = ghost.score;
      state = STATE.REPLAY;
      enterState();
    }
  };
})();

renderer.domElement.addEventListener('click', function(e) { Game.handleClick(e.clientX, e.clientY); });
renderer.domElement.addEventListener('touchstart', function(e) {
  e.preventDefault();
  var t = e.touches[0];
  Game.handleClick(t.clientX, t.clientY);
}, { passive: false });

document.getElementById('modeList').addEventListener('click', function(e) {
  var btn = e.target.closest('[data-mode]');
  if (btn) { Game.startMode(btn.dataset.mode); }
});
document.querySelectorAll('[data-panel]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var panel = this.dataset.panel;
    if (panel === 'menu') { Game.goToMenu(); }
    else {
      UI.show(panel + 'Panel');
      if (panel === 'leaderboard') renderLeaderboard('classic');
      if (panel === 'achievements') renderAchievements();
      if (panel === 'challenges') renderChallenges();
      if (panel === 'settings') renderSettings();
    }
  });
});
document.getElementById('retryBtn').addEventListener('click', function() { Game.restart(); });
document.getElementById('replayBtn').addEventListener('click', function() { Game.startReplay(); });
document.getElementById('menuBtn').addEventListener('click', function() { Game.goToMenu(); });
document.getElementById('pauseBtn').addEventListener('click', function() { Game.togglePause(); });
document.getElementById('resumeBtn').addEventListener('click', function() { Game.togglePause(); });
document.getElementById('restartBtn').addEventListener('click', function() { Game.restart(); });
document.getElementById('quitBtn').addEventListener('click', function() { Game.goToMenu(); });

document.querySelectorAll('[data-lb-tab]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    renderLeaderboard(this.dataset.lbTab);
  });
});

document.getElementById('soundToggle').addEventListener('change', function() {
  Storage.updateSettings({ soundEnabled: this.checked });
  AudioEngine.setEnabled(this.checked);
});

document.getElementById('musicToggle').addEventListener('change', function() {
  Storage.updateSettings({ musicEnabled: this.checked });
});

document.getElementById('ghostToggle').addEventListener('change', function() {
  Storage.updateSettings({ ghostEnabled: this.checked });
});

Game.init();

function animate(time) {
  if (!_running) return;
  _animId = requestAnimationFrame(animate);
  var dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  Game.update(dt);
  if (screenShake > 0) {
    var intensity = screenShake * 15;
    camera.position.x = (Math.random() - 0.5) * intensity;
    screenShake = Math.max(0, screenShake - dt * 2);
  } else {
    camera.position.x = 0;
  }
  renderer.render(scene, camera);
}
renderer.render(scene, camera);
document.addEventListener('visibilitychange', function() {
  Game.handleVisibility(document.hidden);
});
