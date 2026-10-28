// Engine core: fixed-timestep loop, scene stack, hit-stop and slow motion.
//
// Scenes are plain objects with optional hooks:
//   update(dt, isTop)  every fixed tick (only the top scene should read input)
//   render(ctx, renderer)
//   resize(w, h)
//   enter() / exit()
//   blur()      the window lost focus or the tab was hidden
//   blocksUpdate  true stops scenes below from updating
//   opaque        true stops scenes below from rendering
//
// The top scene may set `engine.cursor` (a CSS cursor) during update.

import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { perf } from './perf.js';

export class Engine {
  constructor(canvas, { step = 1 / 60 } = {}) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.input.onGesture = () => this.audio.unlock();
    this.scenes = [];
    this.step = step;
    this.acc = 0;
    this.time = 0;
    this.hitStopT = 0;
    this.slowT = 0;
    this.slowScale = 1;
    this._last = 0;
    this.cursor = 'default';
    this._frame = this._frame.bind(this);
    window.addEventListener('resize', () => this.resize());
    const blur = () => {
      for (const s of this.scenes.slice()) s.blur?.();
    };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) blur();
    });
    this.resize();
  }

  get width() {
    return this.renderer.w;
  }

  get height() {
    return this.renderer.h;
  }

  resize() {
    this.renderer.resize();
    for (const s of this.scenes) s.resize?.(this.width, this.height);
  }

  push(scene) {
    scene.engine = this;
    this.scenes.push(scene);
    scene.enter?.();
    scene.resize?.(this.width, this.height);
    return scene;
  }

  remove(scene) {
    const i = this.scenes.indexOf(scene);
    if (i >= 0) {
      this.scenes.splice(i, 1);
      scene.exit?.();
    }
  }

  top() {
    return this.scenes[this.scenes.length - 1];
  }

  // Freeze time briefly to sell a heavy hit.
  hitStop(seconds) {
    this.hitStopT = Math.max(this.hitStopT, seconds);
  }

  slowMo(scale, seconds) {
    this.slowScale = scale;
    this.slowT = Math.max(this.slowT, seconds);
  }

  start() {
    this._last = performance.now();
    requestAnimationFrame(this._frame);
  }

  _frame(now) {
    const raw = Math.max(0, (now - this._last) / 1000);
    const dt = Math.min(0.1, raw);
    this._last = now;
    if (perf.frame(raw)) this.resize();
    let scale = 1;
    if (this.hitStopT > 0) {
      this.hitStopT -= dt;
      scale = 0.08;
    } else if (this.slowT > 0) {
      this.slowT -= dt;
      scale = this.slowScale;
    }
    this.renderer.update(dt);
    this.acc += dt * scale;
    // A slow device would rather run a little slow than spend each frame
    // catching up on physics, which only makes the next frame slower.
    const maxTicks = perf.settings.maxTicks;
    let n = 0;
    while (this.acc >= this.step && n < maxTicks) {
      this._tick(this.step);
      this.acc -= this.step;
      n++;
    }
    if (n === maxTicks) this.acc = Math.min(this.acc, this.step);
    if (this.canvas.style.cursor !== this.cursor) this.canvas.style.cursor = this.cursor;
    this._render();
    requestAnimationFrame(this._frame);
  }

  _tick(dt) {
    const top = this.scenes.length - 1;
    let blocked = false;
    // Iterate over a copy: scenes may push or remove scenes while updating.
    const scenes = this.scenes.slice();
    this.cursor = 'default';
    for (let i = scenes.length - 1; i >= 0; i--) {
      const s = scenes[i];
      if (!blocked && this.scenes.includes(s)) s.update?.(dt, i === top);
      if (s.blocksUpdate) blocked = true;
    }
    this.input.endTick();
    this.time += dt;
  }

  _render() {
    const r = this.renderer;
    r.begin();
    let start = 0;
    for (let i = this.scenes.length - 1; i >= 0; i--) {
      if (this.scenes[i].opaque) {
        start = i;
        break;
      }
    }
    for (let i = start; i < this.scenes.length; i++) this.scenes[i].render?.(r.ctx, r);
  }
}
