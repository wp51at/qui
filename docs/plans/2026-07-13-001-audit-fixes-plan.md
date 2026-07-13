# 审计修复计划 — 3 个代码质量修正

**日期**: 2026-07-13
**目标文件**: `/Users/wp/workspace/qui/game.js`
**提交分支**: main

---

## 背景

2026-07-13 完成的全面评估审计中，30+ 条声明逐行验证后，发现 3 处表述精确度/代码质量问题需修正。本计划覆盖这 3 个修正。

---

## 修正 1：ES6/ES5 混合风格不一致

### 问题
`game.js` 全局使用 ES5 `var` 声明（var=215, let=0, const=0, function=43），但 L596 使用了 ES6 `class Balloon` 语法。这导致代码风格不一致。

### 修正方案
将 `class Balloon` (L596-L617) 转换为 ES5 风格的函数构造器 + prototype，与代码库其余部分保持一致。

**Before (L596-617)**:
```js
class Balloon {
  constructor(type, value, hue, baseX, baseY) {
    this.type = type;
    this.value = value;
    ...
  }
}
```

**After**:
```js
function Balloon(type, value, hue, baseX, baseY) {
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
```

**验证**: `new Balloon(...)` 调用点无需修改（函数构造器与 class constructor 语法兼容）。

### 影响范围
- 仅 L596-L617（class 声明块）
- 调用点无需变动

---

## 修正 2：rimCache 缓存粒度不精确

### 问题
`_rimCache` (L472) 缓存的是 `Canvas` 对象，不是 `CanvasTexture`。每次调用 `createBalloonMesh` 时（L474）都会从缓存的 Canvas 创建新的 `CanvasTexture`，造成不必要的纹理对象重复创建。

**当前代码 (L472-474)**:
```js
var rimCanvas = _rimCache[rimKey];
if (!rimCanvas) { rimCanvas = generateRimHighlight(rimKey); _rimCache[rimKey] = rimCanvas; }
var rimMap = new THREE.CanvasTexture(rimCanvas);
```

### 修正方案
将缓存改为存储 `CanvasTexture` 对象，避免每次创建纹理。

**After**:
```js
var rimMap = _rimCache[rimKey];
if (!rimMap) {
  var rimCanvas = generateRimHighlight(rimKey);
  rimMap = new THREE.CanvasTexture(rimCanvas);
  _rimCache[rimKey] = rimMap;
}
```

**注意**: `CanvasTexture` 内部引用 Canvas，Canvas 不变则纹理不变，缓存安全。

### 影响范围
- L472-474（3 行修改）

---

## 修正 3：绳子长度单位未注明

### 问题
`generateRoperope` 函数中（L509），`stringLength` 值为 `32 + Math.random() * 16`，单位是 Three.js 世界坐标单位（与场景坐标系一致），但注释中未说明。

### 修正方案
在绳子生成代码处添加注释，明确单位。

**After (L507-509)**:
```js
// 自然弯曲的绳子（参考图风格）
// stringLength: Three.js 世界单位（与场景坐标系一致，1 单位 ≈ 1 像素在正交投影下）
var stringStartY = -radius * 1.08 - 6;
var stringLength = 32 + Math.random() * 16;
```

### 影响范围
- 仅添加注释（L507 后）

---

## 实施顺序

1. 修正 2（rimCache 粒度）— 影响最小，3 行改动
2. 修正 3（单位注释）— 纯注释
3. 修正 1（class→function）— 最大改动，需确认调用点兼容
4. 逐项验证（LSP 诊断 + 浏览器测试）
5. 提交推送

## 验证清单

- [ ] `node --check game.js` 语法无误
- [ ] `lsp_diagnostics` 无新增错误
- [ ] 浏览器中游戏正常启动、气球正常显示
- [ ] rimCache 行为与修改前一致（无视觉差异）
- [ ] 绳子正常显示弯曲形态
