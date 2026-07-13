---
title: "Three.js Game Code Quality: Caching, Documentation, and Style Consistency Patterns"
date: 2026-07-13
category: docs/solutions/best-practices/
module: game
problem_type: best_practice
component: development_workflow
severity: medium
applies_when:
  - Auditing or reviewing Three.js game code for performance regressions
  - Working with cached procedural textures (CanvasTexture) that are regenerated per object
  - Making assumptions about coordinate system units in Three.js projects
  - Maintaining codebases that mix ES6 class syntax with ES5 constructor patterns
tags:
  - three-js
  - caching
  - code-quality
  - performance
  - conventions
  - code-review
  - canvas-texture
  - documentation
  - style-consistency
---

# Three.js Game Code Quality: Caching, Documentation, and Style Consistency Patterns

## Context

A code audit of a Three.js 0.160 balloon-shooting game (`game.js`, single-file ES Module, no build tools) identified three distinct code quality issues: a latent performance regression from caching at the wrong granularity, a documentation gap around unit semantics for magic numbers, and a style inconsistency where ES6 `class` syntax was mixed with ES5 `function` constructors. Each represents a common pattern that surfaces in Three.js and general JavaScript codebases.

## Guidance

### 1. Cache the Expensive Object, Not Its Input

When caching GPU-related or expensive-to-create objects in Three.js, cache the **final consumable object** (e.g., `CanvasTexture`, `BufferGeometry`, `Material`), not the intermediate representation (e.g., raw `Canvas`, geometry parameters, shader source). Otherwise, a cache hit still recreates the wrapper object on every use — wasting both allocation and GC cycles.

```js
// ❌ Bad: Cache raw Canvas, recreate CanvasTexture on every hit
var _rimCache = {};
function getRimMap(hue) {
  var key = 'rim-' + hue;
  var canvas = _rimCache[key];
  if (!canvas) {
    canvas = generateRimHighlight(key);
    _rimCache[key] = canvas;
  }
  return new THREE.CanvasTexture(canvas); // new object every call
}

// ✅ Good: Cache the CanvasTexture directly
var _rimCache = {};
function getRimMap(hue) {
  var key = 'rim-' + hue;
  var tex = _rimCache[key];
  if (!tex) {
    var canvas = generateRimHighlight(key);
    tex = new THREE.CanvasTexture(canvas);
    _rimCache[key] = tex;
  }
  return tex; // reused object
}
```

The same principle applies to `DataTexture`, `BufferGeometry`, `Material` instances, and compiled `ShaderMaterial` objects — anything with a non-trivial constructor cost or GPU upload path.

### 2. Document Coordinate System Units for Magic Numbers

Three.js uses world units that are abstract — in an orthographic projection, 1 world unit may correspond to exactly 1 pixel at a certain zoom, but this is not guaranteed by the framework. When defining distances, lengths, or offsets as literal numbers, add a comment explaining:

- What unit the value is in (world units, pixels, normalized 0-1)
- What the coordinate system is (orthographic, perspective, screen-space)
- How the unit maps to visible output (e.g., "orthographic projection, so 1 unit ≈ 1 pixel at current camera setup")

```js
// ❌ Bad: Magic numbers with no unit context
var stringStartY = -radius * 1.08 - 6;
var stringLength = 32 + Math.random() * 16;

// ✅ Good: Unit context makes intent and scale clear
// stringLength: Three.js 世界单位（与场景坐标系一致，正交投影下 1 单位 ≈ 1 像素）
var stringStartY = -radius * 1.08 - 6;
var stringLength = 32 + Math.random() * 16;
```

This prevents future developers (or the same developer returning months later) from misinterpreting values as pixels, normalized coordinates, or arbitrary thresholds.

### 3. Maintain Consistent Constructor Style

When a codebase uses ES5 patterns (`var`, `function` constructors, prototype methods), adding a single ES6 `class` creates an inconsistency that raises questions about intent, tooling compatibility, and code review noise. Either commit fully to ES6 classes or maintain the ES5 convention consistently.

```js
// ❌ Bad: Mixed styles — one class in an ES5 codebase
var Balloon = function(type, value, hue, baseX, baseY) {
  this.type = type;
  // ...
};

class Balloon {
  constructor(type, value, hue, baseX, baseY) {
    this.type = type;
    // ...
  }
}

// ✅ Good: Consistent ES5 constructor (matching the rest of the codebase)
function Balloon(type, value, hue, baseX, baseY) {
  this.type = type;
  // ...
}
```

The choice between ES5 and ES6 is less important than consistency. If the project already has a dominant pattern, match it. If starting fresh with modern tooling, prefer ES6 classes. But never mix both in the same module.

## Why This Matters

- **Cache granularity**: Each `CanvasTexture` allocation triggers a GPU upload via `gl.texImage2D`. Caching only the raw Canvas means `N` balloons sharing the same hue each incur a full texture creation plus GPU upload — turning an `O(N)` operation into an `O(N²)` cost on first frame. With `CanvasTexture` caching, it's a single allocation reused across all balloons of that hue.

- **Unit documentation**: Three.js's abstract coordinate system is the most common source of layout bugs. Without explicit unit comments, a developer may adjust a "6" thinking it's pixels when it's actually world units, breaking the layout at different zoom levels or on different screen sizes.

- **Style consistency**: Mixed constructor styles make the codebase harder to grep (e.g., searching for `function Balloon` misses the `class` version), harder to refactor (tools may handle `class` and `function` prototypes differently), and introduce unnecessary cognitive friction during code review — every new `class` prompts the question "why is this one different?"

## When to Apply

- **Cache granularity**: Any Three.js code that creates textures, geometries, or materials procedurally and shares them across multiple objects — balloons, particles, instanced meshes, UI elements.
- **Unit documentation**: Any magic number representing a distance, offset, size, or coordinate in a 2D/3D scene — especially in orthographic projections where the pixel-to-unit mapping is implicit.
- **Style consistency**: Any code review or refactoring pass where a module mixes ES5 `function` constructors with ES6 `class` syntax — choose one and apply it consistently within the file or project.

## Examples

### Cache Granularity (Before/After)

**Before** — Canvas cached, CanvasTexture recreated every call:
```js
var rimCanvas = _rimCache[rimKey];
if (!rimCanvas) {
  rimCanvas = generateRimHighlight(rimKey);
  _rimCache[rimKey] = rimCanvas;
}
var rimMap = new THREE.CanvasTexture(rimCanvas);
```

**After** — CanvasTexture cached directly:
```js
var rimMap = _rimCache[rimKey];
if (!rimMap) {
  var rimCanvas = generateRimHighlight(rimKey);
  rimMap = new THREE.CanvasTexture(rimCanvas);
  _rimCache[rimKey] = rimMap;
}
```

**Impact**: With 12 balloon hue variants and 20+ balloons on screen at once, this change eliminates ~10+ redundant `CanvasTexture` creations and GPU uploads per frame.

### Unit Documentation

**Before** — no unit context for magic numbers:
```js
var stringStartY = -radius * 1.08 - 6;
var stringLength = 32 + Math.random() * 16;
```

**After** — unit context in a clear comment:
```js
// stringLength: Three.js 世界单位（与场景坐标系一致，正交投影下 1 单位 ≈ 1 像素）
var stringStartY = -radius * 1.08 - 6;
var stringLength = 32 + Math.random() * 16;
```

### Style Consistency

**Before** — mixed ES5 and ES6 in the same file:
```js
var Balloon = function(type, value, hue, baseX, baseY) {
  // ...
};
Balloon.prototype.update = function(dt) { /* ... */ };
// ... later in the same file ...
class Balloon {
  constructor(type, value, hue, baseX, baseY) {
    // ...
  }
}
```

**After** — consistent ES5 throughout:
```js
function Balloon(type, value, hue, baseX, baseY) {
  this.type = type;
  // ...
}
Balloon.prototype.update = function(dt) { /* ... */ };
```

## Related

- `docs/solutions/developer-experience/inline-js-to-external-file.md` — previous code quality work on the same game project (extraction, simplification, dead code removal)
