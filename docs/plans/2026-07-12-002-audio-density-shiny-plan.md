# Plan: Audio Fix, Balloon Density, Score Labels & Shiny Material

**Date:** 2026-07-12
**Depth:** Lightweight
**Product Contract Source:** ce-plan-bootstrap (user requirements)

## Problem

1. Audio doesn't fire — `initAudio` is attached to canvas click, but canvas is covered by menu UI overlay
2. Balloon density is low (~1 spawn/s, ~6-8 on screen) — game feels empty
3. Balloon point values only shown as floating text after popping — no visible score label during flight
4. Balloon material needs to be shinier/glossier (current roughness 0.25, metalness 0.1)

## Implementation Units

All changes in `index.html` (single-file project).

### IU-1: Fix Audio Initialization

- Move `initAudio` event listener from `renderer.domElement` to `document` (`click` + `touchstart`, `{ once: true }`)
- Ensure the first user interaction anywhere on the page activates AudioContext and reads `Storage.getSettings().soundEnabled`

### IU-2: Shiny Balloon Material

- Change `MeshStandardMaterial` params in `createBalloonMesh`:
  - `roughness`: 0.25 → 0.08
  - `metalness`: 0.1 → 0.3
- Add a small `emissive` hint matching balloon hue for extra glow (optional, only if visually better)

### IU-3: Score Labels on Balloons

- In `createBalloonMesh`, generate a CanvasTexture sprite with the point value text
- Attach the sprite as a child of the balloon `Group`, positioned above the balloon mesh
- For normal balloons, show `+{value}`; for bomb show `💣` or `-30`; for question show `?`
- Sprite scales with balloon radius so larger-value balloons have slightly bigger labels

### IU-4: Higher Balloon Density

- Reduce `spawnInterval`: classic 1.0 → 0.7, blitz 0.6 → 0.5, marathon 1.0 → 0.7, zen 1.4 → 1.0
- Add a max-balloon cap of 15 — if `balloonMeshes.length >= 15`, skip spawn
- No other gameplay changes — scoring, timing, mode progression remain identical

## Dependencies & Sequencing

No external dependencies. All IUs are independent — can be implemented in any order.

## Risks

- Score label sprites might overlap or clip at high density — acceptable at this stage, may need Z-ordering if problematic
- Roughness/metalness change may look too artificial — revert if user feedback is negative

## Verification

- Open index.html, click anywhere → audio should play on pop
- Visual check: balloons should appear glossy with point value visible on each
- Play Classic mode: more balloons on screen, ~10-15 visible simultaneously
