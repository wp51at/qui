---
title: Extracting Inline JavaScript to External File with Code Simplification
date: 2026-07-12
category: docs/solutions/developer-experience/
module: game
problem_type: developer_experience
component: development_workflow
severity: medium
applies_when:
  - HTML files contain large inline script blocks
  - Refactoring monolithic inline scripts into maintainable external files
  - Running automated code simplification on extracted code
tags:
  - javascript
  - three-js
  - code-organization
  - refactoring
  - code-quality
  - extraction
---

# Extracting Inline JavaScript to External File with Code Simplification

## Context

A Three.js balloon-popping game had all its game logic (scene setup, audio engine, storage, UI, game state machine, event handlers, animation loop) embedded as a ~1030-line inline `<script>` inside `index.html`. This monolith made the file unreadable, prevented caching of JS separately from HTML, and made tool-based code review and simplification impractical since the code was mixed with markup.

## Guidance

Extract all game logic from the inline `<script>` tag into a dedicated `game.js` file referenced via `<script src="game.js">`. With the code in a standalone file, run an automated code-simplification pass (via `ce-simplify-code`) that dispatches three parallel reviewers (code-reuse, code-quality, efficiency) and applies their findings.

Key extraction steps:
1. Copy the inline script body verbatim to `game.js`
2. Replace the inline `<script>...</script>` block with `<script src="game.js"></script>`
3. Ensure all global variables are accessible (since the code uses global scope, not modules)
4. Run automated code review and apply the resulting fixes

Specific simplifications that were applied:
- **Unified sound functions**: `playPopSound` and `playBombSound` were 90% identical (differing only in timing/gain parameters). Extracted a shared `playSound(spec)` function with a `_soundCache` map keyed by spec identity, eliminating 54 lines of duplication.
- **Extracted sphere stretch helper**: Both outer and inner balloon geometries applied the same Y-axis vertex stretch (`setY(i, getY(i) * 1.15)`). Extracted `stretchSphereY(geometry, factor)` inner function.
- **Extracted radius calculation**: The balloon radius formula (`type === 'normal' ? 40 - value * 2 : ...`) was duplicated between `createBalloonMesh` and the `Balloon` constructor. Moved to shared `getBalloonRadius(type, value)` function.
- **Removed dead code**: Eliminated unused `stateTime` variable and no-op `renderer.shadowMap.enabled = false` (already the default).
- **Encapsulated global state**: Moved `window.__lastGhost` and `window.__lastBest` into module-scoped variables inside the `Game` closure, avoiding global scope pollution.

## Why This Matters

- **Maintainability**: Separating JS from HTML follows the separation of concerns principle. The game logic can be edited, reviewed, and tested in isolation.
- **Tooling**: Code review and simplification tools can operate on a pure JS file without HTML parsing issues. The `ce-simplify-code` skill requires a clean file scope to dispatch its reviewers.
- **Caching**: Browsers can cache `game.js` independently of `index.html`, improving repeat-load performance.
- **Discoverability**: Dead code and duplicated logic become visible when reviewing a dedicated JS file rather than scrolling through a massive HTML-inlined script.

## When to Apply

- Any project with an inline `<script>` exceeding ~100 lines of application logic (as opposed to configuration or page-specific initialization)
- Before running code-quality tooling against browser JS
- When multiple developers need to review or modify the same game/application logic independently from the HTML structure

## Examples

**Before** - index.html with inline script:
```html
</div>
<script>
// ~1030 lines of game logic, scene setup, sound, storage, UI, state machine
var canvas = document.getElementById('gameCanvas');
var scene = new THREE.Scene();
// ... hundreds more lines ...
function animate(time) { ... }
animate();
</script>
</body>
```

**After** - index.html references external file:
```html
</div>
<script src="game.js"></script>
</body>
```

**Sound function unification** - Before:
```js
var _popBuffer = null;
var _bombBuffer = null;
function playPopSound() { /* 12 lines with specific parameters */ }
function playBombSound() { /* 12 lines with different parameters */ }
```

**After:**
```js
var _soundCache = {};
function playSound(spec) { /* 12 lines parameterized */ }
function playPopSound() { playSound({ key:'pop', bufferDuration:0.15, ... }); }
function playBombSound() { playSound({ key:'bomb', bufferDuration:0.3, ... }); }
```

**Global state encapsulation** - Before: `window.__lastGhost = { ... }`, `var ghost = window.__lastGhost;`
After: `lastGhost = { ... }` (module-scoped), `var ghost = lastGhost;`

## Related

- None yet — first documented solution in this project.
