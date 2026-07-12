# Balloon Click 3D Redesign

## Overview
Transform the existing Balloon Score Attack game from a shooting-gallery (cannon + projectiles) to a click-to-pop 3D balloon game with realistic visuals, physics, and audio.

## Architecture

Two-layer rendering:
- **Three.js scene layer** (fullscreen): 3D balloons, lights, camera, explosion particles, floating animation
- **HTML overlay layer**: All UI (menu, HUD, pause, game over, settings, leaderboard, achievements, challenges)

Data flow:
```
Mouse click → Raycaster → hit balloon → explode anim + particles + sound → update score/combo → HUD refresh
```

Game logic (scores, timer, state machine, achievements, storage) remains from the existing `Game` module. Only rendering and input are replaced.

## Balloon 3D Model & Lighting

### Geometry
- SphereGeometry with Y-axis stretch (~1.15x) for egg/drop shape, radius 40–55
- A thin cylinder or line below as string/tether
- Balloon colors: rich variety using HSL with random hue shifts (not locked to blue)

### Materials
- MeshStandardMaterial with color, roughness 0.3, metalness 0.1
- A small bright specular highlight sprite on each balloon's surface

### Lighting
- AmbientLight: intensity 0.4
- PointLight: from upper-left, casting directional highlights
- HemisphereLight for sky/ground color blend

## Floating Animation & Physics

Each balloon has independent motion:
- **Rising**: initial upward velocity, constant upward acceleration (simulating real buoyancy)
- **Horizontal sway**: `x(t) = x0 + A * sin(ω*t + φ)` — random amplitude, frequency, phase per balloon
- **Rotation**: slow Y-axis spin (±0.3 rad/s), slight tilt during sway
- **Despawn**: balloon removed when top edge passes above canvas

## Interaction

- **Left-click / touch** on balloon → pop it
- **Raycaster** detects intersection with balloon meshes
- No more cannon, no more projectiles
- Input system simplified: just click/tap detection

## Balloon Types

| Type | Click Effect |
|------|-------------|
| Normal (value 1-9) | Pop → add score, combo++ |
| Question (?) | Random effect (same as existing: x2, /2, speed up, slow down, score→0, time out) |
| Bomb (red) | Pop → `score = max(0, score - 30)`, screen shake, no game over |

## Explosion Effects

Sequence on click:
1. Balloon scales to 1.3x (0.1s)
2. White flash (bright sprite, 0.05s)
3. Balloon shrinks to 0 and disappears
4. Particle burst: 30–50 colored fragments fly outward with gravity, fade over 0.5–1.0s
5. Floating score text appears

Bomb explosion: larger flash, 60 red-tinted particles, camera shake.

Particle details:
- Each fragment: BoxGeometry or Sprite
- Random initial velocity (spherical distribution), speed 80–200
- Gravity: `vy -= 200 * dt`
- Color from parent balloon with random variance
- Fade out over lifetime

## Audio

### Pop sound (realistic balloon burst):
- AudioBuffer filled with white noise
- Envelope: attack 0.001s → sustain 0.05s → decay 0.15s
- Low-pass filter for muted "pop" character

### Bomb sound:
- Same approach, lower pitch, longer decay (0.3s)
- Higher volume

### Other sounds:
- Question mark effect sounds, achievement jingle, timer warning — reuse existing Web Audio API oscillator-based sounds

## UI Migration

All UI moves from Canvas 2D to HTML/CSS overlay positioned above the Three.js canvas.

Elements:
- **Menu**: mode selector cards (Classic/Blitz/Marathon/Zen), bottom nav buttons (Leaderboard/Achievements/Challenges/Settings)
- **HUD**: score (top-left), timer (top-center), combo (top-right), pause button
- **Pause overlay**: semi-transparent modal with Resume/Restart/Quit
- **Game Over overlay**: score display, best score, stats, Retry/Watch Replay/Menu buttons
- **Settings/Leaderboard/Achievements/Challenges**: HTML equivalents of existing Canvas 2D panels

Color scheme: dark blue background (#16213e / #1a1a2e), gold text (#ffdd57), white text — consistent with current game.

## Game Mode Preservation

All existing modes preserved:
- Classic (15s), Blitz (10s), Marathon (30s), Zen (no timer)
- Scoring, combo, multiplier, challenge system, achievements, leaderboard, ghost recording/replay
- Ghost recording: records click positions/timing instead of cannon positions

## File Structure

Single file `index.html` — same as current. Three.js loaded via CDN `<script>` tag.
